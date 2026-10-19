"use client";

/**
 * GridSplitterModal — 可拖拽分割线宫格切分器
 *
 * 2×2 / 3×3 模式，横向（ns-resize）与纵向（ew-resize）分割线自由拖拽，
 * 实时显示每格裁切像素尺寸；确认后用 canvas 精确裁切并批量生成子 ShotImageNode。
 */
import { useEffect, useRef, useState } from "react";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useUIStore } from "@/store/useUIStore";
import {
  childNodePosition,
  computeCells,
  cropCells,
  loadImage,
} from "@/lib/grid-slicer";
import type { ImagePromptAST } from "@/types/libtv-schema";

type Mode = "2x2" | "3x3";

const DEFAULT_LINES: Record<Mode, number[]> = {
  "2x2": [0.5],
  "3x3": [1 / 3, 2 / 3],
};

export default function GridSplitterModal() {
  const nodeId = useUIStore((s) => s.gridSplitterNodeId);
  const close = useUIStore((s) => s.closeGridSplitter);
  const node = useCanvasStore((s) => s.graph.nodes.find((n) => n.id === nodeId));
  const upsertNode = useCanvasStore((s) => s.upsertNode);
  const addEdge = useCanvasStore((s) => s.addEdge);

  const [mode, setMode] = useState<Mode>("2x2");
  const [verticals, setVerticals] = useState<number[]>(DEFAULT_LINES["2x2"]);
  const [horizontals, setHorizontals] = useState<number[]>(DEFAULT_LINES["2x2"]);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ axis: "v" | "h"; index: number } | null>(null);

  const isShot = node?.data.kind === "shotImage";
  const imageUrl = isShot
    ? (node.data as { imageUrl?: string }).imageUrl
    : undefined;

  useEffect(() => {
    setVerticals([...DEFAULT_LINES[mode]]);
    setHorizontals([...DEFAULT_LINES[mode]]);
  }, [mode]);

  useEffect(() => {
    if (!imageUrl) return;
    let alive = true;
    loadImage(imageUrl)
      .then((img) => {
        if (alive) setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
      })
      .catch(() => alive && setError("图片加载失败，无法切分"));
    return () => {
      alive = false;
    };
  }, [imageUrl]);

  if (!nodeId || !node || !isShot || !imageUrl) return null;

  const cells =
    imgSize.w > 0 ? computeCells(imgSize.w, imgSize.h, verticals, horizontals) : [];

  const clampLines = (lines: number[], i: number, f: number): number[] => {
    const next = [...lines];
    const lo = i === 0 ? 0.05 : next[i - 1] + 0.05;
    const hi = i === lines.length - 1 ? 0.95 : next[i + 1] - 0.05;
    next[i] = Math.min(hi, Math.max(lo, f));
    return next;
  };

  const onMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const box = boxRef.current;
    if (!drag || !box) return;
    const rect = box.getBoundingClientRect();
    if (drag.axis === "v") {
      const f = (e.clientX - rect.left) / rect.width;
      setVerticals((v) => clampLines(v, drag.index, f));
    } else {
      const f = (e.clientY - rect.top) / rect.height;
      setHorizontals((h) => clampLines(h, drag.index, f));
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      const img = await loadImage(imageUrl);
      const rects = computeCells(img.naturalWidth, img.naturalHeight, verticals, horizontals);
      const crops = await cropCells(img, rects);
      const parent = node.data as {
        shotNo: string;
        imagePromptAST: ImagePromptAST;
        rowRef?: { tableNodeId: string; rowIndex: number };
      };
      crops.forEach(({ blob, rect }, i) => {
        const url = URL.createObjectURL(blob);
        const childId = `${nodeId}-cell-${i}`;
        const pos = childNodePosition(node.position.x, node.position.y, i);
        upsertNode({
          id: childId,
          type: "shotImage",
          position: pos,
          data: {
            kind: "shotImage",
            shotNo: `${parent.shotNo}-${i + 1}`,
            imageUrl: url,
            previewSize: { w: rect.w, h: rect.h },
            imagePromptAST: JSON.parse(JSON.stringify(parent.imagePromptAST)),
            rawPrompt: false,
            referenceSlots: {},
            rowRef: parent.rowRef,
          },
          stale: false,
        });
        addEdge({
          id: `e-${nodeId}-${childId}`,
          type: "dataflow",
          source: nodeId,
          target: childId,
        });
      });
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "切分失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--wx-bg-canvas)]/70 p-6">
      <div className="max-h-full w-full max-w-4xl overflow-auto rounded-xl border border-[var(--wx-border)] bg-[var(--wx-bg-panel)] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">宫格切分器</h2>
          <button onClick={close} className="rounded px-2 text-[var(--wx-text-2)] hover:bg-[var(--wx-text-1)]/10">
            ×
          </button>
        </div>

        <div className="mb-3 flex gap-2">
          {(["2x2", "3x3"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded px-3 py-1 text-sm ${
                mode === m ? "bg-[var(--wx-accent)]/20 text-[var(--wx-accent)]" : "bg-[var(--wx-text-1)]/5 text-[var(--wx-text-2)]"
              }`}
            >
              {m === "2x2" ? "四宫格" : "九宫格"}
            </button>
          ))}
          <span className="ml-2 self-center text-xs text-[var(--wx-text-2)]">
            原图 {imgSize.w}×{imgSize.h}px · 拖拽青色分割线调整
          </span>
        </div>

        <div
          ref={boxRef}
          className="relative select-none overflow-hidden rounded-lg border border-[var(--wx-border)]"
          onPointerMove={onMove}
          onPointerUp={() => (dragRef.current = null)}
          onPointerLeave={() => (dragRef.current = null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="待切分" className="block w-full" draggable={false} />
          {verticals.map((f, i) => (
            <div
              key={`v${i}`}
              className="absolute top-0 bottom-0 w-1.5 -translate-x-1/2 cursor-ew-resize bg-[var(--wx-accent)]/80 hover:bg-[var(--wx-accent)]"
              style={{ left: `${f * 100}%` }}
              onPointerDown={(e) => {
                e.preventDefault();
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                dragRef.current = { axis: "v", index: i };
              }}
            />
          ))}
          {horizontals.map((f, i) => (
            <div
              key={`h${i}`}
              className="absolute left-0 right-0 h-1.5 -translate-y-1/2 cursor-ns-resize bg-[var(--wx-accent)]/80 hover:bg-[var(--wx-accent)]"
              style={{ top: `${f * 100}%` }}
              onPointerDown={(e) => {
                e.preventDefault();
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                dragRef.current = { axis: "h", index: i };
              }}
            />
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {cells.map((c, i) => (
            <span key={i} className="rounded bg-[var(--wx-text-1)]/5 px-2 py-1 text-[11px] text-[var(--wx-text-2)]">
              格{i + 1}：{c.w}×{c.h}
            </span>
          ))}
        </div>

        {error && <p className="mt-3 text-sm text-[var(--wx-danger)]">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={close}
            className="rounded bg-[var(--wx-text-1)]/5 px-4 py-2 text-sm text-[var(--wx-text-2)] hover:bg-[var(--wx-text-1)]/10"
          >
            取消
          </button>
          <button
            onClick={confirm}
            disabled={busy || cells.length === 0}
            className="wx-primary rounded bg-[var(--wx-accent)]/80 px-4 py-2 text-sm font-medium text-[var(--wx-text-1)] hover:bg-[var(--wx-accent)] disabled:opacity-50"
          >
            {busy ? "裁切中…" : `确认切分并生成 ${cells.length} 个节点`}
          </button>
        </div>
      </div>
    </div>
  );
}
