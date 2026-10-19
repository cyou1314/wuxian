"use client";

/**
 * DataFlowEdge — 贝塞尔动态流光数据边：
 * 流光动画 + 状态色（stale=琥珀 / 正常=青）+ 悬浮删除按钮。
 */
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import { useCanvasStore } from "@/store/useCanvasStore";

export default function DataFlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const removeEdges = useCanvasStore((s) => s.removeEdges);
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const stale = (data as { stale?: boolean } | undefined)?.stale === true;
  const gradientId = `wx-edge-${id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const color = stale ? "var(--wx-warning)" : `url(#${gradientId})`;

  return (
    <>
      <defs><linearGradient id={gradientId} x1={sourceX} y1={sourceY} x2={targetX} y2={targetY} gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="var(--wx-edge-from)" /><stop offset="100%" stopColor="var(--wx-edge-to)" /></linearGradient></defs>
      <BaseEdge
        id={id}
        path={path}
        style={{ stroke: color, strokeWidth: selected ? 2.5 : 2, opacity: 0.9 }}
      />
      <EdgeLabelRenderer>
        <button
          className="nodrag nopan pointer-events-auto absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--wx-bg-panel)] text-[11px] text-[var(--wx-text-2)] opacity-0 hover:bg-[var(--wx-danger)]/30 hover:text-[var(--wx-danger)] hover:opacity-100 group-hover:opacity-100"
          style={{ left: labelX, top: labelY }}
          title="删除连线"
          onClick={(e) => {
            e.stopPropagation();
            removeEdges([id]);
          }}
        >
          ×
        </button>
      </EdgeLabelRenderer>
    </>
  );
}
