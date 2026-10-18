/**
 * storyboard-expand.ts — 分镜表按行展开为画布节点的纯函数
 *
 * 被两处共用：客户端 useCanvasStore.expandStoryboard 与
 * 服务端 tv-director-agent 的 DirectorOp 落地。行列布局 + AutoLink。
 */
import type {
  CanvasEdge,
  CanvasNode,
  CanvasNodeData,
  CharacterAsset,
  StoryboardRow,
  Vec2,
} from "@/types/libtv-schema";
import { applyAutoLink } from "./autolink-engine";

export interface ExpandResult {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

/**
 * 将分镜表行展开为 ShotImageNode + VideoGenNode（行列布局）。
 * 每行生成：分镜节点（上）+ 视频节点（下），表节点→分镜→视频的数据流边，
 * 以及按角色名命中的 AutoLink 引用边与槽位绑定。
 */
export function expandRowsToNodes(opts: {
  tableNodeId: string;
  tablePosition: Vec2;
  rows: StoryboardRow[];
  characters: CharacterAsset[];
}): ExpandResult {
  const { tableNodeId, tablePosition, rows, characters } = opts;
  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];
  const baseX = tablePosition.x + 700;
  const baseY = tablePosition.y;

  rows.forEach((row, i) => {
    const shotId = `shot-${tableNodeId}-${i}`;
    const videoId = `video-${tableNodeId}-${i}`;
    const x = baseX + i * 360;
    const shotNo = row.shotNo || String(i + 1);

    const shotData: CanvasNodeData = {
      kind: "shotImage",
      shotNo,
      previewSize: { w: 2752, h: 1536 },
      imagePromptAST: {
        composition: { shotSize: row.shotSize, angle: "平视" },
        character: [row.char1Name, row.char2Name].filter(Boolean).join("；"),
        spatialRelation: row.description,
        microExpression: "",
        environment: row.description,
        lighting: row.lighting,
        style: { artStyle: "电影质感", focalLength: "35mm镜头", aperture: "f/2.8" },
      },
      rawPrompt: false,
      referenceSlots: {},
      rowRef: { tableNodeId, rowIndex: i },
    };
    nodes.push({ id: shotId, type: "shotImage", position: { x, y: baseY }, data: shotData, stale: false });
    nodes.push({
      id: videoId,
      type: "videoGen",
      position: { x, y: baseY + 400 },
      data: {
        kind: "videoGen",
        shotNo,
        motionAST: {
          cameraMove: "",
          subjectAction: row.description,
          envDynamics: "",
          audio: row.sfx,
          duration: `${Number(row.duration || 4).toFixed(1)}s`,
        },
        rawPrompt: false,
        engine: "dola",
        reshootRanges: [],
      },
      stale: false,
    });
    edges.push({ id: `e-${tableNodeId}-${shotId}`, type: "dataflow", source: tableNodeId, target: shotId });
    edges.push({ id: `e-${shotId}-${videoId}`, type: "dataflow", source: shotId, target: videoId });

    // AutoLink：按角色名在行文本中建引用边 + 槽位绑定
    const haystack = `${row.char1Name} ${row.char2Name} ${row.description} ${row.dialogue}`;
    const link = applyAutoLink(shotId, haystack, characters, {}, edges);
    edges.push(...link.newEdges);
    const merged = link.slotBindings.reduce(
      (acc, b) => ({ ...acc, ...b.slots }),
      {} as Record<string, string | undefined>,
    );
    if (Object.keys(merged).length > 0 && shotData.kind === "shotImage") {
      shotData.referenceSlots = { ...shotData.referenceSlots, ...merged };
    }
  });

  return { nodes, edges };
}
