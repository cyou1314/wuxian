"use client";

/**
 * TaskQueuePanel — Dola 生成任务队列
 *
 * 查看任务状态（queued/submitting/polling/succeeded/failed），
 * 一键按账号额度 draining 执行；成功任务可复制无水印直链。
 */
import { useState } from "react";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useTaskStore } from "@/store/useTaskStore";
import { getDolaPoolSync } from "@/lib/dola-pool";
import { drainTaskQueue } from "@/lib/dola-executor";
import type { DolaTask, DolaTaskStatus } from "@/types/libtv-schema";

const STATUS_LABEL: Record<DolaTaskStatus, string> = {
  queued: "排队中",
  submitting: "提交中",
  generating: "生成中",
  polling: "轮询中",
  succeeded: "成功",
  failed: "失败",
};

const STATUS_COLOR: Record<DolaTaskStatus, string> = {
  queued: "text-slate-400",
  submitting: "text-cyan-300",
  generating: "text-cyan-300",
  polling: "text-violet-300",
  succeeded: "text-emerald-400",
  failed: "text-red-400",
};

export default function TaskQueuePanel({ onClose }: { onClose: () => void }) {
  const tasks = useTaskStore((s) => s.tasks);
  const updateTask = useTaskStore((s) => s.updateTask);
  const removeTask = useTaskStore((s) => s.removeTask);
  const [running, setRunning] = useState(false);
  const [hint, setHint] = useState("");

  const run = async () => {
    const pool = getDolaPoolSync();
    if (!pool) {
      setHint("请先在账号面板添加并登录 Dola 账号");
      return;
    }
    const queued = tasks.filter((t) => t.status === "queued");
    if (queued.length === 0) {
      setHint("没有排队中的任务");
      return;
    }
    setRunning(true);
    setHint("");
    try {
      await drainTaskQueue(pool, queued, {
        onTaskUpdate: (t: DolaTask) => {
          updateTask(t.id, t as unknown as Record<string, unknown>);
          // 生成闭环：成功后把结果直链自动写回发起任务的画布节点
          if (t.status === "succeeded" && t.nodeId) {
            const patch: Record<string, unknown> = {};
            if (t.kind === "video" && t.playUrl) patch.videoUrl = t.playUrl;
            if (t.kind === "image" && t.imageUrl) patch.imageUrl = t.imageUrl;
            if (Object.keys(patch).length > 0) {
              const st = useCanvasStore.getState();
              if (st.graph.nodes.some((n) => n.id === t.nodeId)) {
                st.patchNodeData(t.nodeId, patch);
              }
            }
          }
        },
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="absolute top-14 right-4 z-30 flex max-h-[70vh] w-[360px] flex-col rounded-xl border border-[#2a2f3d] bg-[#12151d] p-4 shadow-2xl">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          生成任务队列
          <span className="ml-2 text-[11px] text-slate-500">
            {tasks.filter((t) => t.status === "queued").length} 排队中
          </span>
        </h3>
        <button onClick={onClose} className="rounded px-2 text-slate-400 hover:bg-white/10">
          ×
        </button>
      </div>

      <div className="mb-3 flex-1 space-y-2 overflow-auto">
        {tasks.length === 0 && (
          <p className="py-6 text-center text-[12px] text-slate-500">
            暂无任务。在视频节点点"生成视频"入队。
          </p>
        )}
        {tasks.map((t) => (
          <div key={t.id} className="rounded bg-white/[0.04] px-2 py-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                {t.kind === "video" ? "视频" : "图片"} · {t.kind === "video" ? t.duration : ""}s
              </span>
              <span className="flex items-center gap-2">
                <span className={`text-[11px] ${STATUS_COLOR[t.status]}`}>
                  {STATUS_LABEL[t.status]}
                </span>
                <button
                  onClick={() => removeTask(t.id)}
                  className="rounded px-1 text-slate-500 hover:bg-red-500/20 hover:text-red-300"
                  title="移除任务"
                >
                  ×
                </button>
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-[12px] text-slate-200">{t.prompt}</p>
            {t.error && <p className="mt-1 text-[11px] text-red-400">{t.error}</p>}
            {"playUrl" in t && t.playUrl && (
              <div className="mt-1 flex items-center gap-2">
                <a
                  href={t.playUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-cyan-300 underline"
                >
                  无水印直链
                </a>
                <button
                  onClick={() => navigator.clipboard.writeText(t.playUrl as string)}
                  className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400 hover:bg-white/10"
                >
                  复制
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {hint && <p className="mb-2 text-[12px] text-amber-300">{hint}</p>}
      <button
        onClick={run}
        disabled={running}
        className="rounded bg-cyan-500/80 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
      >
        {running ? "执行中…" : "按额度执行队列"}
      </button>
      <p className="mt-2 text-[10px] leading-relaxed text-slate-600">
        {window.wuxianDesktop ? "请先在账号窗口完成登录。执行后可在此查看进度和生成结果。" : "执行需在已登录真实页面上下文或家宽出口环境；当前环境不满足时任务会如实报错。"}
      </p>
    </div>
  );
}
