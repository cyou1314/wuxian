"use client";

/**
 * LayerSplitNode — 图像图层分离节点
 * 从上游分镜图取源图，4 层（前景人物/道具/文字/修复背景）独立位移缩放与景深
 */
import { useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "./NodeShell";
import { useCanvasStore } from "@/store/useCanvasStore";
import type { LayerSplitNodeData } from "@/types/libtv-schema";

type Layer = LayerSplitNodeData["layers"][number];
type LayerKind = Layer["kind"];

const KIND_LABELS: Record<LayerKind, string> = {
  foreground: "前景人物",
  prop: "道具",
  text: "文字",
  background: "修复背景",
};
const KINDS = Object.keys(KIND_LABELS) as LayerKind[];
const DEFAULT_DEPTH: Record<LayerKind, number> = {
  foreground: 80,
  prop: 50,
  text: 90,
  background: 0,
};

const inputCls =
  "w-full rounded bg-[var(--wx-bg-input)] border border-[var(--wx-border)] px-2 py-1 text-xs text-[var(--wx-text-1)]";
const labelCls = "mb-1 block text-[11px] text-[var(--wx-text-2)]";
const ghostBtnCls =
  "rounded border border-[var(--wx-border)] px-2.5 py-1 text-xs text-[var(--wx-text-2)] hover:bg-[var(--wx-text-1)]/5";

export default function LayerSplitNode(props: NodeProps) {
  const { id, selected } = props;
  const data = props.data as unknown as LayerSplitNodeData;
  const stale = useCanvasStore((s) => s.graph.nodes.find((n) => n.id === id)?.stale ?? false);
  const graph = useCanvasStore((s) => s.graph);
  const patchNodeData = useCanvasStore((s) => s.patchNodeData);
  const touchNode = useCanvasStore((s) => s.touchNode);
  const [error, setError] = useState<string | null>(null);

  const layers: Layer[] = data.layers ?? [];

  const setLayers = (next: Layer[]) => {
    patchNodeData(id, { layers: next });
  };

  const updateLayer = (layerId: string, patch: Partial<Layer>) => {
    setLayers(layers.map((l) => (l.id === layerId ? { ...l, ...patch } : l)));
  };

  const updateTransform = (
    layerId: string,
    key: keyof Layer["transform"],
    value: number,
  ) => {
    setLayers(
      layers.map((l) =>
        l.id === layerId ? { ...l, transform: { ...l.transform, [key]: value } } : l,
      ),
    );
  };

  const handleInit = () => {
    setError(null);
    const edge = graph.edges.find((e) => e.target === id);
    const srcNode = edge ? graph.nodes.find((n) => n.id === edge.source) : undefined;
    if (!srcNode || srcNode.type !== "shotImage") {
      setError("未找到上游分镜图节点连线");
      return;
    }
    const imageUrl = (srcNode.data as unknown as { imageUrl?: string }).imageUrl;
    if (!imageUrl) {
      setError("上游分镜图尚未生成图片");
      return;
    }
    const patch: Record<string, unknown> = { sourceImageUrl: imageUrl };
    if (layers.length === 0) {
      const now = Date.now();
      const kinds: LayerKind[] = ["foreground", "prop", "text", "background"];
      patch.layers = kinds.map((kind) => ({
        id: `layer-${now}-${kind}`,
        kind,
        label: KIND_LABELS[kind],
        transform: { x: 0, y: 0, scale: 1, depth: DEFAULT_DEPTH[kind] },
      }));
    }
    patchNodeData(id, patch);
    touchNode(id);
  };

  return (
    <NodeShell
      id={id}
      title="图层分离"
      stale={stale}
      selected={selected}
      accent="var(--wx-accent)"
      width={340}
    >
      {data.sourceImageUrl ? (
        <img
          src={data.sourceImageUrl}
          alt="源图"
          className="aspect-video w-full rounded bg-[var(--wx-bg-canvas)] object-cover"
        />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded bg-[var(--wx-bg-input)] text-xs text-[var(--wx-text-2)]">
          暂无源图
        </div>
      )}

      <button className={`${ghostBtnCls} mt-2 w-full`} onClick={handleInit}>
        从上游分镜图初始化
      </button>
      {error && <div className="mt-1 text-[11px] text-[var(--wx-danger)]">{error}</div>}

      <div className="mt-2 space-y-2">
        {layers.length === 0 && (
          <div className="text-[11px] text-[var(--wx-text-3)]">暂无图层，点击上方按钮初始化</div>
        )}
        {layers.map((l) => (
          <div key={l.id} className="rounded border border-[var(--wx-border)] p-2">
            <div className="mb-1 flex items-center gap-1">
              <input
                className={inputCls}
                value={l.label}
                onChange={(e) => updateLayer(l.id, { label: e.target.value })}
                onBlur={() => touchNode(id)}
              />
              <select
                className={`${inputCls} w-28 shrink-0`}
                value={l.kind}
                onChange={(e) => updateLayer(l.id, { kind: e.target.value as LayerKind })}
                onBlur={() => touchNode(id)}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </select>
              <button
                className="shrink-0 rounded px-1.5 text-[var(--wx-text-2)] hover:bg-[var(--wx-danger)]/20 hover:text-[var(--wx-danger)]"
                title="删除图层"
                onClick={() => {
                  setLayers(layers.filter((x) => x.id !== l.id));
                  touchNode(id);
                }}
              >
                ×
              </button>
            </div>
            {(
              [
                { key: "x", label: "位移 X", min: -200, max: 200, step: 1 },
                { key: "y", label: "位移 Y", min: -200, max: 200, step: 1 },
                { key: "scale", label: "缩放", min: 0.2, max: 3, step: 0.05 },
                { key: "depth", label: "景深", min: 0, max: 100, step: 1 },
              ] as const
            ).map((s) => (
              <div key={s.key} className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-[11px] text-[var(--wx-text-2)]">{s.label}</span>
                <input
                  type="range"
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  className="flex-1 accent-[var(--wx-accent)]"
                  value={l.transform[s.key]}
                  onChange={(e) => updateTransform(l.id, s.key, Number(e.target.value))}
                  onBlur={() => touchNode(id)}
                />
                <span className="w-12 shrink-0 text-right text-[11px] text-[var(--wx-text-2)]">
                  {l.transform[s.key]}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </NodeShell>
  );
}
