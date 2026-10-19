"use client";

/**
 * SmartClipNode — 智能剪辑与创意片头节点
 * 多视频节点聚合选择、去口水词粗剪开关、字幕开关、BGM 卡点、导出粗剪决策表
 */
import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "./NodeShell";
import { useCanvasStore } from "@/store/useCanvasStore";
import type { SmartClipNodeData } from "@/types/libtv-schema";

const inputCls =
  "w-full rounded bg-[var(--wx-bg-input)] border border-[var(--wx-border)] px-2 py-1 text-xs text-[var(--wx-text-1)]";
const labelCls = "mb-1 block text-[11px] text-[var(--wx-text-2)]";
const ghostBtnCls =
  "rounded border border-[var(--wx-border)] px-2.5 py-1 text-xs text-[var(--wx-text-2)] hover:bg-[var(--wx-text-1)]/5";

export default function SmartClipNode(props: NodeProps) {
  const { id, selected } = props;
  const data = props.data as unknown as SmartClipNodeData;
  const stale = useCanvasStore((s) => s.graph.nodes.find((n) => n.id === id)?.stale ?? false);
  const videoNodes = useCanvasStore((s) => s.graph.nodes.filter((n) => n.type === "videoGen"));
  const patchNodeData = useCanvasStore((s) => s.patchNodeData);
  const touchNode = useCanvasStore((s) => s.touchNode);

  const selectedIds = data.sourceVideoNodeIds ?? [];
  const cuePoints = data.bgmCuePoints ?? [];

  const toggleSource = (nodeId: string, checked: boolean) => {
    const next = checked
      ? [...selectedIds, nodeId]
      : selectedIds.filter((x) => x !== nodeId);
    patchNodeData(id, { sourceVideoNodeIds: next });
    touchNode(id);
  };

  const handleExport = () => {
    const sources = videoNodes
      .filter((n) => selectedIds.includes(n.id))
      .map((n) => ({
        id: n.id,
        shotNo: (n.data as unknown as { shotNo?: string }).shotNo ?? "",
      }));
    const plan = {
      version: 1,
      sources,
      trimSilence: data.trimSilence,
      subtitles: data.subtitles,
      bgmCuePoints: cuePoints,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "smart-clip-plan.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <NodeShell
      id={id}
      title="智能剪辑"
      stale={stale}
      selected={selected}
      accent="var(--wx-accent)"
      width={340}
    >
      <div>
        <label className={labelCls}>来源视频节点（多选）</label>
        {videoNodes.length === 0 && (
          <div className="text-[11px] text-[var(--wx-text-3)]">画布上暂无视频节点</div>
        )}
        <div className="max-h-32 space-y-1 overflow-y-auto">
          {videoNodes.map((n) => {
            const d = n.data as unknown as { shotNo?: string; videoUrl?: string };
            const checked = selectedIds.includes(n.id);
            return (
              <label
                key={n.id}
                className="flex cursor-pointer items-center gap-2 rounded border border-[var(--wx-border)] px-2 py-1 text-xs text-[var(--wx-text-2)] hover:bg-[var(--wx-text-1)]/5"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => toggleSource(n.id, e.target.checked)}
                />
                <span>视频节点 #{d.shotNo ?? "?"}</span>
                <span className="ml-auto text-[11px] text-[var(--wx-text-2)]">
                  {d.videoUrl ? "有成片" : "待生成"}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="mt-2 flex gap-4">
        <label className="flex items-center gap-2 text-[11px] text-[var(--wx-text-2)]">
          <input
            type="checkbox"
            checked={data.trimSilence}
            onChange={(e) => {
              patchNodeData(id, { trimSilence: e.target.checked });
              touchNode(id);
            }}
          />
          去口水词粗剪
        </label>
        <label className="flex items-center gap-2 text-[11px] text-[var(--wx-text-2)]">
          <input
            type="checkbox"
            checked={data.subtitles}
            onChange={(e) => {
              patchNodeData(id, { subtitles: e.target.checked });
              touchNode(id);
            }}
          />
          字幕花字
        </label>
      </div>

      <div className="mt-2">
        <div className="mb-1 flex items-center justify-between">
          <span className={labelCls}>BGM 卡点（秒）</span>
          <button
            className={ghostBtnCls}
            onClick={() => {
              patchNodeData(id, { bgmCuePoints: [...cuePoints, 0] });
              touchNode(id);
            }}
          >
            + 新增
          </button>
        </div>
        {cuePoints.length === 0 && (
          <div className="text-[11px] text-[var(--wx-text-3)]">暂无卡点</div>
        )}
        {cuePoints.map((sec, i) => (
          <div key={i} className="mb-1 flex items-center gap-1">
            <input
              type="number"
              min={0}
              step={0.1}
              className={inputCls}
              value={sec}
              onChange={(e) =>
                patchNodeData(id, {
                  bgmCuePoints: cuePoints.map((x, j) =>
                    j === i ? Math.max(0, Number(e.target.value) || 0) : x,
                  ),
                })
              }
              onBlur={() => touchNode(id)}
            />
            <button
              className="rounded px-1.5 text-[var(--wx-text-2)] hover:bg-[var(--wx-danger)]/20 hover:text-[var(--wx-danger)]"
              title="删除卡点"
              onClick={() => {
                patchNodeData(id, { bgmCuePoints: cuePoints.filter((_, j) => j !== i) });
                touchNode(id);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <button className={`${ghostBtnCls} mt-3 w-full`} onClick={handleExport}>
        导出粗剪决策表
      </button>
    </NodeShell>
  );
}
