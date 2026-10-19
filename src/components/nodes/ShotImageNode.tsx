"use client";

/**
 * ShotImageNode — 分镜画面节点
 * 2752×1536 预览、7 段式 AST 编辑器、编译提示词只读展示、raw 直发开关、
 * {{Image N}} 槽位、宫格切分与图层分离入口。
 */
import type { NodeProps } from "@xyflow/react";
import NodeParameterPanel from "../canvas/NodeParameterPanel";
import NodeQuickToolbar from "../canvas/NodeQuickToolbar";
import StudioIcon from "../ui/StudioIcon";
import { NodeShell } from "./NodeShell";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useUIStore } from "@/store/useUIStore";
import { compileImagePrompt } from "@/lib/prompt-compiler";
import { IMAGE_SLOT_LABELS } from "@/types/libtv-schema";
import type {
  CanvasEdge,
  CanvasNode,
  ImagePromptAST,
  ReferenceSlots,
  ShotImageNodeData,
} from "@/types/libtv-schema";

const inputCls =
  "w-full rounded border border-[var(--wx-border)] bg-[var(--wx-bg-input)] px-2 py-1 text-[11px] text-[var(--wx-text-1)] outline-none focus:border-[var(--wx-accent)]";
const btnCls =
  "rounded border border-[var(--wx-border)] bg-[var(--wx-bg-hover)] px-2 py-1 text-[11px] text-[var(--wx-text-1)] hover:bg-[var(--wx-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40";

type ShotData = ShotImageNodeData & { rawText?: string };

const SLOT_KEYS = ["image1", "image2", "image3"] as const;

export default function ShotImageNode(props: NodeProps) {
  const { id, selected } = props;
  const data = props.data as unknown as ShotData;
  const stale = useCanvasStore((s) => s.graph.nodes.find((n) => n.id === id)?.stale ?? false);
  const position = useCanvasStore((s) => s.graph.nodes.find((n) => n.id === id)?.position);
  const patchNodeData = useCanvasStore((s) => s.patchNodeData);
  const touchNode = useCanvasStore((s) => s.touchNode);
  const upsertNode = useCanvasStore((s) => s.upsertNode);
  const addEdge = useCanvasStore((s) => s.addEdge);
  const inspectorId = useUIStore((s) => s.inspectorNodeId);
  const openInspector = useUIStore((s) => s.openInspector);
  const openGridSplitter = useUIStore((s) => s.openGridSplitter);

  const patchAST = (fn: (draft: ImagePromptAST) => void) => {
    const next = structuredClone(data.imagePromptAST);
    fn(next);
    patchNodeData(id, { imagePromptAST: next });
  };
  const blurTouch = () => touchNode(id);

  const layerSplit = () => {
    if (!data.imageUrl) return;
    const nodeId = `layer-${id}-${Date.now().toString(36)}`;
    const node: CanvasNode = {
      id: nodeId,
      type: "layerSplit",
      position: { x: (position?.x ?? 0) + 380, y: position?.y ?? 0 },
      data: { kind: "layerSplit", sourceImageUrl: data.imageUrl, layers: [] },
      stale: false,
    };
    upsertNode(node);
    const edge: CanvasEdge = { id: `e-${id}-${nodeId}`, type: "dataflow", source: id, target: nodeId };
    addEdge(edge);
  };

  const compiled = compileImagePrompt(data.imagePromptAST);
  const hasImage = !!data.imageUrl;

  return (
    <NodeShell
      id={id}
      title={`分镜 #${data.shotNo}`}
      stale={stale}
      selected={selected}
      accent="var(--wx-accent)"
      width={340}
    >
      <div className="wx-media">
        <span className="wx-media-badge">AI生成</span>
        {hasImage ? <img src={data.imageUrl} alt={`分镜 ${data.shotNo}`} /> : <div className="wx-empty-media"><StudioIcon name="shotImage" /><span>选中节点，设置分镜画面</span></div>}
      </div>
      <NodeQuickToolbar visible={!!selected && inspectorId !== id}>
        <button onClick={() => openInspector(id)}>精修画面</button>
        <button onClick={() => openGridSplitter(id)} disabled={!hasImage}>宫格切分</button>
        <button onClick={layerSplit} disabled={!hasImage}>图层分离</button>
      </NodeQuickToolbar>
      <NodeParameterPanel visible={!!selected && inspectorId !== id}>
      <div className="space-y-3">
        <div className="wx-parameter-title"><StudioIcon name="shotImage" /><span>画面参数</span><span className="ml-auto">7 段式提示词</span></div>
        {/* 7 段式编辑器 */}
        <details className="rounded border border-[var(--wx-border)] bg-[var(--wx-bg-input)]/60">
          <summary className="cursor-pointer px-2 py-1.5 text-[12px] font-medium text-[var(--wx-text-2)]">
            7 段式提示词编辑器
          </summary>
          <div className="space-y-1.5 border-t border-[var(--wx-border)] p-2">
            <div className="flex gap-1.5">
              <label className="flex-1">
                <span className="mb-0.5 block text-[11px] text-[var(--wx-text-2)]">景别</span>
                <input
                  className={inputCls}
                  value={data.imagePromptAST.composition.shotSize}
                  onChange={(e) => patchAST((d) => { d.composition.shotSize = e.target.value; })}
                  onBlur={blurTouch}
                />
              </label>
              <label className="flex-1">
                <span className="mb-0.5 block text-[11px] text-[var(--wx-text-2)]">视角</span>
                <input
                  className={inputCls}
                  value={data.imagePromptAST.composition.angle}
                  onChange={(e) => patchAST((d) => { d.composition.angle = e.target.value; })}
                  onBlur={blurTouch}
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-0.5 block text-[11px] text-[var(--wx-text-2)]">角色</span>
              <textarea
                className={`${inputCls} h-14 resize-y`}
                value={data.imagePromptAST.character}
                onChange={(e) => patchAST((d) => { d.character = e.target.value; })}
                onBlur={blurTouch}
              />
            </label>
            <label className="block">
              <span className="mb-0.5 block text-[11px] text-[var(--wx-text-2)]">人物空间与互动关系</span>
              <textarea
                className={`${inputCls} h-12 resize-y`}
                value={data.imagePromptAST.spatialRelation}
                onChange={(e) => patchAST((d) => { d.spatialRelation = e.target.value; })}
                onBlur={blurTouch}
              />
            </label>
            <label className="block">
              <span className="mb-0.5 block text-[11px] text-[var(--wx-text-2)]">微表情与面部特写</span>
              <textarea
                className={`${inputCls} h-12 resize-y`}
                value={data.imagePromptAST.microExpression}
                onChange={(e) => patchAST((d) => { d.microExpression = e.target.value; })}
                onBlur={blurTouch}
              />
            </label>
            <label className="block">
              <span className="mb-0.5 block text-[11px] text-[var(--wx-text-2)]">场景环境元素</span>
              <textarea
                className={`${inputCls} h-12 resize-y`}
                value={data.imagePromptAST.environment}
                onChange={(e) => patchAST((d) => { d.environment = e.target.value; })}
                onBlur={blurTouch}
              />
            </label>
            <label className="block">
              <span className="mb-0.5 block text-[11px] text-[var(--wx-text-2)]">光影几何与大气效果</span>
              <textarea
                className={`${inputCls} h-12 resize-y`}
                value={data.imagePromptAST.lighting}
                onChange={(e) => patchAST((d) => { d.lighting = e.target.value; })}
                onBlur={blurTouch}
              />
            </label>
            <div className="flex gap-1.5">
              <label className="flex-1">
                <span className="mb-0.5 block text-[11px] text-[var(--wx-text-2)]">画风</span>
                <input
                  className={inputCls}
                  value={data.imagePromptAST.style.artStyle}
                  onChange={(e) => patchAST((d) => { d.style.artStyle = e.target.value; })}
                  onBlur={blurTouch}
                />
              </label>
              <label className="w-20">
                <span className="mb-0.5 block text-[11px] text-[var(--wx-text-2)]">焦段</span>
                <input
                  className={inputCls}
                  value={data.imagePromptAST.style.focalLength}
                  onChange={(e) => patchAST((d) => { d.style.focalLength = e.target.value; })}
                  onBlur={blurTouch}
                />
              </label>
              <label className="w-20">
                <span className="mb-0.5 block text-[11px] text-[var(--wx-text-2)]">光圈</span>
                <input
                  className={inputCls}
                  value={data.imagePromptAST.style.aperture}
                  onChange={(e) => patchAST((d) => { d.style.aperture = e.target.value; })}
                  onBlur={blurTouch}
                />
              </label>
            </div>
          </div>
        </details>

        {/* 编译后的完整提示词（只读） */}
        <div className="rounded border border-[var(--wx-border)] bg-[var(--wx-bg-input)]/60 p-2">
          <div className="mb-1 text-[11px] text-[var(--wx-text-2)]">编译后提示词（只读）</div>
          <div className="max-h-24 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--wx-text-2)]">
            {compiled}
          </div>
        </div>

        {/* raw 直发开关 */}
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-[var(--wx-text-2)]">
          <input
            type="checkbox"
            checked={data.rawPrompt}
            onChange={(e) => {
              patchNodeData(id, { rawPrompt: e.target.checked });
              touchNode(id);
            }}
            className="accent-[var(--wx-accent)]"
          />
          Raw 直发（跳过重写器，原样发模型）
        </label>
        {data.rawPrompt && (
          <textarea
            className={`${inputCls} h-20 resize-y`}
            value={data.rawText ?? ""}
            onChange={(e) => patchNodeData(id, { rawText: e.target.value })}
            onBlur={blurTouch}
            placeholder="输入直发模型的原始提示词…"
          />
        )}

        {/* 参考槽位 */}
        <div className="border-t border-[var(--wx-border)] pt-2">
          <div className="mb-1 text-[11px] font-medium text-[var(--wx-text-2)]">参考槽位</div>
          <div className="space-y-1">
            {SLOT_KEYS.map((k) => {
              const url: string | undefined = (data.referenceSlots as ReferenceSlots)[k];
              return (
                <div key={k} className="flex items-center gap-2">
                  <span className="w-32 shrink-0 text-[11px] text-[var(--wx-text-2)]">{IMAGE_SLOT_LABELS[k]}</span>
                  {url ? (
                    <img src={url} alt={k} className="h-10 w-10 rounded border border-[var(--wx-border)] object-cover" title={url} />
                  ) : (
                    <span className="text-[11px] text-[var(--wx-text-3)]">未绑定</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-1.5">
          <button className={`${btnCls} flex-1`} onClick={() => openGridSplitter(id)} disabled={!hasImage} title={hasImage ? "打开宫格切分器" : "需要先有分镜图"}>
            宫格切分
          </button>
          <button className={`${btnCls} flex-1`} onClick={layerSplit} disabled={!hasImage} title={hasImage ? "创建图层分离节点" : "需要先有分镜图"}>
            图层分离
          </button>
        </div>
      </div>
      </NodeParameterPanel>
    </NodeShell>
  );
}
