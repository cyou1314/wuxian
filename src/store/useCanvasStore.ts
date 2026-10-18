/**
 * useCanvasStore.ts — 画布图谱 Store（Phase 2）
 *
 * zustand + immer（不可变更新）+ zundo（50 步 Undo/Redo）+ IndexedDB 持久化。
 * State：graph（Nodes/Edges）、characters、storyboardRows、sessions。
 */

import { create } from "zustand";
import { useStore } from "zustand";
import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import type {
  CanvasEdge,
  CanvasGraph,
  CanvasNode,
  CanvasNodeData,
  CharacterAsset,
  OpenAPISession,
  SessionMessage,
  StoryboardRow,
} from "@/types/libtv-schema";
import { buildSeedGraph, SEED_CHARACTERS } from "./seed";
import { applyAutoLink } from "@/lib/autolink-engine";
import { markStale } from "@/lib/dag-scheduler";

// ---------------------------------------------------------------------------
// 数据快照（持久化与历史栈只存这些字段，不含 actions）
// ---------------------------------------------------------------------------

export interface CanvasSnapshot {
  graph: CanvasGraph;
  characters: CharacterAsset[];
  storyboardRows: StoryboardRow[];
  sessions: OpenAPISession[];
  activeSessionId: string | null;
}

function pickSnapshot(s: CanvasStore): CanvasSnapshot {
  return {
    graph: s.graph,
    characters: s.characters,
    storyboardRows: s.storyboardRows,
    sessions: s.sessions,
    activeSessionId: s.activeSessionId,
  };
}

// ---------------------------------------------------------------------------
// Store 定义
// ---------------------------------------------------------------------------

export interface CanvasStore extends CanvasSnapshot {
  // -- 图谱 --
  setGraph: (graph: CanvasGraph) => void;
  upsertNode: (node: CanvasNode) => void;
  patchNodeData: (nodeId: string, patch: Record<string, unknown>) => void;
  removeNodes: (ids: string[]) => void;
  addEdge: (edge: CanvasEdge) => void;
  removeEdges: (ids: string[]) => void;
  /** 上游修改：级联标记下游 stale */
  touchNode: (nodeId: string) => void;

  // -- 角色 --
  upsertCharacter: (c: CharacterAsset) => void;

  // -- 分镜表 --
  setStoryboardRows: (rows: StoryboardRow[]) => void;
  patchStoryboardRow: (index: number, patch: Partial<StoryboardRow>) => void;
  approveStoryboard: (approved: boolean) => void;
  /** 按行展开为 ShotImageNode + VideoGenNode（行列布局），返回新建节点 id */
  expandStoryboard: (tableNodeId: string) => string[];
  /** 对某节点文本跑 AutoLink：建引用边 + 绑定槽位 */
  autoLinkNode: (nodeId: string, text: string) => void;

  // -- 会话（OpenAPI） --
  createSession: (projectUuid: string) => OpenAPISession;
  appendMessage: (
    sessionId: string,
    msg: Omit<SessionMessage, "seq" | "createdAt">,
  ) => SessionMessage | null;
  setActiveSession: (sessionId: string | null) => void;
}

const seed = buildSeedGraph();

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export const useCanvasStore = create<CanvasStore>()(
  temporal(
    immer((set, get) => ({
      graph: seed.graph,
      characters: SEED_CHARACTERS,
      storyboardRows: seed.rows,
      sessions: [],
      activeSessionId: null,

      setGraph: (graph) =>
        set((s) => {
          s.graph = graph;
        }),

      upsertNode: (node) =>
        set((s) => {
          const i = s.graph.nodes.findIndex((n) => n.id === node.id);
          if (i >= 0) s.graph.nodes[i] = node;
          else s.graph.nodes.push(node);
        }),

      patchNodeData: (nodeId, patch) =>
        set((s) => {
          const n = s.graph.nodes.find((x) => x.id === nodeId);
          if (n) Object.assign(n.data as Record<string, unknown>, patch);
        }),

      removeNodes: (ids) =>
        set((s) => {
          const gone = new Set(ids);
          s.graph.nodes = s.graph.nodes.filter((n) => !gone.has(n.id));
          s.graph.edges = s.graph.edges.filter(
            (e) => !gone.has(e.source) && !gone.has(e.target),
          );
        }),

      addEdge: (edge) =>
        set((s) => {
          if (!s.graph.edges.some((e) => e.id === edge.id)) s.graph.edges.push(edge);
        }),

      removeEdges: (ids) =>
        set((s) => {
          const gone = new Set(ids);
          s.graph.edges = s.graph.edges.filter((e) => !gone.has(e.id));
        }),

      touchNode: (nodeId) =>
        set((s) => {
          s.graph = markStale(s.graph, [nodeId]);
        }),

      upsertCharacter: (c) =>
        set((s) => {
          const i = s.characters.findIndex((x) => x.id === c.id);
          if (i >= 0) s.characters[i] = c;
          else s.characters.push(c);
        }),

      setStoryboardRows: (rows) =>
        set((s) => {
          s.storyboardRows = rows;
          // 同步到分镜表节点
          for (const n of s.graph.nodes) {
            if (n.type === "storyboardTable" && n.data.kind === "storyboardTable") {
              n.data.rows = rows;
            }
          }
        }),

      patchStoryboardRow: (index, patch) =>
        set((s) => {
          const row = s.storyboardRows[index];
          if (row) Object.assign(row, patch);
        }),

      approveStoryboard: (approved) =>
        set((s) => {
          for (const n of s.graph.nodes) {
            if (n.type === "storyboardTable" && n.data.kind === "storyboardTable") {
              n.data.approved = approved;
            }
          }
        }),

      expandStoryboard: (tableNodeId) => {
        const st = get();
        const table = st.graph.nodes.find((n) => n.id === tableNodeId);
        if (!table || table.data.kind !== "storyboardTable") return [];
        const rows = table.data.rows;
        const created: string[] = [];
        const baseX = table.position.x + 700;
        const baseY = table.position.y;

        // 先收集本次要写入的变更，单次 set 完成（一次历史记录）
        const newNodes: CanvasNode[] = [];
        const newEdges: CanvasEdge[] = [];
        rows.forEach((row, i) => {
          const shotId = `shot-${tableNodeId}-${i}`;
          const videoId = `video-${tableNodeId}-${i}`;
          const x = baseX + i * 360;
          const shotData: CanvasNodeData = {
            kind: "shotImage",
            shotNo: row.shotNo || String(i + 1),
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
          newNodes.push({
            id: shotId,
            type: "shotImage",
            position: { x, y: baseY },
            data: shotData,
            stale: false,
          });
          newNodes.push({
            id: videoId,
            type: "videoGen",
            position: { x, y: baseY + 400 },
            data: {
              kind: "videoGen",
              shotNo: row.shotNo || String(i + 1),
              motionAST: {
                cameraMove: "",
                subjectAction: row.description,
                envDynamics: "",
                audio: row.sfx,
                duration: `${row.duration.toFixed(1)}s`,
              },
              rawPrompt: false,
              engine: "dola",
              reshootRanges: [],
            },
            stale: false,
          });
          newEdges.push({
            id: `e-${tableNodeId}-${shotId}`,
            type: "dataflow",
            source: tableNodeId,
            target: shotId,
          });
          newEdges.push({
            id: `e-${shotId}-${videoId}`,
            type: "dataflow",
            source: shotId,
            target: videoId,
          });
          created.push(shotId, videoId);

          // AutoLink：按角色名在行文本中建引用边
          const haystack = `${row.char1Name} ${row.char2Name} ${row.description} ${row.dialogue}`;
          const link = applyAutoLink(
            shotId,
            haystack,
            st.characters,
            {},
            newEdges,
          );
          newEdges.push(...link.newEdges);
          const merged = link.slotBindings.reduce(
            (acc, b) => ({ ...acc, ...b.slots }),
            {},
          );
          if (Object.keys(merged).length > 0 && shotData.kind === "shotImage") {
            shotData.referenceSlots = {
              ...shotData.referenceSlots,
              ...merged,
            };
          }
        });

        set((s) => {
          s.graph.nodes.push(...newNodes);
          for (const e of newEdges) {
            if (!s.graph.edges.some((x) => x.id === e.id)) s.graph.edges.push(e);
          }
        });
        return created;
      },

      autoLinkNode: (nodeId, text) =>
        set((s) => {
          const node = s.graph.nodes.find((n) => n.id === nodeId);
          if (!node) return;
          const currentSlots =
            node.data.kind === "shotImage" ? node.data.referenceSlots : {};
          const result = applyAutoLink(nodeId, text, s.characters, currentSlots, s.graph.edges);
          for (const e of result.newEdges) {
            if (!s.graph.edges.some((x) => x.id === e.id)) s.graph.edges.push(e);
          }
          if (node.data.kind === "shotImage" && result.slotBindings.length > 0) {
            const merged = result.slotBindings.reduce(
              (acc, b) => ({ ...acc, ...b.slots }),
              { ...node.data.referenceSlots },
            );
            node.data.referenceSlots = merged;
          }
        }),

      createSession: (projectUuid) => {
        const session: OpenAPISession = {
          sessionId: `ses-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`,
          projectUuid,
          messages: [],
          nextSeq: 1,
        };
        set((s) => {
          s.sessions.push(session);
          s.activeSessionId = session.sessionId;
        });
        return session;
      },

      appendMessage: (sessionId, msg) => {
        const st = get();
        const sess = st.sessions.find((x) => x.sessionId === sessionId);
        if (!sess) return null;
        const full: SessionMessage = {
          ...msg,
          seq: sess.nextSeq,
          createdAt: Date.now(),
        };
        set((s) => {
          const target = s.sessions.find((x) => x.sessionId === sessionId);
          if (target) {
            target.messages.push(full);
            target.nextSeq += 1;
          }
        });
        return full;
      },

      setActiveSession: (sessionId) =>
        set((s) => {
          s.activeSessionId = sessionId;
        }),
    })),
    {
      limit: 50,
      partialize: (s) => pickSnapshot(s as CanvasStore),
    },
  ),
);

// ---------------------------------------------------------------------------
// Undo / Redo 快捷导出
// ---------------------------------------------------------------------------

export function undoCanvas(): void {
  useCanvasStore.temporal.getState().undo();
}

export function redoCanvas(): void {
  useCanvasStore.temporal.getState().redo();
}

export function useCanUndo(): boolean {
  return useStore(useCanvasStore.temporal, (s) => s.pastStates.length > 0);
}

export function useCanRedo(): boolean {
  return useStore(useCanvasStore.temporal, (s) => s.futureStates.length > 0);
}

// ---------------------------------------------------------------------------
// IndexedDB 持久化（浏览器端；SQLite 服务端持久化在 Phase 5 API 路由实现）
// ---------------------------------------------------------------------------

const IDB_DB = "wuxian";
const IDB_STORE = "kv";
const IDB_KEY = "canvas-snapshot-v1";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: CanvasSnapshot): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function idbGet(key: string): Promise<CanvasSnapshot | null> {
  const db = await openDb();
  try {
    return await new Promise<CanvasSnapshot | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve((req.result as CanvasSnapshot | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** 浏览器端自动接线：启动时恢复快照，变更后防抖 800ms 写入 */
if (typeof window !== "undefined" && typeof indexedDB !== "undefined") {
  void idbGet(IDB_KEY).then((snap) => {
    if (snap && Array.isArray(snap.graph?.nodes)) {
      useCanvasStore.setState(pickSnapshot({ ...useCanvasStore.getState(), ...snap }));
    }
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  useCanvasStore.subscribe((s) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void idbSet(IDB_KEY, pickSnapshot(s)).catch(() => {
        /* 持久化失败不阻塞编辑 */
      });
    }, 800);
  });
}
