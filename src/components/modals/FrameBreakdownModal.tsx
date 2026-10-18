"use client";

/**
 * FrameBreakdownModal — 四维逐帧拉片面板
 *
 * 叙事分镜 / 精彩运镜 / 动作片段 / 音频参考四个维度，
 * 每条笔记带毫秒级时间点（输入为秒），按时间排序，持久化到 store。
 */
import { useState } from "react";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useUIStore } from "@/store/useUIStore";
import {
  BREAKDOWN_DIMENSION_LABELS,
  type BreakdownDimension,
} from "@/types/libtv-schema";
import { emptyBreakdown } from "@/types/libtv-schema";

const DIMS: BreakdownDimension[] = ["narrative", "camera", "action", "audio"];

function fmtMs(ms: number): string {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1).padStart(4, "0");
  return `${String(m).padStart(2, "0")}:${sec}`;
}

export default function FrameBreakdownModal() {
  const nodeId = useUIStore((s) => s.breakdownNodeId);
  const close = useUIStore((s) => s.closeBreakdown);
  const node = useCanvasStore((s) => s.graph.nodes.find((n) => n.id === nodeId));
  const breakdowns = useCanvasStore((s) => s.breakdowns);
  const addNote = useCanvasStore((s) => s.addBreakdownNote);
  const removeNote = useCanvasStore((s) => s.removeBreakdownNote);

  const [dim, setDim] = useState<BreakdownDimension>("narrative");
  const [timeSec, setTimeSec] = useState("");
  const [text, setText] = useState("");

  if (!nodeId || !node) return null;
  const bd = breakdowns[nodeId] ?? emptyBreakdown();
  const title =
    node.data.kind === "videoGen"
      ? `视频节点 #${(node.data as { shotNo: string }).shotNo}`
      : node.id;

  const submit = () => {
    const t = parseFloat(timeSec);
    if (Number.isNaN(t) || t < 0 || !text.trim()) return;
    addNote(nodeId, dim, { timeMs: Math.round(t * 1000), text: text.trim() });
    setTimeSec("");
    setText("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="flex max-h-full w-full max-w-2xl flex-col rounded-xl border border-[#2a2f3d] bg-[#12151d] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">逐帧拉片 · {title}</h2>
          <button onClick={close} className="rounded px-2 text-slate-400 hover:bg-white/10">
            ×
          </button>
        </div>

        <div className="mb-4 flex gap-2">
          {DIMS.map((d) => (
            <button
              key={d}
              onClick={() => setDim(d)}
              className={`rounded px-3 py-1.5 text-sm ${
                dim === d ? "bg-violet-500/20 text-violet-300" : "bg-white/5 text-slate-400"
              }`}
            >
              {BREAKDOWN_DIMENSION_LABELS[d]}
              <span className="ml-1 text-[10px] opacity-70">({bd[d].length})</span>
            </button>
          ))}
        </div>

        <div className="mb-4 flex-1 space-y-2 overflow-auto">
          {bd[dim].length === 0 && (
            <p className="py-6 text-center text-sm text-slate-500">暂无笔记，在下方添加</p>
          )}
          {bd[dim].map((n) => (
            <div
              key={n.id}
              className="flex items-start gap-3 rounded bg-white/[0.03] px-3 py-2"
            >
              <span className="mt-0.5 shrink-0 rounded bg-violet-500/15 px-1.5 py-0.5 font-mono text-[11px] text-violet-300">
                {fmtMs(n.timeMs)}
              </span>
              <span className="flex-1 text-sm text-slate-200">{n.text}</span>
              <button
                onClick={() => removeNote(nodeId, dim, n.id)}
                className="rounded px-1 text-slate-500 hover:bg-red-500/20 hover:text-red-300"
                title="删除"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2 border-t border-[#2a2f3d] pt-4">
          <input
            value={timeSec}
            onChange={(e) => setTimeSec(e.target.value)}
            placeholder="秒，如 12.5"
            type="number"
            min="0"
            step="0.1"
            className="w-28 rounded bg-white/5 px-2 py-2 text-sm outline-none focus:ring-1 focus:ring-violet-400"
          />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`${BREAKDOWN_DIMENSION_LABELS[dim]}笔记…`}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            className="flex-1 rounded bg-white/5 px-2 py-2 text-sm outline-none focus:ring-1 focus:ring-violet-400"
          />
          <button
            onClick={submit}
            className="rounded bg-violet-500/80 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
          >
            添加
          </button>
        </div>
      </div>
    </div>
  );
}
