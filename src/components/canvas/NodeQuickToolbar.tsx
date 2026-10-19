"use client";
import { NodeToolbar, Position } from "@xyflow/react";
import type { ReactNode } from "react";
export default function NodeQuickToolbar({ visible, children }: { visible: boolean; children: ReactNode }) {
  return <NodeToolbar isVisible={visible} position={Position.Top} offset={48}><div className="wx-toolbar nodrag nopan" onDoubleClick={(e) => e.stopPropagation()}>{children}</div></NodeToolbar>;
}
