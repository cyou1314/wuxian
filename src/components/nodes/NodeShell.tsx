"use client";

/**
 * NodeShell — 8 种自定义节点的统一外壳：
 * 标题栏（类型名 + stale 脏标记 + 删除按钮）+ 左右 Handle。
 */
import { Handle, Position } from "@xyflow/react";
import { useCanvasStore } from "@/store/useCanvasStore";
import type { ReactNode } from "react";

interface NodeShellProps {
  id: string;
  title: string;
  stale?: boolean;
  selected?: boolean;
  accent?: string;
  showTarget?: boolean;
  showSource?: boolean;
  width?: number;
  children: ReactNode;
}

export function NodeShell({
  id,
  title,
  stale,
  selected,
  accent = "#38bdf8",
  showTarget = true,
  showSource = true,
  width = 320,
  children,
}: NodeShellProps) {
  const removeNodes = useCanvasStore((s) => s.removeNodes);
  return (
    <div
      className="rounded-xl border bg-[#12151d]/95 shadow-xl backdrop-blur"
      style={{
        width,
        borderColor: selected ? accent : "#2a2f3d",
        boxShadow: selected ? `0 0 0 1px ${accent}` : undefined,
      }}
    >
      {showTarget && (
        <Handle type="target" position={Position.Left} className="!bg-slate-500 !w-3 !h-3" />
      )}
      <div
        className="flex items-center justify-between rounded-t-xl px-3 py-2"
        style={{ borderBottom: `2px solid ${accent}` }}
      >
        <span className="text-[13px] font-semibold text-slate-100">{title}</span>
        <span className="flex items-center gap-2">
          {stale && (
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">
              待更新
            </span>
          )}
          <button
            className="rounded px-1 text-slate-500 hover:bg-red-500/20 hover:text-red-300"
            title="删除节点"
            onClick={(e) => {
              e.stopPropagation();
              removeNodes([id]);
            }}
          >
            ×
          </button>
        </span>
      </div>
      <div className="nodrag p-3">{children}</div>
      {showSource && (
        <Handle type="source" position={Position.Right} className="!bg-slate-500 !w-3 !h-3" />
      )}
    </div>
  );
}
