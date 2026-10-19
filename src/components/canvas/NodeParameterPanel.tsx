"use client";
import { NodeToolbar, Position, useViewport } from "@xyflow/react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
export default function NodeParameterPanel({ visible, children }: { visible: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { x, y, zoom } = useViewport();
  const [height, setHeight] = useState(450);
  useLayoutEffect(() => {
    if (!visible) return;
    const resize = () => {
      if (ref.current) setHeight(Math.max(160, window.innerHeight - ref.current.getBoundingClientRect().top - 110));
    };
    const frame = requestAnimationFrame(resize);
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", resize); };
  }, [visible, x, y, zoom]);
  return <NodeToolbar isVisible={visible} position={Position.Bottom} offset={14}><div ref={ref} className="wx-parameters nodrag nopan" style={{ maxHeight: height }} onDoubleClick={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>{children}</div></NodeToolbar>;
}
