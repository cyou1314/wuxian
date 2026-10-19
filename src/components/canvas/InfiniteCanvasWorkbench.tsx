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
  MiniMap,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  useReactFlow,
  useViewport,
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
import StudioIcon from "../ui/StudioIcon";

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
  const [showMinimap, setShowMinimap] = useState(true);
  const [showEdges, setShowEdges] = useState(true);
  const [snap, setSnap] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showAssets, setShowAssets] = useState(false);
  const [query, setQuery] = useState("");
  const [workspaceName, setWorkspaceName] = useState("未命名项目");
  const { zoom } = useViewport();
  const [showAccounts, setShowAccounts] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    flowX: number;
    flowY: number;
  } | null>(null);

  const { screenToFlowPosition, getNodes, fitView, zoomIn, zoomOut, getViewport, setViewport } = useReactFlow();
  useEffect(() => {
    setWorkspaceName(localStorage.getItem("xan-workspace-label") || "未命名项目");
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") { setMenu(null); setShowHelp(false); setShowAssets(false); } };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  const graphRef = useRef(graph);
  graphRef.current = graph;
  const lastPaneClick = useRef(0);

  // store → 画布单向同步（拖拽等本地交互不写 store，不触发回环）
  useEffect(() => {
    setNodes((current) => graph.nodes.map((n) => ({ ...toXYNode(n), selected: current.find((c) => c.id === n.id)?.selected ?? false })));
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
        setQuery("");
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

  const openAddMenu = () => {
    if (menu) { setMenu(null); return; }
    const p = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    setQuery("");
    setMenu({ x: window.innerWidth / 2 - 150, y: window.innerHeight - 610, flowX: p.x, flowY: p.y });
  };
  const groups = [
    { label: "资产", types: ["roleStudio"] },
    { label: "剧本与分镜", types: ["scriptEditor", "storyboardTable", "shotImage"] },
    { label: "视频生成", types: ["videoGen"] },
    { label: "后期与预演", types: ["layerSplit", "threeDBox", "smartClip"] },
  ];

  return (
    <div className="relative h-screen w-full outline-none" onKeyDown={onKeyDown} tabIndex={0}>
      <ReactFlow
        nodes={nodes}
        edges={edges.map((e) => ({ ...e, hidden: !showEdges }))}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={onPaneClick}
        onNodeClick={(_e, node) => {
          if (node.type !== "shotImage" && node.type !== "videoGen") return;
          const v = getViewport();
          const center = Math.max(210, Math.min(window.innerWidth - 210, (node.position.x + 170) * v.zoom + v.x));
          void setViewport({ x: center - (node.position.x + 170) * v.zoom, y: 145 - node.position.y * v.zoom, zoom: v.zoom });
        }}
        defaultViewport={{ x: 0, y: 140, zoom: 1 }}
        onNodeDoubleClick={(_e, node) => openInspector(node.id)}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onlyRenderVisibleElements
        deleteKeyCode={null}
        snapToGrid={snap}
        snapGrid={[24, 24]}
        minZoom={0.2}
        className="bg-[var(--wx-bg-canvas)]"
      >
        <Background gap={24} color="var(--wx-bg-panel)" />
        {showMinimap && <MiniMap pannable zoomable nodeColor="var(--wx-border)" maskColor="var(--wx-bg-canvas)" bgColor="var(--wx-bg-panel)" />}
      </ReactFlow>

      <header className="wx-topbar">
        <div className="wx-top-left">
          <span className="wx-brand">Xan<span className="text-[var(--wx-accent)]">.</span></span>
          <input aria-label="工作区显示名称" title="本机工作区显示名称；保存文件请使用另存为" className="w-32 min-w-0 rounded bg-transparent px-2 py-1.5 text-[13px]" value={workspaceName} onChange={(e) => { setWorkspaceName(e.target.value); localStorage.setItem("xan-workspace-label", e.target.value); }} />
          <span className="wx-canvas-name border-l border-[var(--wx-border)] pl-4 text-[var(--wx-text-2)]">画布 1</span>
          <button onClick={() => void fitView({ padding: .2, duration: 250 })} title="适应画布">{Math.round(zoom * 100)}%</button>
        </div>
        <span className="wx-workflow-label">工作流</span>
        <div className="wx-top-right">
          <button onClick={undoCanvas} disabled={!canUndo} title="撤销">↩</button>
          <button onClick={redoCanvas} disabled={!canRedo} title="重做">↪</button>
          <span className="mx-1 h-4 w-px bg-[var(--wx-border)]" />
          <button aria-expanded={showAccounts} onClick={() => { setShowAccounts((v) => !v); setShowTasks(false); }}>Dola 账号</button>
          <button aria-expanded={showTasks} onClick={() => { setShowTasks((v) => !v); setShowAccounts(false); }}>任务队列{queuedCount > 0 && <span className="ml-1 text-[var(--wx-accent)]">{queuedCount}</span>}</button>
          <button onClick={exportProject}>导出</button>
        </div>
      </header>
      {window.wuxianDesktop && <DesktopProjectControls />}

      <div className="wx-canvas-tools wx-toolbar">
        <button onClick={() => void fitView({ padding: .2, duration: 250 })} title="适应画布" aria-label="适应画布"><StudioIcon name="fit" /></button>
        <button onClick={() => setShowMinimap((v) => !v)} title="切换小地图" aria-label="切换小地图" aria-pressed={showMinimap}><StudioIcon name="map" /></button>
        <button onClick={() => setShowEdges((v) => !v)} title={showEdges ? "隐藏节点连线" : "显示节点连线"} aria-label="切换节点连线" aria-pressed={showEdges}><StudioIcon name="link" /></button>
        <button onClick={() => setSnap((v) => !v)} title="网格吸附" aria-label="网格吸附" aria-pressed={snap}><StudioIcon name="grid" /></button>
        <button onClick={() => setShowHelp((v) => !v)} title="快捷键" aria-label="快捷键" aria-expanded={showHelp}><StudioIcon name="keyboard" /></button>
        <span className="h-4 w-px bg-[var(--wx-border)]" />
        <button onClick={() => void zoomOut()} title="缩小" aria-label="缩小">−</button>
        <span className="w-10 text-center text-[11px]">{Math.round(zoom * 100)}%</span>
        <button onClick={() => void zoomIn()} title="放大" aria-label="放大">+</button>
      </div>
      {showHelp && <aside className="wx-panel wx-help"><strong className="text-[var(--wx-text-1)]">画布快捷键</strong><p>双击空白：添加节点 · 双击节点：精修</p><p>Delete：删除 · 方向键：微调 · Shift：10px / 框选</p><p>⌘ / Ctrl + C、V：复制粘贴 · Esc：收起菜单</p></aside>}
      <nav className="wx-panel wx-dock" aria-label="创作工具">
        <button className="wx-add-button" onClick={openAddMenu} title="添加节点" aria-label="添加节点" aria-expanded={!!menu}><StudioIcon name="plus" size={22} /></button>
        <button onClick={() => setShowAssets((v) => !v)} aria-expanded={showAssets}><StudioIcon name="roleStudio" />角色资产</button>
        <button onClick={addCharacter}><StudioIcon name="plus" />新建角色</button>
        <button onClick={() => { setShowTasks((v) => !v); setShowAccounts(false); }}><StudioIcon name="tasks" />任务</button>
      </nav>
      {showAssets && <aside className="wx-panel absolute bottom-24 left-1/2 z-30 w-72 -translate-x-1/2 p-4">
        <div className="mb-3 flex justify-between text-sm"><h2>角色资产</h2><button onClick={() => setShowAssets(false)} aria-label="关闭角色资产">×</button></div>
        <div className="max-h-64 space-y-2 overflow-auto">{characters.map((c) => <button key={c.id} className="flex w-full items-center gap-3 rounded-lg bg-[var(--wx-bg-hover)] p-3 text-left text-xs" onClick={() => { const n = graph.nodes.find((n) => n.id === c.roleNodeId); if (n) void fitView({ nodes: [{ id: n.id }], maxZoom: 1, padding: .5 }); }}><StudioIcon name="roleStudio" /><span>{c.name}</span><span className="ml-auto text-[var(--wx-text-2)]">{c.age}</span></button>)}</div>
      </aside>}
      {showAccounts && (window.wuxianDesktop ? <DesktopAccountsPanel onClose={() => setShowAccounts(false)} /> : <AccountsPanel onClose={() => setShowAccounts(false)} />)}
      {showTasks && <TaskQueuePanel onClose={() => setShowTasks(false)} />}

      {menu && <div className="wx-panel wx-create-menu" role="dialog" aria-label="添加节点" onKeyDown={(e) => { if (e.key === "Escape") setMenu(null); }} style={{ left: Math.max(12, Math.min(menu.x, window.innerWidth - 312)), top: Math.max(76, Math.min(menu.y, window.innerHeight - 600)) }}>
        <div className="mb-2 flex items-center justify-between px-1"><strong className="text-[13px]">添加节点</strong><button onClick={() => setMenu(null)} aria-label="关闭添加节点" style={{ width: "auto", padding: "4px 8px" }}>×</button></div>
        <input autoFocus aria-label="搜索画布节点" placeholder="搜索画布节点" value={query} onChange={(e) => setQuery(e.target.value)} />
        {groups.map((group) => {
          const items = NODE_TYPE_META.filter((m) => group.types.includes(m.type) && m.label.toLowerCase().includes(query.toLowerCase()));
          return items.length > 0 && <section key={group.label}><h3 className="wx-menu-section">{group.label}</h3>{items.map((m) => <button key={m.type} onClick={() => createNode(m.type, menu.flowX, menu.flowY)}><StudioIcon name={m.type} /><span>{m.label}</span><span className="ml-auto text-[var(--wx-text-3)]">+</span></button>)}</section>;
        })}
        {!NODE_TYPE_META.some((m) => m.label.toLowerCase().includes(query.toLowerCase())) && <p className="p-4 text-[var(--wx-text-2)]">没有找到节点，试试“分镜”或“视频”。</p>}
      </div>}
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
