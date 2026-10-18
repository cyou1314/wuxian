"use client";

import dynamic from "next/dynamic";

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
  return <InfiniteCanvasWorkbench />;
}
