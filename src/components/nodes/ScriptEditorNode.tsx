"use client";

/**
 * ScriptEditorNode — 剧本原创与改编节点
 * 原创/改编双文本编辑、冲突改写对比、伏笔关联、一键推送拆镜生成分镜表节点。
 */
import { useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "./NodeShell";
import { useCanvasStore } from "@/store/useCanvasStore";
import type {
  CanvasEdge,
  CanvasNode,
  ScriptEditorNodeData,
  StoryboardRow,
} from "@/types/libtv-schema";

const inputCls =
  "w-full rounded border border-[#2a2f3d] bg-[#0d1017] px-2 py-1 text-[11px] text-slate-200 outline-none focus:border-[#34d399]";
const btnCls =
  "rounded border border-[#2a2f3d] bg-[#1d2230] px-2 py-1 text-[11px] text-slate-200 hover:bg-[#252b3d] disabled:cursor-not-allowed disabled:opacity-40";

/** 按非空段落切分：优先按空行分段，单段时退化为按换行分段 */
function splitParagraphs(text: string): string[] {
  const byBlank = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (byBlank.length > 1) return byBlank;
  return text
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean);
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function blankRow(shotNo: string, description: string): StoryboardRow {
  return {
    shotNo,
    duration: 4,
    description,
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

export default function ScriptEditorNode(props: NodeProps) {
  const { id, selected } = props;
  const data = props.data as unknown as ScriptEditorNodeData;
  const stale = useCanvasStore((s) => s.graph.nodes.find((n) => n.id === id)?.stale ?? false);
  const position = useCanvasStore((s) => s.graph.nodes.find((n) => n.id === id)?.position);
  const patchNodeData = useCanvasStore((s) => s.patchNodeData);
  const touchNode = useCanvasStore((s) => s.touchNode);
  const upsertNode = useCanvasStore((s) => s.upsertNode);
  const addEdge = useCanvasStore((s) => s.addEdge);

  const [confBefore, setConfBefore] = useState("");
  const [confAfter, setConfAfter] = useState("");
  const [foreText, setForeText] = useState("");
  const [foreShot, setForeShot] = useState("");

  const paragraphCount = splitParagraphs(data.adapted).length;

  const toggleConflict = (cid: string) => () => {
    patchNodeData(id, {
      conflicts: data.conflicts.map((c) => (c.id === cid ? { ...c, resolved: !c.resolved } : c)),
    });
    touchNode(id);
  };

  const addConflict = () => {
    if (!confBefore.trim() || !confAfter.trim()) return;
    patchNodeData(id, {
      conflicts: [...data.conflicts, { id: newId("conf"), before: confBefore.trim(), after: confAfter.trim(), resolved: false }],
    });
    setConfBefore("");
    setConfAfter("");
    touchNode(id);
  };

  const removeConflict = (cid: string) => () => {
    patchNodeData(id, { conflicts: data.conflicts.filter((c) => c.id !== cid) });
    touchNode(id);
  };

  const addForeshadow = () => {
    if (!foreText.trim()) return;
    patchNodeData(id, {
      foreshadows: [
        ...data.foreshadows,
        {
          id: newId("fore"),
          text: foreText.trim(),
          linkedShotNo: foreShot.trim() || undefined,
        },
      ],
    });
    setForeText("");
    setForeShot("");
  };

  const removeForeshadow = (fid: string) => () => {
    patchNodeData(id, { foreshadows: data.foreshadows.filter((f) => f.id !== fid) });
  };

  const patchForeshadowShot = (fid: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    patchNodeData(id, {
      foreshadows: data.foreshadows.map((f) =>
        f.id === fid ? { ...f, linkedShotNo: e.target.value.trim() || undefined } : f,
      ),
    });
  };

  const pushToStoryboard = () => {
    const parts = splitParagraphs(data.adapted);
    if (parts.length === 0) return;
    const rows = parts.map((p, i) => blankRow(String(i + 1), p));
    const tableId = `table-${id}-${Date.now().toString(36)}`;
    const node: CanvasNode = {
      id: tableId,
      type: "storyboardTable",
      position: { x: (position?.x ?? 0) + 420, y: position?.y ?? 0 },
      data: { kind: "storyboardTable", rows, approved: false },
      stale: false,
    };
    upsertNode(node);
    const edge: CanvasEdge = {
      id: `e-${id}-${tableId}`,
      type: "dataflow",
      source: id,
      target: tableId,
    };
    addEdge(edge);
  };

  return (
    <NodeShell id={id} title="剧本编辑器" stale={stale} selected={selected} accent="#34d399" width={380}>
      <div className="space-y-3">
        <div>
          <div className="mb-1 text-[11px] font-medium text-slate-400">原创剧本</div>
          <textarea
            className={`${inputCls} h-20 resize-y`}
            value={data.original}
            onChange={(e) => patchNodeData(id, { original: e.target.value })}
            onBlur={() => touchNode(id)}
            placeholder="输入原创剧本…"
          />
        </div>
        <div>
          <div className="mb-1 text-[11px] font-medium text-slate-400">改编剧本</div>
          <textarea
            className={`${inputCls} h-20 resize-y`}
            value={data.adapted}
            onChange={(e) => patchNodeData(id, { adapted: e.target.value })}
            onBlur={() => touchNode(id)}
            placeholder="输入改编后剧本…"
          />
        </div>

        <div className="border-t border-[#2a2f3d] pt-2">
          <div className="mb-1 text-[11px] font-medium text-slate-400">
            冲突改写对比（{data.conflicts.filter((c) => c.resolved).length}/{data.conflicts.length} 已采用）
          </div>
          <div className="space-y-1.5">
            {data.conflicts.map((c) => (
              <div key={c.id} className="rounded border border-[#2a2f3d] bg-[#0d1017] p-2">
                <div className="text-[11px] text-slate-500">
                  改前：<span className={c.resolved ? "text-slate-600 line-through" : "text-slate-400 line-through"}>{c.before}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-200">改后：{c.after}</div>
                <div className="mt-1 flex gap-1">
                  <button className={btnCls} onClick={toggleConflict(c.id)}>
                    {c.resolved ? "已采用 ✓" : "采用改写"}
                  </button>
                  <button className={`${btnCls} text-red-300`} onClick={removeConflict(c.id)}>
                    删除
                  </button>
                </div>
              </div>
            ))}
            {data.conflicts.length === 0 && (
              <div className="text-[11px] text-slate-600">暂无改写对比</div>
            )}
          </div>
          <div className="mt-1.5 flex gap-1">
            <input className={inputCls} value={confBefore} onChange={(e) => setConfBefore(e.target.value)} placeholder="改前文本" />
            <input className={inputCls} value={confAfter} onChange={(e) => setConfAfter(e.target.value)} placeholder="改后文本" />
            <button className={`${btnCls} shrink-0`} onClick={addConflict} disabled={!confBefore.trim() || !confAfter.trim()}>
              添加
            </button>
          </div>
        </div>

        <div className="border-t border-[#2a2f3d] pt-2">
          <div className="mb-1 text-[11px] font-medium text-slate-400">伏笔关联（{data.foreshadows.length}）</div>
          <div className="space-y-1.5">
            {data.foreshadows.map((f) => (
              <div key={f.id} className="flex items-center gap-1 rounded border border-[#2a2f3d] bg-[#0d1017] p-1.5">
                <span className="flex-1 text-[11px] text-slate-200">{f.text}</span>
                <input
                  className="w-14 rounded border border-[#2a2f3d] bg-[#12151d] px-1 py-0.5 text-[11px] text-slate-300 outline-none"
                  value={f.linkedShotNo ?? ""}
                  onChange={patchForeshadowShot(f.id)}
                  placeholder="镜号"
                  title="关联镜号"
                />
                <button className={`${btnCls} shrink-0 !px-1.5`} onClick={removeForeshadow(f.id)} title="删除伏笔">
                  ×
                </button>
              </div>
            ))}
            {data.foreshadows.length === 0 && (
              <div className="text-[11px] text-slate-600">暂无伏笔</div>
            )}
          </div>
          <div className="mt-1.5 flex gap-1">
            <input className={inputCls} value={foreText} onChange={(e) => setForeText(e.target.value)} placeholder="伏笔内容" />
            <input className={`${inputCls} !w-16 shrink-0`} value={foreShot} onChange={(e) => setForeShot(e.target.value)} placeholder="镜号" />
            <button className={`${btnCls} shrink-0`} onClick={addForeshadow} disabled={!foreText.trim()}>
              添加
            </button>
          </div>
        </div>

        <button
          className="w-full rounded bg-[#34d399]/15 border border-[#34d399]/40 px-2 py-1.5 text-[12px] font-medium text-emerald-300 hover:bg-[#34d399]/25 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={pushToStoryboard}
          disabled={paragraphCount === 0}
        >
          一键推送拆镜{paragraphCount > 0 ? `（${paragraphCount} 镜）` : ""}
        </button>
      </div>
    </NodeShell>
  );
}
