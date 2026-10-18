/**
 * autolink-engine.ts — AutoLink 智能 @角色/资产引用引擎
 *
 * 在任意 Prompt 输入框中：
 *  1. 词法扫描 `@角色名` 或裸角色名，命中已注册的 CharacterAsset；
 *  2. 自动高亮实体（返回 Mention 区间供 UI 渲染）；
 *  3. 自动在画布上建立 RoleStudioNode → 当前节点的引用虚线边；
 *  4. 自动把该角色的三视图基准图绑定到当前节点的 referenceSlots。
 */

import type {
  CanvasEdge,
  CharacterAsset,
  ReferenceSlots,
} from "@/types/libtv-schema";

export interface Mention {
  characterId: string;
  name: string;
  /** 在文本中的起始下标 */
  index: number;
  /** 命中长度（含 @） */
  length: number;
  /** 是否通过 @ 显式引用 */
  viaAt: boolean;
}

/** 转义正则特殊字符 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 词法扫描：先匹配 @name，再匹配裸名（避开已被 @ 覆盖的区间）。
 * 同一角色在同一文本中只保留首次命中。
 */
export function scanMentions(text: string, characters: CharacterAsset[]): Mention[] {
  const mentions: Mention[] = [];
  const claimed: Array<[number, number]> = [];
  const overlaps = (a: number, b: number) =>
    claimed.some(([s, e]) => a < e && s < b);

  // Pass 1: @显式引用
  for (const c of characters) {
    if (!c.name) continue;
    const re = new RegExp(`@${escapeRegExp(c.name)}`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (overlaps(start, end)) continue;
      claimed.push([start, end]);
      mentions.push({
        characterId: c.id,
        name: c.name,
        index: start,
        length: m[0].length,
        viaAt: true,
      });
      break; // 每角色只取首次
    }
  }

  // Pass 2: 裸名匹配
  for (const c of characters) {
    if (!c.name || mentions.some((x) => x.characterId === c.id)) continue;
    const idx = text.indexOf(c.name);
    if (idx === -1 || overlaps(idx, idx + c.name.length)) continue;
    claimed.push([idx, idx + c.name.length]);
    mentions.push({
      characterId: c.id,
      name: c.name,
      index: idx,
      length: c.name.length,
      viaAt: false,
    });
  }

  return mentions.sort((a, b) => a.index - b.index);
}

/** AutoLink 引用边的确定性 id（用于去重） */
export function autolinkEdgeId(roleNodeId: string, targetNodeId: string): string {
  return `autolink:${roleNodeId}->${targetNodeId}`;
}

/**
 * 为一次 Mention 生成引用边：RoleStudioNode → 当前节点。
 * 角色没有绑定 roleNodeId 时无法建边，返回 null（调用方可提示先建角色节点）。
 */
export function mentionToEdge(
  mention: Mention,
  character: CharacterAsset,
  targetNodeId: string,
): CanvasEdge | null {
  if (!character.roleNodeId) return null;
  return {
    id: autolinkEdgeId(character.roleNodeId, targetNodeId),
    type: "autolink",
    source: character.roleNodeId,
    target: targetNodeId,
    sourceHandle: null,
    targetHandle: null,
    characterId: character.id,
  };
}

/**
 * 把角色三视图绑定到节点的 referenceSlots：
 * {{Image 1}}=正视图（面部基准）、{{Image 2}}=侧视图（体型服装基准）、{{Image 3}}=背视图（构图排版基准）。
 * 只填充空槽位，不覆盖用户已手动绑定的图。
 */
export function bindCharacterSlots(
  character: CharacterAsset,
  current: ReferenceSlots,
): ReferenceSlots {
  return {
    image1: current.image1 ?? character.views.front,
    image2: current.image2 ?? character.views.side,
    image3: current.image3 ?? character.views.back,
  };
}

export interface AutoLinkResult {
  mentions: Mention[];
  /** 新增的引用边（已按现有边去重） */
  newEdges: CanvasEdge[];
  /** 每个命中角色的槽位合并结果：characterId → 合并后 slots */
  slotBindings: Array<{ characterId: string; slots: ReferenceSlots }>;
  /** 有命中但尚未绑定角色节点的角色（UI 可提示创建） */
  unboundCharacters: CharacterAsset[];
}

/**
 * 一站式 AutoLink：扫描文本 → 生成引用边 → 合并槽位。
 * existingEdges 用于去重已存在的引用边。
 */
export function applyAutoLink(
  targetNodeId: string,
  text: string,
  characters: CharacterAsset[],
  currentSlots: ReferenceSlots,
  existingEdges: CanvasEdge[],
): AutoLinkResult {
  const mentions = scanMentions(text, characters);
  const byId = new Map(characters.map((c) => [c.id, c]));
  const existingIds = new Set(existingEdges.map((e) => e.id));

  const newEdges: CanvasEdge[] = [];
  const slotBindings: AutoLinkResult["slotBindings"] = [];
  const unboundCharacters: CharacterAsset[] = [];
  const seenChars = new Set<string>();

  for (const m of mentions) {
    const c = byId.get(m.characterId);
    if (!c || seenChars.has(c.id)) continue;
    seenChars.add(c.id);

    if (!c.roleNodeId) {
      unboundCharacters.push(c);
      continue;
    }
    const edge = mentionToEdge(m, c, targetNodeId);
    if (edge && !existingIds.has(edge.id)) {
      newEdges.push(edge);
      existingIds.add(edge.id);
    }
    slotBindings.push({ characterId: c.id, slots: bindCharacterSlots(c, currentSlots) });
  }

  return { mentions, newEdges, slotBindings, unboundCharacters };
}
