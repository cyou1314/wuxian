import { getCanvasSnapshot, useCanvasStore } from '@/store/useCanvasStore';
import { useTaskStore } from '@/store/useTaskStore';
import type { DesktopProject } from '@/types/desktop';

export function captureProject(): DesktopProject {
  return { format: 'wuxian-project', version: 1, canvas: getCanvasSnapshot(), tasks: useTaskStore.getState().tasks };
}
export function restoreProject(project: DesktopProject) {
  useCanvasStore.setState({ ...project.canvas, assets: project.canvas.assets ?? [] });
  useCanvasStore.temporal.getState().clear();
  useTaskStore.setState({ tasks: project.tasks.map((t) =>
    ['submitting', 'polling', 'generating'].includes(t.status)
      ? { ...t, status: 'failed' as const, error: '软件退出前任务未完成，请先到 Dola 确认结果，避免重复提交。' }
      : t,
  ) });
}
