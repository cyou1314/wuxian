"use client";

/**
 * VideoGenNode — 视频生成节点
 * 播放器 + 5 段式运动编辑器 + Dola 参数 + 毫秒级重拍选区 + 入队生成
 */
import { useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "./NodeShell";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useUIStore } from "@/store/useUIStore";
import { useTaskStore } from "@/store/useTaskStore";
import { getDolaPoolSync } from "@/lib/dola-pool";
import { createVideoTask } from "@/lib/dola-engine";
import { resolveVideoMotionPrompt } from "@/lib/prompt-compiler";
import type {
  DolaModel,
  DolaRatio,
  VideoGenNodeData,
  VideoMotionAST,
} from "@/types/libtv-schema";

interface VideoGenData extends VideoGenNodeData {
  dolaParams?: { model: DolaModel; durationSec: number; ratio: DolaRatio };
  rawText?: string;
}

const MODELS: DolaModel[] = ["seedance_v2.5", "seedance_v2.0", "seedance_v1.0"];
const RATIOS: DolaRatio[] = ["1:1", "3:4", "4:3", "9:16", "16:9", "21:9"];
const DEFAULT_PARAMS = {
  model: "seedance_v2.0" as DolaModel,
  durationSec: 5,
  ratio: "16:9" as DolaRatio,
};

const MOTION_FIELDS: Array<{ key: keyof VideoMotionAST; label: string; textarea?: boolean }> = [
  { key: "cameraMove", label: "运镜轨迹与速度" },
  { key: "subjectAction", label: "主体动作细节", textarea: true },
  { key: "envDynamics", label: "环境物理动态" },
  { key: "audio", label: "音效与音乐氛围" },
  { key: "duration", label: "时长" },
];

const inputCls =
  "w-full rounded bg-[#0b0e14] border border-[#2a2f3d] px-2 py-1 text-xs text-slate-200";
const labelCls = "mb-1 block text-[11px] text-slate-400";
const btnCls =
  "rounded bg-[#fb7185]/15 border border-[#fb7185]/40 px-2.5 py-1 text-xs text-rose-200 hover:bg-[#fb7185]/25";
const ghostBtnCls =
  "rounded border border-[#2a2f3d] px-2.5 py-1 text-xs text-slate-300 hover:bg-white/5";

export default function VideoGenNode(props: NodeProps) {
  const { id, selected } = props;
  const data = props.data as unknown as VideoGenData;
  const stale = useCanvasStore((s) => s.graph.nodes.find((n) => n.id === id)?.stale ?? false);
  const patchNodeData = useCanvasStore((s) => s.patchNodeData);
  const touchNode = useCanvasStore((s) => s.touchNode);
  const openBreakdown = useUIStore((s) => s.openBreakdown);
  const enqueueTask = useTaskStore((s) => s.enqueueTask);
  const task = useTaskStore((s) => s.tasks.find((t) => t.id === data.dolaTaskId));
  const [error, setError] = useState<string | null>(null);

  const params = data.dolaParams ?? DEFAULT_PARAMS;
  const ranges = data.reshootRanges ?? [];

  const setMotion = (field: keyof VideoMotionAST, value: string) => {
    patchNodeData(id, { motionAST: { ...data.motionAST, [field]: value } });
  };
  const setParams = (patch: Partial<typeof params>) => {
    patchNodeData(id, { dolaParams: { ...params, ...patch } });
  };
  const setRanges = (next: Array<{ startMs: number; endMs: number }>) => {
    patchNodeData(id, { reshootRanges: next });
  };

  const handleGenerate = () => {
    setError(null);
    const resolved = resolveVideoMotionPrompt(
      { ast: data.motionAST, rawText: data.rawText },
      { rawPrompt: data.rawPrompt },
    );
    const pool = getDolaPoolSync();
    if (!pool) {
      setError("请先在账号面板添加并登录 Dola 账号");
      return;
    }
    const task = createVideoTask(pool, {
      prompt: resolved.resolved,
      model: params.model,
      duration: params.durationSec,
      ratio: params.ratio,
      nodeId: id,
    });
    if (!task) {
      setError("无可用账号（额度耗尽或未添加）");
      return;
    }
    enqueueTask(task);
    patchNodeData(id, { dolaTaskId: task.id });
  };

  return (
    <NodeShell
      id={id}
      title={`视频节点 #${data.shotNo}`}
      stale={stale}
      selected={selected}
      accent="#fb7185"
      width={340}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="rounded bg-emerald-500/15 border border-emerald-500/40 px-1.5 py-0.5 text-[10px] text-emerald-300">
          Dola
        </span>
        {task && (
          <span className="text-[10px] text-slate-400">
            任务：<span className="text-slate-200">{task.status}</span>
          </span>
        )}
      </div>

      {data.videoUrl ? (
        <video src={data.videoUrl} controls className="aspect-video w-full rounded bg-black" />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded bg-[#0b0e14] text-xs text-slate-500">
          待生成
        </div>
      )}

      <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
        <input
          type="checkbox"
          checked={data.rawPrompt}
          onChange={(e) => {
            patchNodeData(id, { rawPrompt: e.target.checked });
            touchNode(id);
          }}
        />
        Raw 直发（跳过 5 段式重写）
      </label>
      {data.rawPrompt && (
        <textarea
          className={`${inputCls} mt-1`}
          rows={3}
          value={data.rawText ?? ""}
          onChange={(e) => patchNodeData(id, { rawText: e.target.value })}
          onBlur={() => touchNode(id)}
          placeholder="原始运动提示词，原样直发"
        />
      )}

      <details className="mt-2 rounded border border-[#2a2f3d]">
        <summary className="cursor-pointer px-2 py-1.5 text-xs text-slate-300">
          5 段式运动编辑器
        </summary>
        <div className="space-y-2 border-t border-[#2a2f3d] p-2">
          {MOTION_FIELDS.map((f) => (
            <div key={f.key}>
              <label className={labelCls}>{f.label}</label>
              {f.textarea ? (
                <textarea
                  className={inputCls}
                  rows={2}
                  value={data.motionAST[f.key]}
                  onChange={(e) => setMotion(f.key, e.target.value)}
                  onBlur={() => touchNode(id)}
                />
              ) : (
                <input
                  className={inputCls}
                  value={data.motionAST[f.key]}
                  onChange={(e) => setMotion(f.key, e.target.value)}
                  onBlur={() => touchNode(id)}
                />
              )}
            </div>
          ))}
        </div>
      </details>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <div>
          <label className={labelCls}>模型</label>
          <select
            className={inputCls}
            value={params.model}
            onChange={(e) => {
              setParams({ model: e.target.value as DolaModel });
            }}
            onBlur={() => touchNode(id)}
          >
            {MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>时长(秒)</label>
          <input
            type="number"
            min={5}
            max={30}
            className={inputCls}
            value={params.durationSec}
            onChange={(e) => {
              const v = Math.min(30, Math.max(5, Number(e.target.value) || 5));
              setParams({ durationSec: v });
            }}
            onBlur={() => touchNode(id)}
          />
        </div>
        <div>
          <label className={labelCls}>比例</label>
          <select
            className={inputCls}
            value={params.ratio}
            onChange={(e) => {
              setParams({ ratio: e.target.value as DolaRatio });
            }}
            onBlur={() => touchNode(id)}
          >
            {RATIOS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-2">
        <div className="mb-1 flex items-center justify-between">
          <span className={labelCls}>毫秒级重拍选区</span>
          <button
            className={ghostBtnCls}
            onClick={() => setRanges([...ranges, { startMs: 0, endMs: 1000 }])}
          >
            + 新增
          </button>
        </div>
        {ranges.length === 0 && <div className="text-[11px] text-slate-600">无重拍选区</div>}
        {ranges.map((r, i) => (
          <div key={i} className="mb-1 flex items-center gap-1">
            <input
              type="number"
              min={0}
              className={inputCls}
              value={r.startMs}
              onChange={(e) =>
                setRanges(
                  ranges.map((x, j) =>
                    j === i ? { ...x, startMs: Math.max(0, Number(e.target.value) || 0) } : x,
                  ),
                )
              }
              onBlur={() => touchNode(id)}
              title="起始毫秒"
            />
            <span className="text-slate-500">→</span>
            <input
              type="number"
              min={0}
              className={inputCls}
              value={r.endMs}
              onChange={(e) =>
                setRanges(
                  ranges.map((x, j) =>
                    j === i ? { ...x, endMs: Math.max(0, Number(e.target.value) || 0) } : x,
                  ),
                )
              }
              onBlur={() => touchNode(id)}
              title="结束毫秒"
            />
            <button
              className="rounded px-1.5 text-slate-500 hover:bg-red-500/20 hover:text-red-300"
              title="删除选区"
              onClick={() => setRanges(ranges.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="mt-2">
        <label className={labelCls}>视频续写（上一段 vid / URL）</label>
        <input
          className={inputCls}
          value={data.continueFrom ?? ""}
          onChange={(e) => patchNodeData(id, { continueFrom: e.target.value })}
          onBlur={() => touchNode(id)}
          placeholder="可选"
        />
      </div>

      {error && <div className="mt-2 text-[11px] text-red-300">{error}</div>}

      <div className="mt-3 flex gap-2">
        <button className={btnCls} onClick={handleGenerate}>
          生成视频
        </button>
        <button className={ghostBtnCls} onClick={() => openBreakdown(id)}>
          拉片
        </button>
      </div>
    </NodeShell>
  );
}
