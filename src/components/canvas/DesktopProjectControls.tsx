"use client";
import { useEffect, useRef, useState } from 'react';
import { captureProject, restoreProject } from '@/lib/desktop-workspace';
import { useCanvasStore } from '@/store/useCanvasStore';
import { useTaskStore } from '@/store/useTaskStore';

export default function DesktopProjectControls() {
  const [status, setStatus] = useState('本机自动恢复已开启');
  const busy = useRef(false);
  const suspended = useRef(false);
  const commandRef = useRef<(name: string) => Promise<void>>(async () => {});
  commandRef.current = async (name) => {
    if (busy.current) return;
    const bridge = window.wuxianDesktop;
    if (!bridge) return;
    busy.current = true;
    try {
      if (name === 'open') {
        if (useTaskStore.getState().tasks.some((t) => ['submitting', 'polling', 'generating'].includes(t.status))) {
          throw new Error('请等待当前生成任务结束后再切换项目');
        }
        if (!window.confirm('打开另一个项目？请先保存当前项目，以便以后重新打开。')) return;
        const project = await bridge.openProject();
        if (project) {
          suspended.current = true;
          restoreProject(project);
          suspended.current = false;
          await bridge.autosave(captureProject());
          setStatus('项目已打开');
        }
      } else if (name === 'save' || name === 'saveAs') {
        const file = await bridge.saveProject(captureProject(), name === 'saveAs');
        if (file) setStatus(`已保存：${file}`);
      } else if (name === 'close') {
        if (useTaskStore.getState().tasks.some((t) => ['submitting', 'polling', 'generating'].includes(t.status)) &&
            !window.confirm('仍有生成任务在执行。退出会中断本地跟踪，是否退出？')) return;
        await bridge.close(captureProject());
      }
    } catch (e) { setStatus(`操作失败：${e instanceof Error ? e.message : String(e)}`); }
    finally { busy.current = false; suspended.current = false; }
  };
  useEffect(() => {
    const bridge = window.wuxianDesktop;
    if (!bridge) return;
    const save = () => {
      if (!suspended.current) void bridge.autosave(captureProject()).catch((e) => setStatus(`自动恢复保存失败：${String(e)}`));
    };
    void bridge.ready();
    save();
    const unsubscribeCanvas = useCanvasStore.subscribe(save);
    const unsubscribeTasks = useTaskStore.subscribe(save);
    const unsubscribeCommands = bridge.onCommand((name) => void commandRef.current(name));
    return () => { unsubscribeCanvas(); unsubscribeTasks(); unsubscribeCommands(); };
  }, []);
  return <div className="absolute bottom-4 left-1/2 z-20 flex max-w-[90vw] -translate-x-1/2 items-center gap-3 rounded-lg border border-[#2a2f3d] bg-[#12151d] px-3 py-2 text-xs text-slate-300">
    <button onClick={() => void commandRef.current('open')}>打开项目</button>
    <button onClick={() => void commandRef.current('save')}>保存</button>
    <button onClick={() => void commandRef.current('saveAs')}>另存为</button>
    <span className="max-w-80 truncate text-slate-400" role="status" title={status}>{status}</span>
  </div>;
}
