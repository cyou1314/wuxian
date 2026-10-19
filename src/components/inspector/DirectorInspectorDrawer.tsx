"use client";

/**
 * DirectorInspectorDrawer — 右侧结构化参数精修台
 *
 * 分镜节点：7 段式 AST 表单；视频节点：5 段式 AST 表单；
 * AST 表单与 Raw Prompt 双模切换，实时编译预览，应用后级联 stale。
 */
import { useEffect, useState } from "react";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useUIStore } from "@/store/useUIStore";
import { compileImagePrompt, compileVideoMotion } from "@/lib/prompt-compiler";
import type { ImagePromptAST, VideoMotionAST } from "@/types/libtv-schema";

function Field({
  label,
  value,
  onChange,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  textarea?: boolean;
}) {
  const cls =
    "w-full rounded bg-[var(--wx-text-1)]/5 px-2 py-1.5 text-[12px] text-[var(--wx-text-1)] outline-none focus:ring-1 focus:ring-[var(--wx-accent)]";
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-[var(--wx-text-2)]">{label}</span>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} className={cls} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className={cls} />
      )}
    </label>
  );
}

const BLANK_IMG: ImagePromptAST = {
  composition: { shotSize: "", angle: "" },
  character: "",
  spatialRelation: "",
  microExpression: "",
  environment: "",
  lighting: "",
  style: { artStyle: "", focalLength: "", aperture: "" },
};

const BLANK_VID: VideoMotionAST = {
  cameraMove: "",
  subjectAction: "",
  envDynamics: "",
  audio: "",
  duration: "",
};

export default function DirectorInspectorDrawer() {
  const nodeId = useUIStore((s) => s.inspectorNodeId);
  const close = useUIStore((s) => s.closeInspector);
  const node = useCanvasStore((s) => s.graph.nodes.find((n) => n.id === nodeId));
  const patchNodeData = useCanvasStore((s) => s.patchNodeData);
  const touchNode = useCanvasStore((s) => s.touchNode);

  const [imgAst, setImgAst] = useState<ImagePromptAST>(BLANK_IMG);
  const [vidAst, setVidAst] = useState<VideoMotionAST>(BLANK_VID);
  const [rawPrompt, setRawPrompt] = useState(false);
  const [rawText, setRawText] = useState("");

  useEffect(() => {
    if (!node) return;
    const d = node.data as unknown as Record<string, unknown>;
    if (node.data.kind === "shotImage") {
      setImgAst(
        JSON.parse(JSON.stringify((d["imagePromptAST"] as ImagePromptAST) ?? BLANK_IMG)),
      );
      setRawPrompt((d["rawPrompt"] as boolean) ?? false);
      setRawText((d["rawText"] as string) ?? "");
    } else if (node.data.kind === "videoGen") {
      setVidAst(JSON.parse(JSON.stringify((d["motionAST"] as VideoMotionAST) ?? BLANK_VID)));
      setRawPrompt((d["rawPrompt"] as boolean) ?? false);
      setRawText((d["rawText"] as string) ?? "");
    }
  }, [nodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!nodeId || !node) return null;
  const kind = node.data.kind;
  const isShot = kind === "shotImage";
  const isVideo = kind === "videoGen";

  const preview = isShot
    ? rawPrompt
      ? rawText
      : compileImagePrompt(imgAst)
    : isVideo
      ? rawPrompt
        ? rawText
        : compileVideoMotion(vidAst)
      : "";

  const apply = () => {
    if (isShot) {
      patchNodeData(nodeId, { imagePromptAST: imgAst, rawPrompt, rawText });
    } else if (isVideo) {
      patchNodeData(nodeId, { motionAST: vidAst, rawPrompt, rawText });
    }
    touchNode(nodeId);
  };

  const setImg = (patch: Partial<ImagePromptAST>) => setImgAst((a) => ({ ...a, ...patch }));
  const setVid = (patch: Partial<VideoMotionAST>) => setVidAst((a) => ({ ...a, ...patch }));

  return (
    <div role="dialog" aria-label="导演精修台" className="fixed top-0 right-0 z-40 flex h-full w-[380px] max-w-[92vw] flex-col border-l border-[var(--wx-border)] bg-[var(--wx-bg-panel)] shadow-2xl">
      <div className="flex items-center justify-between border-b border-[var(--wx-border)] px-4 py-3">
        <h2 className="text-sm font-semibold">导演精修台 · {node.id}</h2>
        <button onClick={close} className="rounded px-2 text-[var(--wx-text-2)] hover:bg-[var(--wx-text-1)]/10">
          ×
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-auto p-4">
        {(isShot || isVideo) && (
          <label className="flex items-center gap-2 text-[12px] text-[var(--wx-text-2)]">
            <input
              type="checkbox"
              checked={rawPrompt}
              onChange={(e) => setRawPrompt(e.target.checked)}
              className="accent-[var(--wx-accent)]"
            />
            Raw Prompt 直发模式（跳过 7/5 段重写器）
          </label>
        )}

        {rawPrompt ? (
          <Field label="Raw Prompt（原样直发模型）" value={rawText} onChange={setRawText} textarea />
        ) : (
          <>
            {isShot && (
              <>
                <Field label="段1 · 景别" value={imgAst.composition.shotSize} onChange={(v) => setImg({ composition: { ...imgAst.composition, shotSize: v } })} />
                <Field label="段1 · 视角" value={imgAst.composition.angle} onChange={(v) => setImg({ composition: { ...imgAst.composition, angle: v } })} />
                <Field label="段2 · 角色" value={imgAst.character} onChange={(v) => setImg({ character: v })} textarea />
                <Field label="段3 · 人物空间与互动关系" value={imgAst.spatialRelation} onChange={(v) => setImg({ spatialRelation: v })} textarea />
                <Field label="段4 · 微表情与面部特写" value={imgAst.microExpression} onChange={(v) => setImg({ microExpression: v })} textarea />
                <Field label="段5 · 场景环境元素" value={imgAst.environment} onChange={(v) => setImg({ environment: v })} textarea />
                <Field label="段6 · 光影几何与大气" value={imgAst.lighting} onChange={(v) => setImg({ lighting: v })} textarea />
                <Field label="段7 · 视觉风格" value={imgAst.style.artStyle} onChange={(v) => setImg({ style: { ...imgAst.style, artStyle: v } })} />
                <Field label="段7 · 焦段" value={imgAst.style.focalLength} onChange={(v) => setImg({ style: { ...imgAst.style, focalLength: v } })} />
                <Field label="段7 · 光圈" value={imgAst.style.aperture} onChange={(v) => setImg({ style: { ...imgAst.style, aperture: v } })} />
              </>
            )}
            {isVideo && (
              <>
                <Field label="段1 · 运镜轨迹与速度" value={vidAst.cameraMove} onChange={(v) => setVid({ cameraMove: v })} textarea />
                <Field label="段2 · 主体动作细节" value={vidAst.subjectAction} onChange={(v) => setVid({ subjectAction: v })} textarea />
                <Field label="段3 · 环境物理动态" value={vidAst.envDynamics} onChange={(v) => setVid({ envDynamics: v })} textarea />
                <Field label="段4 · 音效与音乐氛围" value={vidAst.audio} onChange={(v) => setVid({ audio: v })} textarea />
                <Field label="段5 · 时长" value={vidAst.duration} onChange={(v) => setVid({ duration: v })} />
              </>
            )}
          </>
        )}

        {!isShot && !isVideo && (
          <pre className="overflow-auto rounded bg-[var(--wx-text-1)]/5 p-2 text-[11px] text-[var(--wx-text-2)]">
            {JSON.stringify(node.data, null, 2)}
          </pre>
        )}

        {(isShot || isVideo) && (
          <div>
            <span className="mb-1 block text-[11px] text-[var(--wx-text-2)]">编译预览（将写入审计 resolvedPrompt）</span>
            <pre className="max-h-48 overflow-auto rounded bg-[var(--wx-bg-canvas)]/40 p-2 text-[11px] whitespace-pre-wrap text-[var(--wx-accent)]/90">
              {preview || "（空）"}
            </pre>
          </div>
        )}
      </div>

      {(isShot || isVideo) && (
        <div className="border-t border-[var(--wx-border)] p-4">
          <button
            onClick={apply}
            className="wx-primary w-full rounded bg-[var(--wx-accent)]/80 py-2 text-sm font-medium text-[var(--wx-text-1)] hover:bg-[var(--wx-accent)]"
          >
            应用并标记下游待更新
          </button>
        </div>
      )}
    </div>
  );
}
