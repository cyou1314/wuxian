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
  const color = stale ? "#f59e0b" : selected ? "#38bdf8" : "#22d3ee";

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        className="edge-flow"
        style={{ stroke: color, strokeWidth: selected ? 2.5 : 2, opacity: 0.9 }}
      />
      <EdgeLabelRenderer>
        <button
          className="nodrag nopan pointer-events-auto absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#1c2029] text-[11px] text-slate-400 opacity-0 hover:bg-red-500/30 hover:text-red-300 hover:opacity-100 group-hover:opacity-100"
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
