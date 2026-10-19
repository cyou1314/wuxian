"use client";

/**
 * RoleStudioNode — 角色造型室节点
 * 展示并编辑角色 7 个描述字段；正/侧/背三视图槽位绑定 {{Image 1..3}}。
 */
import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "./NodeShell";
import { useCanvasStore } from "@/store/useCanvasStore";
import { IMAGE_SLOT_LABELS } from "@/types/libtv-schema";
import type { RoleStudioNodeData } from "@/types/libtv-schema";

const FIELDS: Array<{ key: "name" | "age" | "hairstyle" | "outfit" | "props" | "facial" | "aura"; label: string }> = [
  { key: "name", label: "姓名" },
  { key: "age", label: "年龄" },
  { key: "hairstyle", label: "发型" },
  { key: "outfit", label: "服饰" },
  { key: "props", label: "道具" },
  { key: "facial", label: "五官" },
  { key: "aura", label: "气质" },
];

const SLOTS: Array<{ view: "front" | "side" | "back"; slot: "image1" | "image2" | "image3" }> = [
  { view: "front", slot: "image1" },
  { view: "side", slot: "image2" },
  { view: "back", slot: "image3" },
];

const inputCls =
  "w-full rounded border border-[var(--wx-border)] bg-[var(--wx-bg-input)] px-2 py-1 text-[11px] text-[var(--wx-text-1)] outline-none focus:border-[var(--wx-accent)]";

export default function RoleStudioNode(props: NodeProps) {
  const { id, selected } = props;
  const data = props.data as unknown as RoleStudioNodeData;
  const character = useCanvasStore((s) => s.characters.find((c) => c.id === data.characterId));
  const stale = useCanvasStore((s) => s.graph.nodes.find((n) => n.id === id)?.stale ?? false);
  const upsertCharacter = useCanvasStore((s) => s.upsertCharacter);
  const patchNodeData = useCanvasStore((s) => s.patchNodeData);
  const touchNode = useCanvasStore((s) => s.touchNode);

  const handleField = (key: (typeof FIELDS)[number]["key"]) => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!character) return;
    upsertCharacter({ ...character, [key]: e.target.value });
  };

  const handleFile = (slot: "front" | "side" | "back") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !character) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      const views = { ...character.views, [slot]: url };
      upsertCharacter({ ...character, views });
      patchNodeData(id, { views });
      touchNode(id);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleRemoveView = (slot: "front" | "side" | "back") => () => {
    if (!character) return;
    const views = { ...character.views };
    delete views[slot];
    upsertCharacter({ ...character, views });
    patchNodeData(id, { views });
    touchNode(id);
  };

  if (!character) {
    return (
      <NodeShell id={id} title="角色造型室" stale={stale} selected={selected} accent="var(--wx-accent)" width={300}>
        <div className="text-[11px] text-[var(--wx-danger)]">角色不存在：{data.characterId}</div>
      </NodeShell>
    );
  }

  return (
    <NodeShell
      id={id}
      title={`角色造型室 · ${character.name}`}
      stale={stale}
      selected={selected}
      accent="var(--wx-accent)"
      width={300}
    >
      <div className="space-y-1.5">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex items-center gap-2">
            <span className="w-8 shrink-0 text-[11px] text-[var(--wx-text-2)]">{f.label}</span>
            <input
              className={inputCls}
              value={character[f.key]}
              onChange={handleField(f.key)}
              onBlur={() => touchNode(id)}
            />
          </label>
        ))}
      </div>

      <div className="mt-3 space-y-2 border-t border-[var(--wx-border)] pt-2">
        <div className="text-[11px] font-medium text-[var(--wx-text-2)]">三视图参考</div>
        {SLOTS.map(({ view, slot }) => {
          const url = character.views[view];
          return (
            <div key={view} className="flex items-center gap-2">
              <div className="w-24 shrink-0 text-[11px] text-[var(--wx-text-2)]">{IMAGE_SLOT_LABELS[slot]}</div>
              {url ? (
                <>
                  <img src={url} alt={view} className="h-14 w-14 rounded border border-[var(--wx-border)] object-cover" />
                  <div className="flex flex-col gap-1">
                    <label className="cursor-pointer rounded border border-[var(--wx-border)] bg-[var(--wx-bg-hover)] px-2 py-0.5 text-[11px] text-[var(--wx-text-2)] hover:bg-[var(--wx-bg-hover)]">
                      更换
                      <input type="file" accept="image/*" className="hidden" onChange={handleFile(view)} />
                    </label>
                    <button
                      className="rounded border border-[var(--wx-border)] bg-[var(--wx-bg-hover)] px-2 py-0.5 text-[11px] text-[var(--wx-danger)] hover:bg-[var(--wx-danger)]/20"
                      onClick={handleRemoveView(view)}
                    >
                      删除
                    </button>
                  </div>
                </>
              ) : (
                <label className="cursor-pointer rounded border border-dashed border-[var(--wx-border)] px-3 py-2 text-[11px] text-[var(--wx-text-2)] hover:border-[var(--wx-accent)] hover:text-[var(--wx-text-2)]">
                  点击上传图片
                  <input type="file" accept="image/*" className="hidden" onChange={handleFile(view)} />
                </label>
              )}
            </div>
          );
        })}
      </div>
    </NodeShell>
  );
}
