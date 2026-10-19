"use client";

/**
 * StoryboardTableNode — 17 列分镜总表节点
 * 完整表格编辑（本地副本 + onBlur 一次性提交）、审核确认、一键展开到画布。
 */
import { useEffect, useRef, useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "./NodeShell";
import { useCanvasStore } from "@/store/useCanvasStore";
import { STORYBOARD_COLUMNS, STORYBOARD_COLUMN_LABELS } from "@/types/libtv-schema";
import type { StoryboardColumnKey, StoryboardRow, StoryboardTableNodeData } from "@/types/libtv-schema";

const COL_WIDTHS: Record<StoryboardColumnKey, number> = {
  shotNo: 52,
  duration: 60,
  description: 220,
  char1Name: 80,
  char1Desc: 200,
  char1Image: 120,
  char2Name: 80,
  char2Desc: 200,
  char2Image: 120,
  reference: 120,
  shotSize: 80,
  emotion: 90,
  lighting: 160,
  sfx: 120,
  dialogue: 160,
  imagePrompt: 260,
  videoMotionPrompt: 260,
};

const btnCls =
  "rounded border border-[var(--wx-border)] bg-[var(--wx-bg-hover)] px-2 py-1 text-[11px] text-[var(--wx-text-1)] hover:bg-[var(--wx-bg-hover)]";
const cellInputCls =
  "w-full bg-transparent px-1 py-1 text-[11px] text-[var(--wx-text-1)] outline-none focus:bg-[var(--wx-bg-input)] focus:text-[var(--wx-text-1)]";

function blankRow(shotNo: string): StoryboardRow {
  return {
    shotNo,
    duration: 4,
    description: "",
    char1Name: "",
    char1Desc: "",
    char1Image: "",
    char2Name: "",
    char2Desc: "",
    char2Image: "",
    reference: "",
    shotSize: "",
    emotion: "",
    lighting: "",
    sfx: "",
    dialogue: "",
    imagePrompt: "",
    videoMotionPrompt: "",
  };
}

export default function StoryboardTableNode(props: NodeProps) {
  const { id, selected } = props;
  const data = props.data as unknown as StoryboardTableNodeData;
  const stale = useCanvasStore((s) => s.graph.nodes.find((n) => n.id === id)?.stale ?? false);
  const setStoryboardRows = useCanvasStore((s) => s.setStoryboardRows);
  const approveStoryboard = useCanvasStore((s) => s.approveStoryboard);
  const expandStoryboard = useCanvasStore((s) => s.expandStoryboard);

  const [localRows, setLocalRows] = useState<StoryboardRow[]>(data.rows);
  const localRef = useRef(localRows);
  localRef.current = localRows;

  useEffect(() => {
    setLocalRows(data.rows);
  }, [data.rows]);

  const commit = () => setStoryboardRows(localRef.current);

  const editCell = (rowIndex: number, col: StoryboardColumnKey, value: string) => {
    setLocalRows((prev) =>
      prev.map((r, j) => {
        if (j !== rowIndex) return r;
        const next = { ...r };
        if (col === "duration") {
          next.duration = parseFloat(value) || 0;
        } else {
          next[col] = value;
        }
        return next;
      }),
    );
  };

  const addRow = () => {
    const next = [...localRef.current, blankRow(String(localRef.current.length + 1))];
    setLocalRows(next);
    localRef.current = next;
    setStoryboardRows(next);
  };

  const removeRow = (rowIndex: number) => () => {
    const next = localRef.current.filter((_, j) => j !== rowIndex);
    setLocalRows(next);
    localRef.current = next;
    setStoryboardRows(next);
  };

  const totalDuration = localRows.reduce((sum, r) => sum + (r.duration || 0), 0);

  return (
    <NodeShell
      id={id}
      title={`分镜总表 · ${localRows.length} 镜`}
      stale={stale}
      selected={selected}
      accent="var(--wx-accent)"
      width={920}
      showTarget={false}
    >
      <div className="mb-2 flex items-center gap-3">
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-[var(--wx-text-2)]">
          <input
            type="checkbox"
            checked={data.approved}
            onChange={(e) => approveStoryboard(e.target.checked)}
            className="accent-[var(--wx-accent)]"
          />
          已审核确认
        </label>
        <button className={btnCls} onClick={() => expandStoryboard(id)} disabled={localRows.length === 0}>
          展开到画布
        </button>
        <button className={btnCls} onClick={addRow}>
          + 添加一镜
        </button>
        <span className="text-[11px] text-[var(--wx-text-2)]">
          共 {localRows.length} 镜 · 总时长 {totalDuration}s
        </span>
      </div>

      <div className="max-h-[420px] overflow-auto rounded border border-[var(--wx-border)]">
        <table className="border-collapse">
          <thead className="sticky top-0 z-10 bg-[var(--wx-bg-panel)]">
            <tr>
              {STORYBOARD_COLUMNS.map((col) => (
                <th
                  key={col}
                  style={{ minWidth: COL_WIDTHS[col] }}
                  className="border-b border-r border-[var(--wx-border)] px-1 py-1.5 text-left text-[11px] font-medium text-[var(--wx-text-2)] last:border-r-0"
                >
                  {STORYBOARD_COLUMN_LABELS[col]}
                </th>
              ))}
              <th className="w-10 border-b border-[var(--wx-border)] px-1 py-1.5 text-[11px] font-medium text-[var(--wx-text-2)]">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {localRows.map((row, i) => (
              <tr key={i} className="border-b border-[var(--wx-border-soft)] last:border-b-0 hover:bg-[var(--wx-bg-hover)]">
                {STORYBOARD_COLUMNS.map((col) => (
                  <td key={col} className="border-r border-[var(--wx-border-soft)] last:border-r-0">
                    {col === "duration" ? (
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        className={cellInputCls}
                        value={row.duration}
                        onChange={(e) => editCell(i, col, e.target.value)}
                        onBlur={commit}
                      />
                    ) : (
                      <input
                        className={cellInputCls}
                        value={row[col]}
                        onChange={(e) => editCell(i, col, e.target.value)}
                        onBlur={commit}
                      />
                    )}
                  </td>
                ))}
                <td className="px-1 text-center">
                  <button
                    className="rounded px-1.5 text-[12px] text-[var(--wx-text-2)] hover:bg-[var(--wx-danger)]/20 hover:text-[var(--wx-danger)]"
                    onClick={removeRow(i)}
                    title="删除该镜"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
            {localRows.length === 0 && (
              <tr>
                <td colSpan={STORYBOARD_COLUMNS.length + 1} className="px-2 py-6 text-center text-[11px] text-[var(--wx-text-3)]">
                  暂无分镜，点击「添加一镜」或从剧本节点推送拆镜
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </NodeShell>
  );
}
