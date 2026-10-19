"use client";
import DesktopProjectControls from "./DesktopProjectControls";
import DesktopAccountsPanel from "./DesktopAccountsPanel";

/**
 * InfiniteCanvasWorkbench — 无限画布工作台主视口（Phase 5）
 *
 * React Flow v12：视口虚拟化裁剪、Minimap、双击画布建节点菜单、
 * Delete 删除、方向键微调、Shift 框选、Ctrl+C/V 跨子图复制粘贴、
 * 顶栏（撤销/账号/任务/导出）、左侧资产抽屉、节点双击进精修台。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  useCanvasStore,
  undoCanvas,
  redoCanvas,
  useCanUndo,
  useCanRedo,
} from "@/store/useCanvasStore";
import { useUIStore } from "@/store/useUIStore";
import { useTaskStore } from "@/store/useTaskStore";
import type {
  CanvasEdge,
  CanvasGraph,
  CanvasNode,
  CanvasNodeData,
  CharacterAsset,
  LibTVNodeType,
} from "@/types/libtv-schema";

import RoleStudioNode from "../nodes/RoleStudioNode";
import ScriptEditorNode from "../nodes/ScriptEditorNode";
import StoryboardTableNode from "../nodes/StoryboardTableNode";
import ShotImageNode from "../nodes/ShotImageNode";
import VideoGenNode from "../nodes/VideoGenNode";
import LayerSplitNode from "../nodes/LayerSplitNode";
import ThreeDBoxNode from "../nodes/ThreeDBoxNode";
import SmartClipNode from "../nodes/SmartClipNode";
import DataFlowEdge from "./edges/DataFlowEdge";
import AutoLinkRefEdge from "./edges/AutoLinkRefEdge";
import GridSplitterModal from "../modals/GridSplitterModal";
import FrameBreakdownModal from "../modals/FrameBreakdownModal";
import DirectorInspectorDrawer from "../inspector/DirectorInspectorDrawer";
import AccountsPanel from "./AccountsPanel";
import TaskQueuePanel from "./TaskQueuePanel";

const nodeTypes = {
  roleStudio: RoleStudioNode,
  scriptEditor: ScriptEditorNode,
  storyboardTable: StoryboardTableNode,
  shotImage: ShotImageNode,
  videoGen: VideoGenNode,
  layerSplit: LayerSplitNode,
  threeDBox: ThreeDBoxNode,
  smartClip: SmartClipNode,
};

const edgeTypes = {
  dataflow: DataFlowEdge,
  autolink: AutoLinkRefEdge,
};

const NODE_TYPE_META: Array<{ type: LibTVNodeType; label: string }> = [
  { type: "roleStudio", label: "角色造型室" },
  { type: "scriptEditor", label: "剧本编辑器" },
  { type: "storyboardTable", label: "17列分镜总表" },
  { type: "shotImage", label: "分镜画面" },
  { type: "videoGen", label: "视频生成" },
  { type: "layerSplit", label: "图层分离" },
  { type: "threeDBox", label: "3D-BOX 预演" },
  { type: "smartClip", label: "智能剪辑" },
];

// ---------------------------------------------------------------------------
// 映射与工厂
// ---------------------------------------------------------------------------

function toXYNode(n: CanvasNode): Node {
  return {
    id: n.id,
    type: n.type,
    position: n.position,
    data: { ...n.data, stale: n.stale } as Record<string, unknown>,
  };
}

function toXYEdge(e: CanvasEdge, graph: CanvasGraph): Edge {
  return {
    id: e.id,
    type: e.type,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? undefined,
    targetHandle: e.targetHandle ?? undefined,
    data: {
      characterId: e.characterId,
      stale: graph.nodes.find((n) => n.id === e.target)?.stale ?? false,
    },
  };
}

function xyToCanvas(n: Node): CanvasNode {
  const { stale: _stale, ...data } = n.data as Record<string, unknown>;
  void _stale;
  return {
    id: n.id,
    type: n.type as LibTVNodeType,
    position: n.position,
    data: data as unknown as CanvasNodeData,
    stale: false,
  };
}

function blankNodeData(type: LibTVNodeType): CanvasNodeData {
  switch (type) {
    case "roleStudio":
      return { kind: "roleStudio", characterId: "", views: {} };
    case "scriptEditor":
      return { kind: "scriptEditor", original: "", adapted: "", conflicts: [], foreshadows: [] };
    case "storyboardTable":
      return { kind: "storyboardTable", rows: [], approved: false };
    case "shotImage":
      return {
        kind: "shotImage",
        shotNo: "新",
        previewSize: { w: 2752, h: 1536 },
        imagePromptAST: {
          composition: { shotSize: "", angle: "" },
          character: "",
          spatialRelation: "",
          microExpression: "",
          environment: "",
          lighting: "",
          style: { artStyle: "", focalLength: "", aperture: "" },
        },
        rawPrompt: false,
        referenceSlots: {},
      };
    case "videoGen":
      return {
        kind: "videoGen",
        shotNo: "新",
        motionAST: { cameraMove: "", subjectAction: "", envDynamics: "", audio: "", duration: "" },
        rawPrompt: false,
        engine: "dola",
        reshootRanges: [],
      };
    case "layerSplit":
      return { kind: "layerSplit", sourceImageUrl: "", layers: [] };
    case "threeDBox":
      return { kind: "threeDBox", sceneJson: "{}", cameraMoves: [] };
    case "smartClip":
      return { kind: "smartClip", sourceVideoNodeIds: [], trimSilence: true, subtitles: true, bgmCuePoints: [] };
  }
}

// ---------------------------------------------------------------------------
// 工作台内部（需在 ReactFlowProvider 内）
// ---------------------------------------------------------------------------

function WorkbenchInner() {
  const graph = useCanvasStore((s) => s.graph);
  const characters = useCanvasStore((s) => s.characters);
  const upsertNode = useCanvasStore((s) => s.upsertNode);
  const removeNodes = useCanvasStore((s) => s.removeNodes);
  const addEdge = useCanvasStore((s) => s.addEdge);
  const removeEdges = useCanvasStore((s) => s.removeEdges);
  const upsertCharacter = useCanvasStore((s) => s.upsertCharacter);
  const openInspector = useUIStore((s) => s.openInspector);
  const queuedCount = useTaskStore((s) => s.tasks.filter((t) => t.status === "queued").length);
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [showAccounts, setShowAccounts] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    flowX: number;
    flowY: number;
  } | null>(null);

  const { screenToFlowPosition, getNodes } = useReactFlow();
  const graphRef = useRef(graph);
  graphRef.current = graph;
  const lastPaneClick = useRef(0);

  // store → 画布单向同步（拖拽等本地交互不写 store，不触发回环）
  useEffect(() => {
    setNodes(graph.nodes.map(toXYNode));
    setEdges(graph.edges.map((e) => toXYEdge(e, graph)));
  }, [graph, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;
      addEdge({
        id: `e-${params.source}-${params.target}-${Date.now().toString(36)}`,
        type: "dataflow",
        source: params.source,
        target: params.target,
        sourceHandle: params.sourceHandle,
        targetHandle: params.targetHandle,
      });
    },
    [addEdge],
  );

  const onNodesDelete = useCallback(
    (deleted: Node[]) => removeNodes(deleted.map((n) => n.id)),
    [removeNodes],
  );
  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => removeEdges(deleted.map((e) => e.id)),
    [removeEdges],
  );

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_e, _node, dragged) => {
      for (const n of dragged) {
        const c = graphRef.current.nodes.find((x) => x.id === n.id);
        if (c) upsertNode({ ...c, position: n.position });
      }
    },
    [upsertNode],
  );

  // 双击画布空白处 → 建节点菜单（坐标转换）
  const onPaneClick = useCallback(
    (e: React.MouseEvent) => {
      const now = Date.now();
      if (now - lastPaneClick.current < 350) {
        const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        setMenu({ x: e.clientX, y: e.clientY, flowX: p.x, flowY: p.y });
        lastPaneClick.current = 0;
      } else {
        lastPaneClick.current = now;
        setMenu(null);
      }
    },
    [screenToFlowPosition],
  );

  const createNode = useCallback(
    (type: LibTVNodeType, x: number, y: number) => {
      const id = `node-${Date.now().toString(36)}`;
      if (type === "roleStudio") {
        const charId = `char-${Date.now().toString(36)}`;
        const c: CharacterAsset = {
          id: charId,
          name: `新角色${characters.length + 1}`,
          age: "",
          hairstyle: "",
          outfit: "",
          props: "",
          facial: "",
          aura: "",
          views: {},
          roleNodeId: id,
        };
        upsertCharacter(c);
        upsertNode({
          id,
          type,
          position: { x, y },
          data: { kind: "roleStudio", characterId: charId, views: {} },
          stale: false,
        });
      } else {
        upsertNode({ id, type, position: { x, y }, data: blankNodeData(type), stale: false });
      }
      setMenu(null);
    },
    [upsertNode, upsertCharacter, characters.length],
  );

  // 键盘：Delete 删除选中；方向键微调；Ctrl+C/V 复制粘贴（输入框内不触发）
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable) {
        return;
      }
      const selected = getNodes().filter((n) => n.selected);
      if (e.key === "Delete") {
        if (selected.length > 0) {
          removeNodes(selected.map((n) => n.id));
          e.preventDefault();
        }
        return;
      }
      if (e.key.startsWith("Arrow")) {
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        for (const n of selected) {
          const c = graphRef.current.nodes.find((x) => x.id === n.id);
          if (c) upsertNode({ ...c, position: { x: c.position.x + dx, y: c.position.y + dy } });
        }
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        if (selected.length === 0) return;
        const ids = new Set(selected.map((n) => n.id));
        const payload = {
          nodes: selected.map(xyToCanvas),
          edges: graphRef.current.edges.filter((x) => ids.has(x.source) && ids.has(x.target)),
        };
        void navigator.clipboard.writeText(JSON.stringify(payload));
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        void navigator.clipboard.readText().then((text) => {
          try {
            const payload = JSON.parse(text) as { nodes: CanvasNode[]; edges: CanvasEdge[] };
            if (!Array.isArray(payload.nodes)) return;
            const idMap = new Map<string, string>();
            for (const n of payload.nodes) {
              const nid = `node-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;
              idMap.set(n.id, nid);
              upsertNode({ ...n, id: nid, position: { x: n.position.x + 48, y: n.position.y + 48 }, stale: false });
            }
            for (const edge of payload.edges ?? []) {
              const s = idMap.get(edge.source);
              const t2 = idMap.get(edge.target);
              if (s && t2) {
                addEdge({
                  ...edge,
                  id: `e-${s}-${t2}-${Date.now().toString(36)}`,
                  source: s,
                  target: t2,
                });
              }
            }
          } catch {
            /* 剪贴板非节点数据，忽略 */
          }
        });
        e.preventDefault();
      }
    },
    [getNodes, removeNodes, upsertNode, addEdge],
  );

  const exportProject = () => {
    const s = useCanvasStore.getState();
    const blob = new Blob(
      [JSON.stringify({ graph: s.graph, characters: s.characters, storyboardRows: s.storyboardRows }, null, 2)],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `wuxian-project-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const addCharacter = () => {
    const idx = characters.length + 1;
    const charId = `char-${Date.now().toString(36)}`;
    const nodeId = `role-${Date.now().toString(36)}`;
    upsertCharacter({
      id: charId,
      name: `新角色${idx}`,
      age: "",
      hairstyle: "",
      outfit: "",
      props: "",
      facial: "",
      aura: "",
      views: {},
      roleNodeId: nodeId,
    });
    upsertNode({
      id: nodeId,
      type: "roleStudio",
      position: { x: -480, y: 640 + characters.length * 200 },
      data: { kind: "roleStudio", characterId: charId, views: {} },
      stale: false,
    });
  };

  return (
    <div className="relative h-screen w-full" onKeyDown={onKeyDown} tabIndex={0}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={onPaneClick}
        onNodeDoubleClick={(_e, node) => openInspector(node.id)}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onlyRenderVisibleElements
        deleteKeyCode={null}
        minZoom={0.2}
        className="bg-[#0b0d12]"
      >
        <Background gap={24} color="#1c2130" />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>

      {window.wuxianDesktop && <DesktopProjectControls />}

      {/* 顶栏 */}
      <div className="absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-[#2a2f3d] bg-[#12151d]/95 px-2 py-1.5 shadow-xl">
        <span className="px-2 text-sm font-semibold">无限画布工作台</span>
        <span className="mx-1 h-4 w-px bg-[#2a2f3d]" />
        <button
          onClick={undoCanvas}
          disabled={!canUndo}
          className="rounded px-2 py-1 text-[12px] text-slate-300 hover:bg-white/10 disabled:opacity-40"
          title="撤销"
        >
          ↩ 撤销
        </button>
        <button
          onClick={redoCanvas}
          disabled={!canRedo}
          className="rounded px-2 py-1 text-[12px] text-slate-300 hover:bg-white/10 disabled:opacity-40"
          title="重做"
        >
          ↪ 重做
        </button>
        <span className="mx-1 h-4 w-px bg-[#2a2f3d]" />
        <button
          onClick={() => {
            setShowAccounts((v) => !v);
            setShowTasks(false);
          }}
          className="rounded px-2 py-1 text-[12px] text-slate-300 hover:bg-white/10"
        >
          Dola 账号
        </button>
        <button
          onClick={() => {
            setShowTasks((v) => !v);
            setShowAccounts(false);
          }}
          className="rounded px-2 py-1 text-[12px] text-slate-300 hover:bg-white/10"
        >
          任务队列{queuedCount > 0 && <span className="ml-1 text-cyan-300">({queuedCount})</span>}
        </button>
        <button
          onClick={exportProject}
          className="rounded px-2 py-1 text-[12px] text-slate-300 hover:bg-white/10"
        >
          导出
        </button>
      </div>

      {/* 左侧资产抽屉 */}
      <div className="absolute top-16 left-3 z-20 w-[180px] rounded-xl border border-[#2a2f3d] bg-[#12151d]/95 p-3 shadow-xl">
        <div className="mb-2 text-[12px] font-semibold text-slate-300">角色资产</div>
        <div className="space-y-1">
          {characters.map((c) => (
            <div key={c.id} className="rounded bg-white/[0.04] px-2 py-1.5 text-[12px] text-slate-200">
              {c.name}
              <span className="ml-1 text-[10px] text-slate-500">{c.age}</span>
            </div>
          ))}
        </div>
        <button
          onClick={addCharacter}
          className="mt-2 w-full rounded bg-white/5 py-1.5 text-[12px] text-slate-300 hover:bg-white/10"
        >
          + 新建角色
        </button>
        <p className="mt-3 text-[10px] leading-relaxed text-slate-600">
          双击画布空白处添加节点；双击节点进入精修台；Delete 删除选中；方向键微调。
        </p>
      </div>

      {showAccounts && (window.wuxianDesktop ? <DesktopAccountsPanel onClose={() => setShowAccounts(false)} /> : <AccountsPanel onClose={() => setShowAccounts(false)} />)}
      {showTasks && <TaskQueuePanel onClose={() => setShowTasks(false)} />}

      {/* 双击建节点菜单 */}
      {menu && (
        <div
          className="fixed z-40 w-[200px] rounded-xl border border-[#2a2f3d] bg-[#12151d] p-2 shadow-2xl"
          style={{ left: Math.min(menu.x, window.innerWidth - 220), top: Math.min(menu.y, window.innerHeight - 320) }}
        >
          <div className="px-2 py-1 text-[11px] text-slate-500">在此创建节点</div>
          {NODE_TYPE_META.map((m) => (
            <button
              key={m.type}
              onClick={() => createNode(m.type, menu.flowX, menu.flowY)}
              className="block w-full rounded px-2 py-1.5 text-left text-[13px] text-slate-200 hover:bg-white/10"
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      <GridSplitterModal />
      <FrameBreakdownModal />
      <DirectorInspectorDrawer />
    </div>
  );
}

export default function InfiniteCanvasWorkbench() {
  return (
    <ReactFlowProvider>
      <WorkbenchInner />
    </ReactFlowProvider>
  );
}
