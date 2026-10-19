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
import TextNode from "../nodes/TextNode";
import DirectorNode from "../nodes/DirectorNode";
import GroupNode from "../nodes/GroupNode";
import AssetLibrary from "./AssetLibrary";
import EngineManager from "./EngineManager";
import DirectorChat from "./DirectorChat";
import { insertNode, insertAsset, duplicateGraph, groupGraph, refreshGroups, uid } from "@/lib/studio";
import { chooseFiles, uploadAsset } from "@/lib/studio-upload";
import { exportShareProject } from "@/lib/studio-share";
import dagre from "dagre";

const nodeTypes = {
  text: TextNode, director: DirectorNode, group: GroupNode,
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
  { type: "text", label: "文本" },
  { type: "director", label: "导演台" },
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
    ...(n.type === "group" ? { style: { width: n.width, height: n.height }, zIndex: -1 } : {}),
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
  const [historyOnly, setHistoryOnly] = useState(false);
  const [showEngine, setShowEngine] = useState(false);
  const [directorId, setDirectorId] = useState<string | null>(null);
  const [panMode, setPanMode] = useState(false);
  const [spacePan, setSpacePan] = useState(false);
  const [notice, setNotice] = useState("");
  const [context, setContext] = useState<{x:number;y:number;flowX:number;flowY:number}|null>(null);
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
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") { setMenu(null); setShowHelp(false); setShowAssets(false); setContext(null); setShowEngine(false); setDirectorId(null); } };
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

  const altDrag = useRef(false);
  const onNodeDragStop: OnNodeDrag = useCallback((_e, _node, dragged) => {
    const previous = graphRef.current;
    const positions = new Map(dragged.map(n => [n.id, n.position]));
    for (const n of dragged) {
      const old = previous.nodes.find(x => x.id === n.id);
      if (old?.data.kind === 'group') {
        const dx=n.position.x-old.position.x,dy=n.position.y-old.position.y;
        for(const memberId of old.data.memberIds) { const m=previous.nodes.find(x=>x.id===memberId); if(m&&!positions.has(memberId)) positions.set(memberId,{x:m.position.x+dx,y:m.position.y+dy}); }
      }
    }
    if(altDrag.current) {
      const moved={...previous,nodes:previous.nodes.map(n=>({...n,position:positions.get(n.id)??n.position}))};
      const copies=duplicateGraph(moved,useCanvasStore.getState().characters,dragged.map(n=>n.id),{x:0,y:0});
      useCanvasStore.setState({graph:{...copies.graph,nodes:copies.graph.nodes.map(n=>previous.nodes.find(x=>x.id===n.id)??n)},characters:copies.characters});
    } else useCanvasStore.setState({graph:refreshGroups({...previous,nodes:previous.nodes.map(n=>({...n,position:positions.get(n.id)??n.position}))})});
    altDrag.current=false;
  }, []);

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

  const createNode = useCallback((type: LibTVNodeType,x:number,y:number) => { insertNode(type,{x,y});setMenu(null); }, []);
  const upload = async (files?:File[],position?:{x:number;y:number}) => {
    try { const list=files??await chooseFiles(); const p=position??screenToFlowPosition({x:window.innerWidth/2,y:window.innerHeight/2});
      for(const [i,file] of list.entries()) { const asset=await uploadAsset(file);insertAsset(asset,{x:p.x+i*60,y:p.y+i*60}); }
      if(list.length)setNotice(`已导入 ${list.length} 个素材`);
    } catch(e){setNotice(e instanceof Error?e.message:'上传失败');} setContext(null);setMenu(null);
  };
  const paste = async () => { try {const payload=JSON.parse(await navigator.clipboard.readText()) as CanvasGraph;
    if(!Array.isArray(payload.nodes)||!Array.isArray(payload.edges)||payload.nodes.some(n=>!n.id||!n.data||!nodeTypes[n.type]))return;
    const current=useCanvasStore.getState();const sourceCharacters=[...current.characters,...((payload as CanvasGraph&{characters?:CharacterAsset[]}).characters??[]).filter(c=>!current.characters.some(x=>x.id===c.id))];const copied=duplicateGraph(payload,sourceCharacters,payload.nodes.map(n=>n.id));
    useCanvasStore.setState({graph:{nodes:[...current.graph.nodes,...copied.graph.nodes.slice(payload.nodes.length)],edges:[...current.graph.edges,...copied.graph.edges.slice(payload.edges.length)]},characters:[...current.characters,...copied.characters.slice(sourceCharacters.length)]});
  }catch {setNotice('剪贴板中没有可粘贴的画布节点');} };
  const arrange = () => {const g=new dagre.graphlib.Graph().setGraph({rankdir:'LR',nodesep:100,ranksep:180}).setDefaultEdgeLabel(()=>({}));
    const current=useCanvasStore.getState().graph; const measured=getNodes();current.nodes.filter(n=>n.type!=='group').forEach(n=>g.setNode(n.id,{width:n.width??380,height:measured.find(x=>x.id===n.id)?.measured?.height??n.height??360}));
    current.edges.filter(e=>g.hasNode(e.source)&&g.hasNode(e.target)).forEach(e=>g.setEdge(e.source,e.target));dagre.layout(g);
    useCanvasStore.setState({graph:refreshGroups({...current,nodes:current.nodes.map(n=>{const p=g.node(n.id);return p?{...n,width:p.width,height:p.height,position:{x:p.x-p.width/2,y:p.y-p.height/2}}:n;})})});void fitView({padding:.2,duration:250});
  };
  const onCanvasContextMenu = (e:React.MouseEvent | MouseEvent) => {e.preventDefault();const p=screenToFlowPosition({x:e.clientX,y:e.clientY});setContext({x:e.clientX,y:e.clientY,flowX:p.x,flowY:p.y});setMenu(null);};
  const openDirector = () => {const existing=useCanvasStore.getState().graph.nodes.find(n=>n.type==='director');
    setDirectorId((existing??insertNode('director',screenToFlowPosition({x:window.innerWidth/2,y:200}))).id);
  };

  // 键盘：Delete 删除选中；方向键微调；Ctrl+C/V 复制粘贴（输入框内不触发）
  const onKeyDown = (e: React.KeyboardEvent | KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t?.isContentEditable) {
        return;
      }
      const selected = getNodes().filter((n) => n.selected);
      const mod=e.ctrlKey||e.metaKey,key=e.key.toLowerCase();
      if(mod&&key==='z'){e.preventDefault();e.shiftKey?redoCanvas():undoCanvas();return;}
      if(mod&&key==='f'){e.preventDefault();setHistoryOnly(false);setShowAssets(true);return;}
      if(mod&&key==='d'){e.preventDefault();const state=useCanvasStore.getState();useCanvasStore.setState(duplicateGraph(state.graph,state.characters,selected.map(n=>n.id)));return;}
      if((mod||e.altKey)&&key==='g'){e.preventDefault();try{useCanvasStore.setState({graph:groupGraph(graphRef.current,selected.map(n=>n.id),e.shiftKey)});}catch(err){setNotice((err as Error).message);}return;}
      if(mod&&key==='l'){e.preventDefault();for(let i=1;i<selected.length;i++)addEdge({id:uid('edge'),type:'dataflow',source:selected[i-1].id,target:selected[i].id});return;}
      if(mod&&e.key==='Enter'){e.preventDefault();window.dispatchEvent(new CustomEvent('xan:generate',{detail:selected.map(n=>n.id)}));return;}
      if(e.altKey&&e.shiftKey&&key==='f'){e.preventDefault();arrange();return;}
      if(e.key==='Tab'){e.preventDefault();openAddMenu();return;}
      if(e.key===' '){e.preventDefault();setSpacePan(true);return;}
      if(key==='h'){setPanMode(true);return;} if(key==='v'&&!mod){setPanMode(false);return;}
      if(['+','=','-','0'].includes(e.key)){e.preventDefault();if(e.key==='-')void zoomOut();else if(e.key==='0')void fitView({padding:.2});else void zoomIn();return;}
      if (e.key === "Delete" || e.key === "Backspace") {
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
        for(const n of graphRef.current.nodes)if(ids.has(n.id)&&n.data.kind==="group")n.data.memberIds.forEach(id=>ids.add(id));
        const payload = {
          characters: useCanvasStore.getState().characters.filter(c=>ids.has(c.roleNodeId??"")),
          nodes: graphRef.current.nodes.filter(n=>ids.has(n.id)),
          edges: graphRef.current.edges.filter((x) => ids.has(x.source) && ids.has(x.target)),
        };
        void navigator.clipboard.writeText(JSON.stringify(payload));
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        void paste();
        e.preventDefault();
      }
    };

  useEffect(()=>{
    const down=(e:KeyboardEvent)=>{onKeyDown(e);if(e.defaultPrevented)e.stopPropagation();};
    const up=(e:KeyboardEvent)=>{if(e.key===' ')setSpacePan(false);};const blur=()=>setSpacePan(false);
    window.addEventListener('keydown',down,true);window.addEventListener('keyup',up);window.addEventListener('blur',blur);
    return()=>{window.removeEventListener('keydown',down,true);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);};
  });
  useEffect(()=>window.wuxianDesktop?.onCommand(command=>{
    const target=document.activeElement as HTMLElement|null;
    const editing=target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement||target?.isContentEditable;
    if(command.startsWith("edit-")){const action=command.slice(5);if(editing){document.execCommand(action);return;}
      onKeyDown(new KeyboardEvent("keydown",{key:({undo:"z",redo:"z",copy:"c",paste:"v"} as Record<string,string>)[action],metaKey:true,ctrlKey:true,shiftKey:action==="redo"}));
    } else if(command.startsWith("canvas-zoom")){if(command.endsWith("in"))void zoomIn();else if(command.endsWith("out"))void zoomOut();else void fitView({padding:.2});}
  }));

  const exportProject = () => { void exportShareProject().catch(e=>setNotice((e as Error).message)); };

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
    { label: "创作", types: ["text", "director", "roleStudio"] },
    { label: "剧本与分镜", types: ["scriptEditor", "storyboardTable", "shotImage"] },
    { label: "视频生成", types: ["videoGen"] },
    { label: "后期与预演", types: ["threeDBox", "smartClip"] },
  ];

  return (
    <div className="relative h-screen w-full outline-none" tabIndex={0}
      onDragOver={e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy';}}}
      onDrop={e=>{if(e.dataTransfer.files.length){e.preventDefault();void upload(Array.from(e.dataTransfer.files),screenToFlowPosition({x:e.clientX,y:e.clientY}));}}}>
      <ReactFlow
        nodes={nodes}
        edges={edges.map((e) => ({ ...e, hidden: !showEdges }))}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onNodeDragStart={(e)=>{altDrag.current=e.altKey;}}
        onNodeDragStop={onNodeDragStop}
        panOnDrag={panMode||spacePan?[0,1]:[1]}
        selectionOnDrag={!panMode&&!spacePan}
        panActivationKeyCode="Space"
        onPaneContextMenu={onCanvasContextMenu}
        onNodeContextMenu={onCanvasContextMenu}
        onEdgeContextMenu={onCanvasContextMenu}

        onPaneClick={e=>{setContext(null);onPaneClick(e);}}
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
          <button className="wx-brand" aria-label="API 管理器" onClick={()=>setShowEngine(v=>!v)}>Xan<span className="text-[var(--wx-accent)]">.</span></button>
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
          <button onClick={exportProject}>分享 .wuxian</button>
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
      {showHelp && <aside className="wx-panel wx-help"><strong className="text-[var(--wx-text-1)]">画布快捷键</strong><p>双击空白：添加节点 · 双击节点：精修</p><p>左键框选 · 中键 / Space / H 平移 · V 选择</p><p>⌘ C/V/D：复制/粘贴/副本 · ⌘ G / ⇧⌘ G：分组/解组</p><p>⌘ L 连线 · ⌘ Enter 入队 · ⌘ F 搜索 · ⌘ Z / ⇧⌘ Z 撤销/重做</p><p>Tab 添加 · Alt 拖拽副本 · Alt ⇧ F 排列 · + / − / 0 缩放</p><p>Delete 删除 · 方向键微调 · Shift 10px · Esc 收起</p></aside>}
      <nav className="wx-panel wx-dock" aria-label="创作工具">
        <button className="wx-add-button" onClick={openAddMenu} title="添加节点" aria-label="添加节点" aria-expanded={!!menu}><StudioIcon name="plus" size={22} /></button>
        <button onClick={() => {setHistoryOnly(false);setShowAssets((v) => !v);}} aria-expanded={showAssets}><StudioIcon name="roleStudio" />资产库</button>
        <button onClick={()=>void upload()}><StudioIcon name="upload" />上传</button><button onClick={openDirector}>导演助手</button><button onClick={()=>{setHistoryOnly(true);setShowAssets(true);}}>生成历史</button><button onClick={addCharacter}><StudioIcon name="plus" />新建角色</button>
        <button onClick={() => { setShowTasks((v) => !v); setShowAccounts(false); }}><StudioIcon name="tasks" />任务</button>
      </nav>
      {showAssets && <AssetLibrary key={String(historyOnly)} historyOnly={historyOnly} onClose={()=>setShowAssets(false)} onLocate={id=>{void fitView({nodes:[{id}],maxZoom:1,padding:.5});}} onPick={a=>insertAsset(a,screenToFlowPosition({x:window.innerWidth/2,y:window.innerHeight/2}))} onUpload={()=>void upload()} />}
      {showEngine && <EngineManager onClose={()=>setShowEngine(false)} onAccounts={()=>{setShowAccounts(true);setShowEngine(false);}} />}
      {directorId && graph.nodes.some(n=>n.id===directorId) && <aside className="wx-panel wx-director-sidebar"><div className="wx-parameter-title">导演助手<button onClick={()=>setDirectorId(null)}>×</button></div><DirectorChat id={directorId} contextIds={getNodes().filter(n=>n.selected).map(n=>n.id)} /></aside>}
      {notice && <div role="status" className="wx-panel wx-status" onClick={()=>setNotice('')}>{notice}　×</div>}
      {context && <div className="wx-panel wx-context-menu" style={{left:Math.min(context.x,window.innerWidth-220),top:Math.min(context.y,window.innerHeight-300)}}>
        <button onClick={()=>void upload(undefined,{x:context.flowX,y:context.flowY})}>上传素材</button>
        <button onClick={()=>{setMenu(context);setContext(null);}}>添加节点</button><button onClick={()=>{undoCanvas();setContext(null);}} disabled={!canUndo}>撤销</button><button onClick={()=>{redoCanvas();setContext(null);}} disabled={!canRedo}>重做</button><button onClick={()=>{void paste();setContext(null);}}>粘贴</button>
      </div>}
      {showAccounts && (window.wuxianDesktop ? <DesktopAccountsPanel onClose={() => setShowAccounts(false)} /> : <AccountsPanel onClose={() => setShowAccounts(false)} />)}
      {showTasks && <TaskQueuePanel onClose={() => setShowTasks(false)} />}

      {menu && <div className="wx-panel wx-create-menu" role="dialog" aria-label="添加节点" onKeyDown={(e) => { if (e.key === "Escape") setMenu(null); }} style={{ left: Math.max(12, Math.min(menu.x, window.innerWidth - 312)), top: Math.max(76, Math.min(menu.y, window.innerHeight - 600)) }}>
        <div className="mb-2 flex items-center justify-between px-1"><strong className="text-[13px]">添加节点</strong><button onClick={() => setMenu(null)} aria-label="关闭添加节点" style={{ width: "auto", padding: "4px 8px" }}>×</button></div>
        <h3 className="wx-menu-section">添加资源</h3><button onClick={()=>void upload()}><StudioIcon name="upload" />上传素材</button><button onClick={()=>{setHistoryOnly(true);setShowAssets(true);setMenu(null);}}>从生成历史选择</button><input autoFocus aria-label="搜索画布节点" placeholder="搜索画布节点" value={query} onChange={(e) => setQuery(e.target.value)} />
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
