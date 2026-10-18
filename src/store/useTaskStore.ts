/**
 * useTaskStore.ts — Dola 生成任务队列
 *
 * VideoGenNode 的"生成"按钮入队；dola-executor（Phase 6）按账号额度 draining 执行。
 * 任务本身不进 Undo 历史、不持久化（重启后重新入队）。
 */
import { create } from "zustand";
import type { DolaTask } from "@/types/libtv-schema";

interface TaskStore {
  tasks: DolaTask[];
  enqueueTask: (task: DolaTask) => void;
  updateTask: (id: string, patch: Record<string, unknown>) => void;
  removeTask: (id: string) => void;
}

export const useTaskStore = create<TaskStore>()((set) => ({
  tasks: [],
  enqueueTask: (task) =>
    set((s) => ({
      tasks: s.tasks.some((t) => t.id === task.id) ? s.tasks : [...s.tasks, task],
    })),
  updateTask: (id, patch) =>
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === id ? (Object.assign({ ...t }, patch) as DolaTask) : t,
      ),
    })),
  removeTask: (id) =>
    set((s) => ({
      tasks: s.tasks.filter((t) => t.id !== id),
    })),
}));

/** 取待执行任务（queued 状态） */
export function selectQueuedTasks(s: TaskStore): DolaTask[] {
  return s.tasks.filter((t) => t.status === "queued");
}
