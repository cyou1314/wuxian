/**
 * dola-executor.ts — Dola 任务队列执行器（Phase 6）
 *
 * 按账号剩余额度 draining 队列：
 *   pickAccount → clientFor → submit → poll → getPlayInfo → recordUsage
 *
 * 运行环境硬要求（见 docs/dola-api-chain.md）：
 *   必须在「已登录真实页面上下文」（Electron webview / 真实浏览器 automation）
 *   或「家宽出口」运行；VM 机房出口裸调 /chat/completion 会被 710022002 拦截。
 * 本模块不伪装环境，失败时如实返回错误。
 */
import { DolaAccountPool, DolaClient } from "./dola-engine";
import type { DolaTask } from "@/types/libtv-schema";

export interface ExecutorEvents {
  onTaskUpdate?: (task: DolaTask) => void;
  /**
   * 自定义 client 构造。默认用 pool.clientFor（直连，适合 Node/Electron 主进程）。
   * 浏览器工作台请传入经 /api/dola/fetch 代理的版本：
   *   clientFactory: async (accountId) =>
   *     new DolaClient(await pool.cookieFor(accountId), { fetchImpl: createProxyFetch(await pool.cookieFor(accountId)) })
   */
  clientFactory?: (accountId: string) => Promise<DolaClient>;
}

function fail(task: DolaTask, error: string): DolaTask {
  return { ...task, status: "failed", error };
}

/**
 * 顺序执行一批 queued 任务。每个任务独立 try/catch，一个失败不影响后续。
 */
export async function drainTaskQueue(
  pool: DolaAccountPool,
  tasks: DolaTask[],
  events?: ExecutorEvents,
): Promise<DolaTask[]> {
  const results: DolaTask[] = [];
  for (const task of tasks) {
    if (task.status !== "queued") {
      results.push(task);
      continue;
    }
    const account = pool.pickAccount();
    if (!account) {
      const t = fail(task, "无可用账号：账号未添加或额度已耗尽");
      events?.onTaskUpdate?.(t);
      results.push(t);
      continue;
    }
    try {
      const client = events?.clientFactory
        ? await events.clientFactory(account.id)
        : await pool.clientFor(account.id);
      if (task.kind === "video") {
        events?.onTaskUpdate?.({ ...task, status: "submitting", accountId: account.id });
        const { conversationId, quota } = await client.submitVideo({
          prompt: task.prompt,
          model: task.model,
          duration: task.duration,
          ratio: task.ratio,
        });
        events?.onTaskUpdate?.({ ...task, status: "polling", accountId: account.id, conversationId });
        const vid = await client.pollForVid(conversationId);
        const playUrl = await client.getPlayInfo(vid);
        if (quota) pool.recordUsage(account.id, quota);
        const done: DolaTask = {
          ...task,
          status: "succeeded",
          accountId: account.id,
          conversationId,
          vid,
          playUrl,
          quotaCost: quota?.cost,
        };
        events?.onTaskUpdate?.(done);
        results.push(done);
      } else {
        // 图片：提交链路已确认；结果回取（draw_result）待一次带响应抓包确认，
        // 此处如实停在 generating，不伪造成功。
        events?.onTaskUpdate?.({ ...task, status: "submitting", accountId: account.id });
        const { conversationId, quota } = await client.submitImage({
          prompt: task.prompt,
          ratio: task.ratio,
        });
        if (quota) pool.recordUsage(account.id, quota);
        const pending: DolaTask = {
          ...task,
          status: "generating",
          accountId: account.id,
          conversationId,
          quotaCost: quota?.cost,
          error: "已提交；图片结果回取链路（draw_result）待抓包确认，暂不自动收尾",
        };
        events?.onTaskUpdate?.(pending);
        results.push(pending);
      }
    } catch (err) {
      const t = fail(task, err instanceof Error ? err.message : String(err));
      events?.onTaskUpdate?.(t);
      results.push(t);
    }
  }
  return results;
}
