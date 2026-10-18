"use client";

/**
 * AutoLinkRefEdge — AutoLink @引用虚线边：灰色虚线 + 角色名标签。
 */
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import { useCanvasStore } from "@/store/useCanvasStore";

export default function AutoLinkRefEdge({
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
  const characterId = (data as { characterId?: string } | undefined)?.characterId;
  const character = useCanvasStore((s) => s.characters.find((c) => c.id === characterId));
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: selected ? "#a78bfa" : "#64748b",
          strokeWidth: 1.5,
          strokeDasharray: "6 5",
          opacity: 0.85,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: labelX, top: labelY }}
        >
          <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-300">
            @{character?.name ?? "角色"}
          </span>
          <button
            className="ml-1 rounded-full bg-[#1c2029] px-1 text-[10px] text-slate-500 opacity-0 hover:bg-red-500/30 hover:text-red-300 hover:opacity-100"
            title="删除引用"
            onClick={(e) => {
              e.stopPropagation();
              removeEdges([id]);
            }}
          >
            ×
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
