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
import { DolaClient } from "@/lib/dola-engine";
import { createProxyFetch } from "@/lib/dola-proxy";
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
  queued: "text-[var(--wx-text-2)]",
  submitting: "text-[var(--wx-accent)]",
  generating: "text-[var(--wx-accent)]",
  polling: "text-[var(--wx-accent)]",
  succeeded: "text-[var(--wx-success)]",
  failed: "text-[var(--wx-danger)]",
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
    if (!window.confirm(`即将向 Dola 提交 ${queued.length} 个生成任务，可能消耗额度。是否继续？`)) return;
    setRunning(true);
    setHint("");
    try {
      await drainTaskQueue(pool, queued, {
        // 桌面版使用独立账号页面会话；Web 版使用同源服务端代理。
        clientFactory: async (accountId: string) => {
          if (window.wuxianDesktop) return pool.clientFor(accountId);
          const cookie = await pool.cookieFor(accountId);
          return new DolaClient(cookie, { fetchImpl: createProxyFetch(cookie) });
        },
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
    } catch (e) {
      setHint(e instanceof Error ? e.message : "队列执行失败");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="absolute top-20 right-4 z-30 flex max-h-[70vh] w-[360px] flex-col rounded-xl border border-[var(--wx-border)] bg-[var(--wx-bg-panel)] p-4 shadow-2xl">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          生成任务队列
          <span className="ml-2 text-[11px] text-[var(--wx-text-2)]">
            {tasks.filter((t) => t.status === "queued").length} 排队中
          </span>
        </h3>
        <button onClick={onClose} className="rounded px-2 text-[var(--wx-text-2)] hover:bg-[var(--wx-text-1)]/10">
          ×
        </button>
      </div>

      <div className="mb-3 flex-1 space-y-2 overflow-auto">
        {tasks.length === 0 && (
          <p className="py-6 text-center text-[12px] text-[var(--wx-text-2)]">
            暂无任务。在视频节点点"生成视频"入队。
          </p>
        )}
        {tasks.map((t) => (
          <div key={t.id} className="rounded bg-[var(--wx-text-1)]/[0.04] px-2 py-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[var(--wx-text-2)]">
                {t.kind === "video" ? "视频" : "图片"} · {t.kind === "video" ? t.duration : ""}s
              </span>
              <span className="flex items-center gap-2">
                <span className={`text-[11px] ${STATUS_COLOR[t.status]}`}>
                  {STATUS_LABEL[t.status]}
                </span>
                <button
                  onClick={() => removeTask(t.id)}
                  className="rounded px-1 text-[var(--wx-text-2)] hover:bg-[var(--wx-danger)]/20 hover:text-[var(--wx-danger)]"
                  title="移除任务"
                >
                  ×
                </button>
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-[12px] text-[var(--wx-text-1)]">{t.prompt}</p>
            {t.error && <p className="mt-1 text-[11px] text-[var(--wx-danger)]">{t.error}</p>}
            {"playUrl" in t && t.playUrl && (
              <div className="mt-1 flex items-center gap-2">
                <a
                  href={t.playUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-[var(--wx-accent)] underline"
                >
                  无水印直链
                </a>
                <button
                  onClick={() => navigator.clipboard.writeText(t.playUrl as string)}
                  className="rounded bg-[var(--wx-text-1)]/5 px-1.5 py-0.5 text-[11px] text-[var(--wx-text-2)] hover:bg-[var(--wx-text-1)]/10"
                >
                  复制
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {hint && <p className="mb-2 text-[12px] text-[var(--wx-warning)]">{hint}</p>}
      <button
        onClick={run}
        disabled={running}
        className="wx-primary rounded bg-[var(--wx-accent)]/80 py-2 text-sm font-medium text-[var(--wx-text-1)] hover:bg-[var(--wx-accent)] disabled:opacity-50"
      >
        {running ? "执行中…" : "按额度执行队列"}
      </button>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--wx-text-3)]">
        {window.wuxianDesktop ? "请先在账号窗口完成登录。执行后可在此查看进度和生成结果。" : "执行需在已登录真实页面上下文或家宽出口环境；当前环境不满足时任务会如实报错。"}
      </p>
    </div>
  );
}
