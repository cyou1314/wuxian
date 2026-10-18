/**
 * tv-director-agent.ts — 后端 TV Director 编排 Agent
 *
 * 两种模式：
 *  - auto：解析用户文本 → 起草 17 列分镜表 → 直接在项目画布上创建/更新分镜表节点并展开
 *  - plan：只返回 ops 计划，不落地（供手动审核）
 *
 * 生成意图（"生成视频"/"第N镜生成"）会创建 queued 的 DolaTask，
 * 并以 create_generation_task toolCall 形式写入 assistant 消息，供 libtv-skills 调用。
 */
import type {
  CanvasGraph,
  CharacterAsset,
  DirectorOp,
  DolaTask,
  StoryboardRow,
  ToolCall,
} from "@/types/libtv-schema";
import { formatCharacterDesc } from "@/types/libtv-schema";
import { scanMentions } from "./autolink-engine";
import { compileImagePrompt, compileVideoMotion } from "./prompt-compiler";
import { expandRowsToNodes } from "./storyboard-expand";

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

/**
 * 从用户文本解析分镜条目：优先识别编号行（"1. …"/"1、…"），
 * 否则按段落切分，最后兜底为整段一镜。
 */
export function parseShots(text: string): string[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const numbered = lines
    .map((l) => /^\s*\d+\s*[.、:：)）\s]\s*(.+)$/.exec(l)?.[1]?.trim())
    .filter((x): x is string => !!x);
  if (numbered.length >= 2) return numbered;
  const paras = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= 4);
  if (paras.length > 0) return paras;
  const single = text.replace(/\s+/g, " ").trim();
  return single ? [single] : [];
}

function charDescOf(c: CharacterAsset): string {
  return formatCharacterDesc({
    name: c.name,
    age: c.age,
    hairstyle: c.hairstyle,
    outfit: c.outfit,
    props: c.props,
    facial: c.facial,
    aura: c.aura,
  });
}

/** 按 7+5 公式为每条分镜起草完整的 17 列行 */
export function draftStoryboardRows(
  shots: string[],
  characters: CharacterAsset[],
): StoryboardRow[] {
  const byId = new Map(characters.map((c) => [c.id, c]));
  return shots.map((desc, i) => {
    const mentions = scanMentions(desc, characters);
    const chars = mentions
      .slice(0, 2)
      .map((m) => byId.get(m.characterId))
      .filter((c): c is CharacterAsset => !!c);
    const charField = chars.map((c) => `${c.name}: ${charDescOf(c)}`).join("；");
    const imagePrompt = compileImagePrompt({
      composition: { shotSize: "中景", angle: "平视" },
      character: charField || "（空镜，无人物）",
      spatialRelation: desc,
      microExpression: "",
      environment: desc,
      lighting: "",
      style: { artStyle: "电影质感", focalLength: "35mm镜头", aperture: "f/2.8" },
    });
    const videoMotionPrompt = compileVideoMotion({
      cameraMove: "缓慢前推",
      subjectAction: desc,
      envDynamics: "",
      audio: "",
      duration: "4.0s",
    });
    return {
      shotNo: String(i + 1),
      duration: 4,
      description: desc,
      char1Name: chars[0]?.name ?? "",
      char1Desc: chars[0] ? charDescOf(chars[0]) : "",
      char1Image: "",
      char2Name: chars[1]?.name ?? "",
      char2Desc: chars[1] ? charDescOf(chars[1]) : "",
      char2Image: "",
      reference: "",
      shotSize: "中景",
      emotion: "",
      lighting: "",
      sfx: "",
      dialogue: "",
      imagePrompt,
      videoMotionPrompt,
    };
  });
}

export interface DirectorRunResult {
  graph: CanvasGraph;
  ops: DirectorOp[];
  resolvedPrompt?: string;
  summary: string;
  toolCalls: ToolCall[];
  tasks: DolaTask[];
}

/**
 * 在项目画布上运行一次 Director。
 * mode=auto 直接落地 ops；mode=plan 只返回计划。
 */
export function runDirector(opts: {
  graph: CanvasGraph;
  text: string;
  characters: CharacterAsset[];
  mode: "auto" | "plan";
}): DirectorRunResult {
  const { graph, text, characters, mode } = opts;
  const shots = parseShots(text);
  if (shots.length === 0) {
    return {
      graph,
      ops: [],
      summary: "未从消息中识别到分镜内容，未做任何修改。",
      toolCalls: [],
      tasks: [],
    };
  }

  const rows = draftStoryboardRows(shots, characters);
  let tableNode = graph.nodes.find((n) => n.type === "storyboardTable");
  let tableNodeId = tableNode?.id;
  const nextGraph: CanvasGraph = {
    nodes: graph.nodes.map((n) => ({ ...n })),
    edges: graph.edges.map((e) => ({ ...e })),
  };
  if (!tableNodeId) {
    tableNodeId = `table-director-${Date.now().toString(36)}`;
    nextGraph.nodes.push({
      id: tableNodeId,
      type: "storyboardTable",
      position: { x: 40, y: 40 },
      data: { kind: "storyboardTable", rows, approved: false },
      stale: false,
    });
  } else {
    const t = nextGraph.nodes.find((n) => n.id === tableNodeId);
    if (t && t.data.kind === "storyboardTable") t.data.rows = rows;
  }

  const ops: DirectorOp[] = [
    { op: "upsertStoryboardTable", nodeId: tableNodeId, rows },
    { op: "expandStoryboardToNodes", tableNodeId },
  ];

  if (mode === "auto") {
    const table = nextGraph.nodes.find((n) => n.id === tableNodeId);
    const { nodes, edges } = expandRowsToNodes({
      tableNodeId,
      tablePosition: table?.position ?? { x: 40, y: 40 },
      rows,
      characters,
    });
    const ids = new Set(nextGraph.nodes.map((n) => n.id));
    for (const n of nodes) {
      if (!ids.has(n.id)) {
        nextGraph.nodes.push(n);
        ids.add(n.id);
      }
    }
    const eids = new Set(nextGraph.edges.map((e) => e.id));
    for (const e of edges) {
      if (!eids.has(e.id)) {
        nextGraph.edges.push(e);
        eids.add(e.id);
      }
    }
  }

  // 生成意图：创建 queued DolaTask + toolCall
  const toolCalls: ToolCall[] = [];
  const tasks: DolaTask[] = [];
  const genMatch = /第\s*(\d+)\s*镜/.exec(text);
  if (/生成.*?(视频|分镜视频)|做.*视频|渲染/.test(text)) {
    const targetIdx = genMatch ? parseInt(genMatch[1], 10) - 1 : 0;
    const row = rows[Math.max(0, Math.min(targetIdx, rows.length - 1))];
    if (row) {
      const task: DolaTask = {
        id: newId("task"),
        kind: "video",
        prompt: row.videoMotionPrompt,
        model: "seedance_v2.0",
        duration: row.duration,
        ratio: "16:9",
        accountId: "",
        status: "queued",
        createdAt: Date.now(),
      };
      tasks.push(task);
      toolCalls.push({
        id: newId("call"),
        type: "function",
        function: {
          name: "create_generation_task",
          arguments: JSON.stringify({
            taskId: task.id,
            kind: "video",
            shotNo: row.shotNo,
            prompt: row.videoMotionPrompt,
            model: task.model,
            duration: task.duration,
            ratio: task.ratio,
            resolvedPrompt: row.videoMotionPrompt,
            resultUrl: null,
          }),
        },
      });
    }
  }

  const resolvedPrompt = rows[0]?.imagePrompt;
  const summary =
    `TV Director 已${mode === "auto" ? "创建" : "规划"} ${rows.length} 镜分镜表` +
    (mode === "auto" ? "并展开为画布节点" : "（待手动审核）") +
    (tasks.length > 0 ? `；已创建 ${tasks.length} 个视频生成任务（queued）。` : "。");

  return { graph: nextGraph, ops, resolvedPrompt, summary, toolCalls, tasks };
}
