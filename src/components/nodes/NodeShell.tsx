"use client";
import { Handle, Position } from "@xyflow/react";
import { useCanvasStore } from "@/store/useCanvasStore";
import type { ReactNode } from "react";
import StudioIcon from "../ui/StudioIcon";
interface NodeShellProps {
  id: string; title: string; stale?: boolean; selected?: boolean; accent?: string;
  showTarget?: boolean; showSource?: boolean; width?: number; children: ReactNode;
}
export function NodeShell({ id, title, stale, selected, showTarget = true, showSource = true, width = 320, children }: NodeShellProps) {
  const removeNodes = useCanvasStore((s) => s.removeNodes);
  const node = useCanvasStore((s) => s.graph.nodes.find((n) => n.id === id));
  const media = node?.type === "shotImage" || node?.type === "videoGen";
  const specification = node?.data.kind === "shotImage" ? `${node.data.previewSize.w} × ${node.data.previewSize.h}` : node?.data.kind === "videoGen" ? "Dola" : "";
  return <div className={`wx-node ${selected ? "is-selected" : ""}`} data-media={media} style={{ width }}>
    <div className="wx-node-heading">
      <StudioIcon name={node?.type ?? "settings"} /><strong>{title}</strong>
      <span className="ml-auto whitespace-nowrap text-[11px]">{specification}</span>
      {stale && <span className="rounded-full bg-[var(--wx-warning)]/10 px-2 py-0.5 text-[11px] text-[var(--wx-warning)]">待更新</span>}
      <button className="nodrag rounded px-1 text-[var(--wx-text-3)] hover:text-[var(--wx-danger)]" title="删除节点" aria-label={`删除${title}`} onClick={(e) => { e.stopPropagation(); removeNodes([id]); }}>×</button>
    </div>
    {showTarget && <Handle type="target" position={Position.Left}>+</Handle>}
    <div className="nodrag wx-node-content">{children}</div>
    {showSource && <Handle type="source" position={Position.Right}>+</Handle>}
  </div>;
}
