/**
 * prompt-compiler.ts — 7 段式生图 + 5 段式视频运动双向编译器
 *
 * 正向：将 AST 编译为严格公式字符串；
 * 反向：将完整字符串用正则拆解回 7 段 / 5 段独立字段；
 * 另含 {{Image N}} 槽位重写器与 rawPrompt 旁路开关。
 */

import type {
  ImagePromptAST,
  ImageSlotToken,
  ReferenceSlots,
  VideoMotionAST,
} from "@/types/libtv-schema";
import { IMAGE_SLOT_TOKENS } from "@/types/libtv-schema";

// ---------------------------------------------------------------------------
// 7 段式分镜生图公式
// [画面构图：{景别}，{视角}] + [{角色1}: {角色描述1}] + [人物空间与互动关系：{站位与构图关系}]
// + [极具体的微表情与面部特写：{眼神与表情细节}] + [明确的场景环境元素与前景/背景道具：{远中近景环境}]
// + [光影几何与大气效果：{主辅光/丁达尔/色温}]
// + [视觉风格/胶片质感：{画风}，{焦段如24mm/35mm/50mm/85mm镜头}，{光圈如f/1.4~f/5.6}].
// ---------------------------------------------------------------------------

const IMG_LABELS = {
  composition: "画面构图：",
  spatialRelation: "人物空间与互动关系：",
  microExpression: "极具体的微表情与面部特写：",
  environment: "明确的场景环境元素与前景/背景道具：",
  lighting: "光影几何与大气效果：",
  style: "视觉风格/胶片质感：",
} as const;

const SEG_SEP = " + ";

/** 正向编译：ImagePromptAST → 7 段式公式字符串 */
export function compileImagePrompt(ast: ImagePromptAST): string {
  const segs = [
    `[${IMG_LABELS.composition}${ast.composition.shotSize}，${ast.composition.angle}]`,
    `[${ast.character}]`,
    `[${IMG_LABELS.spatialRelation}${ast.spatialRelation}]`,
    `[${IMG_LABELS.microExpression}${ast.microExpression}]`,
    `[${IMG_LABELS.environment}${ast.environment}]`,
    `[${IMG_LABELS.lighting}${ast.lighting}]`,
    `[${IMG_LABELS.style}${ast.style.artStyle}，${ast.style.focalLength}，${ast.style.aperture}]`,
  ];
  return segs.join(SEG_SEP) + ".";
}

/** 去掉首尾空白与末尾句号 */
function normalizePrompt(s: string): string {
  return s.trim().replace(/[.。]\s*$/, "");
}

/** 反向解析：7 段式公式字符串 → ImagePromptAST；段数/标签不符返回 null */
export function parseImagePrompt(raw: string): ImagePromptAST | null {
  const parts = normalizePrompt(raw).split(SEG_SEP);
  if (parts.length !== 7) return null;

  const inner = (seg: string, label?: string): string | null => {
    const m = /^\[(.*)\]$/s.exec(seg.trim());
    if (!m) return null;
    const body = m[1];
    if (label) {
      if (!body.startsWith(label)) return null;
      return body.slice(label.length);
    }
    return body;
  };

  const composition = inner(parts[0], IMG_LABELS.composition);
  const character = inner(parts[1]);
  const spatialRelation = inner(parts[2], IMG_LABELS.spatialRelation);
  const microExpression = inner(parts[3], IMG_LABELS.microExpression);
  const environment = inner(parts[4], IMG_LABELS.environment);
  const lighting = inner(parts[5], IMG_LABELS.lighting);
  const styleRaw = inner(parts[6], IMG_LABELS.style);
  if (
    composition === null ||
    character === null ||
    spatialRelation === null ||
    microExpression === null ||
    environment === null ||
    lighting === null ||
    styleRaw === null
  ) {
    return null;
  }

  // 段1：景别，视角 —— 按第一个中文逗号切分
  const ci = composition.indexOf("，");
  const shotSize = ci >= 0 ? composition.slice(0, ci) : composition;
  const angle = ci >= 0 ? composition.slice(ci + 1) : "";

  // 段7：画风，焦段，光圈 —— 从右往左取最后两段，剩余归画风
  const styleParts = styleRaw.split("，");
  const aperture = styleParts.length >= 2 ? styleParts[styleParts.length - 1] : "";
  const focalLength = styleParts.length >= 2 ? styleParts[styleParts.length - 2] : "";
  const artStyle =
    styleParts.length >= 3 ? styleParts.slice(0, -2).join("，") : (styleParts[0] ?? "");

  return {
    composition: { shotSize, angle },
    character,
    spatialRelation,
    microExpression,
    environment,
    lighting,
    style: { artStyle, focalLength, aperture },
  };
}

// ---------------------------------------------------------------------------
// 5 段式视频运动公式
// [明确的摄影机运镜轨迹与速度：{…}] + [主体极其具体的物理动作细节：{…}]
// + [环境物理动态：{…}] + [音效与音乐氛围描述：{…}] + [时长：{3.0s/4.0s/5.0s}].
// ---------------------------------------------------------------------------

const VID_LABELS = {
  cameraMove: "明确的摄影机运镜轨迹与速度：",
  subjectAction: "主体极其具体的物理动作细节：",
  envDynamics: "环境物理动态：",
  audio: "音效与音乐氛围描述：",
  duration: "时长：",
} as const;

/** 正向编译：VideoMotionAST → 5 段式公式字符串 */
export function compileVideoMotion(ast: VideoMotionAST): string {
  const segs = [
    `[${VID_LABELS.cameraMove}${ast.cameraMove}]`,
    `[${VID_LABELS.subjectAction}${ast.subjectAction}]`,
    `[${VID_LABELS.envDynamics}${ast.envDynamics}]`,
    `[${VID_LABELS.audio}${ast.audio}]`,
    `[${VID_LABELS.duration}${ast.duration}]`,
  ];
  return segs.join(SEG_SEP) + ".";
}

/** 反向解析：5 段式公式字符串 → VideoMotionAST；不符返回 null */
export function parseVideoMotion(raw: string): VideoMotionAST | null {
  const parts = normalizePrompt(raw).split(SEG_SEP);
  if (parts.length !== 5) return null;

  const inner = (seg: string, label: string): string | null => {
    const m = /^\[(.*)\]$/s.exec(seg.trim());
    if (!m || !m[1].startsWith(label)) return null;
    return m[1].slice(label.length);
  };

  const cameraMove = inner(parts[0], VID_LABELS.cameraMove);
  const subjectAction = inner(parts[1], VID_LABELS.subjectAction);
  const envDynamics = inner(parts[2], VID_LABELS.envDynamics);
  const audio = inner(parts[3], VID_LABELS.audio);
  const duration = inner(parts[4], VID_LABELS.duration);
  if (
    cameraMove === null ||
    subjectAction === null ||
    envDynamics === null ||
    audio === null ||
    duration === null
  ) {
    return null;
  }
  return { cameraMove, subjectAction, envDynamics, audio, duration };
}

// ---------------------------------------------------------------------------
// {{Image N}} 槽位重写器
// ---------------------------------------------------------------------------

/** 提取提示词中出现的所有槽位 token（去重、保序） */
export function extractSlotTokens(prompt: string): ImageSlotToken[] {
  const found: ImageSlotToken[] = [];
  for (const t of IMAGE_SLOT_TOKENS) {
    if (prompt.includes(t) && !found.includes(t)) found.push(t);
  }
  return found;
}

/**
 * 槽位重写：将 {{Image 1/2/3}} 替换为绑定的参考图 URL；
 * 未绑定的槽位保留 token 原样（下游可据此提示补图）。
 */
export function rewriteImageSlots(
  prompt: string,
  slots: ReferenceSlots,
): { text: string; replaced: ImageSlotToken[]; unbound: ImageSlotToken[] } {
  const replaced: ImageSlotToken[] = [];
  const unbound: ImageSlotToken[] = [];
  let text = prompt;
  const bindings: Array<[ImageSlotToken, string | undefined]> = [
    ["{{Image 1}}", slots.image1],
    ["{{Image 2}}", slots.image2],
    ["{{Image 3}}", slots.image3],
  ];
  for (const [token, url] of bindings) {
    if (!text.includes(token)) continue;
    if (url) {
      text = text.split(token).join(url);
      replaced.push(token);
    } else {
      unbound.push(token);
    }
  }
  return { text, replaced, unbound };
}

// ---------------------------------------------------------------------------
// 统一解析入口（含 rawPrompt 旁路）
// ---------------------------------------------------------------------------

export interface ResolvedPrompt {
  /** 最终发往模型的字符串（审计时写入 toolCalls[].function.arguments.resolvedPrompt） */
  resolved: string;
  /** 是否走了 raw 旁路（跳过重写器） */
  usedRaw: boolean;
  unboundSlots: ImageSlotToken[];
}

/**
 * 解析分镜生图提示词。
 * rawPrompt=true 且提供 rawText 时：跳过编译与槽位重写，原样直发。
 */
export function resolveImagePrompt(
  input: { ast: ImagePromptAST; rawText?: string },
  slots: ReferenceSlots,
  opts: { rawPrompt: boolean },
): ResolvedPrompt {
  if (opts.rawPrompt && input.rawText !== undefined) {
    return { resolved: input.rawText, usedRaw: true, unboundSlots: [] };
  }
  const compiled = compileImagePrompt(input.ast);
  const { text, unbound } = rewriteImageSlots(compiled, slots);
  return { resolved: text, usedRaw: false, unboundSlots: unbound };
}

/** 解析视频运动提示词（同上，含 raw 旁路） */
export function resolveVideoMotionPrompt(
  input: { ast: VideoMotionAST; rawText?: string },
  opts: { rawPrompt: boolean },
): ResolvedPrompt {
  if (opts.rawPrompt && input.rawText !== undefined) {
    return { resolved: input.rawText, usedRaw: true, unboundSlots: [] };
  }
  return { resolved: compileVideoMotion(input.ast), usedRaw: false, unboundSlots: [] };
}
