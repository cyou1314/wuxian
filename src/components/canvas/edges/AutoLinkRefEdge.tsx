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
          stroke: selected ? "var(--wx-accent)" : "var(--wx-text-3)",
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
          <span className="rounded-full bg-[var(--wx-accent)]/15 px-2 py-0.5 text-[11px] text-[var(--wx-accent)]">
            @{character?.name ?? "角色"}
          </span>
          <button
            className="ml-1 rounded-full bg-[var(--wx-bg-panel)] px-1 text-[11px] text-[var(--wx-text-2)] opacity-0 hover:bg-[var(--wx-danger)]/30 hover:text-[var(--wx-danger)] hover:opacity-100"
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
