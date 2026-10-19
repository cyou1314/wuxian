"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { restoreProject } from "@/lib/desktop-workspace";
import { getDesktopDolaPool } from "@/lib/dola-pool";

const InfiniteCanvasWorkbench = dynamic(
  () => import("@/components/canvas/InfiniteCanvasWorkbench"),
  {
    ssr: false,
    loading: () => (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-neutral-400">画布加载中…</p>
      </main>
    ),
  },
);

export default function WorkbenchLoader() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const bridge = window.wuxianDesktop;
    if (!bridge) { setReady(true); return; }
    void (async () => {
      const project = await bridge.loadRecovery();
      if (!active) return;
      if (project) restoreProject(project);
      await getDesktopDolaPool();
      if (active) setReady(true);
    })().catch((e) => { if (active) setError(e instanceof Error ? e.message : String(e)); });
    return () => { active = false; };
  }, []);
  if (error) return <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
    <p>无法恢复本地项目：{error}</p>
    <p className="text-sm text-slate-400">恢复文件已保留，请备份用户数据目录后处理，避免覆盖原项目。</p>
  </main>;
  if (!ready) return <main className="flex min-h-screen items-center justify-center">正在恢复工作台…</main>;
  return <InfiniteCanvasWorkbench />;
}
