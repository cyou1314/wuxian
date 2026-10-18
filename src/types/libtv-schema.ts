/**
 * libtv-schema.ts — 无限画布工作台完整数据契约
 *
 * 覆盖：画布图谱（节点/边）、17 列分镜总表、7+5 段式提示词 AST、
 * {{Image N}} 参考槽位、OpenAPI 会话协议、Dola 生成引擎与多账号额度类型。
 *
 * 本文件只放类型与纯常量；解析/编译逻辑在 src/lib/ 下。
 */

// ---------------------------------------------------------------------------
// 基础
// ---------------------------------------------------------------------------

export interface Vec2 {
  x: number;
  y: number;
}

/** 8 种画布节点类型 */
export type LibTVNodeType =
  | "roleStudio"
  | "scriptEditor"
  | "storyboardTable"
  | "shotImage"
  | "videoGen"
  | "layerSplit"
  | "threeDBox"
  | "smartClip";

/** 2 种边类型：数据流边 / AutoLink @引用虚线边 */
export type LibTVEdgeType = "dataflow" | "autolink";

// ---------------------------------------------------------------------------
// 17 列分镜总表
// ---------------------------------------------------------------------------

/** 17 列的键（顺序即表格列序，不得删减、不得调序） */
export const STORYBOARD_COLUMNS = [
  "shotNo",
  "duration",
  "description",
  "char1Name",
  "char1Desc",
  "char1Image",
  "char2Name",
  "char2Desc",
  "char2Image",
  "reference",
  "shotSize",
  "emotion",
  "lighting",
  "sfx",
  "dialogue",
  "imagePrompt",
  "videoMotionPrompt",
] as const;

export type StoryboardColumnKey = (typeof STORYBOARD_COLUMNS)[number];

/** 17 列中文表头 */
export const STORYBOARD_COLUMN_LABELS: Record<StoryboardColumnKey, string> = {
  shotNo: "镜号",
  duration: "时长",
  description: "画面描述",
  char1Name: "角色1",
  char1Desc: "角色描述1",
  char1Image: "角色图1",
  char2Name: "角色2",
  char2Desc: "角色描述2",
  char2Image: "角色图2",
  reference: "参考",
  shotSize: "景别",
  emotion: "情绪",
  lighting: "光影氛围",
  sfx: "音效",
  dialogue: "对白",
  imagePrompt: "分镜提示词",
  videoMotionPrompt: "视频运动提示词",
};

type StoryboardTextColumns = Exclude<StoryboardColumnKey, "duration">;

/**
 * 分镜表行。时长为数字（秒），其余 16 列为字符串。
 * 角色描述列严格采用格式：[角色名: 年龄+发型+服饰+道具+五官+气质]
 */
export interface StoryboardRow extends Record<StoryboardTextColumns, string> {
  duration: number;
}

/** 角色描述结构化字段（对应 [角色名: 年龄+发型+服饰+道具+五官+气质]） */
export interface CharacterDescFields {
  name: string;
  age: string;
  hairstyle: string;
  outfit: string;
  props: string;
  facial: string;
  aura: string;
}

/** 将结构化字段编译为标准的角色描述字符串 */
export function formatCharacterDesc(f: CharacterDescFields): string {
  return `[${f.name}: ${f.age}+${f.hairstyle}+${f.outfit}+${f.props}+${f.facial}+${f.aura}]`;
}

/** 将标准的角色描述字符串反向解析为结构化字段；格式不符返回 null */
export function parseCharacterDesc(s: string): CharacterDescFields | null {
  const m = /^\[(.+?):\s*(.+?)\+(.+?)\+(.+?)\+(.+?)\+(.+?)\+(.+?)\]$/.exec(s.trim());
  if (!m) return null;
  const [, name, age, hairstyle, outfit, props, facial, aura] = m;
  return { name, age, hairstyle, outfit, props, facial, aura };
}

// ---------------------------------------------------------------------------
// {{Image N}} 多参考图槽位
// ---------------------------------------------------------------------------

export interface ReferenceSlots {
  /** {{Image 1}} 面部基准 */
  image1?: string;
  /** {{Image 2}} 体型服装基准 */
  image2?: string;
  /** {{Image 3}} 构图排版基准 */
  image3?: string;
}

export const IMAGE_SLOT_TOKENS = ["{{Image 1}}", "{{Image 2}}", "{{Image 3}}"] as const;
export type ImageSlotToken = (typeof IMAGE_SLOT_TOKENS)[number];

export const IMAGE_SLOT_LABELS: Record<keyof ReferenceSlots, string> = {
  image1: "{{Image 1}}（面部基准）",
  image2: "{{Image 2}}（体型服装基准）",
  image3: "{{Image 3}}（构图排版基准）",
};

// ---------------------------------------------------------------------------
// 7 段式分镜生图 AST / 5 段式视频运动 AST
// ---------------------------------------------------------------------------

/** 7 段式分镜提示词 AST（编译公式见 prompt-compiler.ts） */
export interface ImagePromptAST {
  /** 段1 [画面构图：{景别}，{视角}] */
  composition: { shotSize: string; angle: string };
  /** 段2 [{角色1}: {角色描述1}] */
  character: string;
  /** 段3 [人物空间与互动关系：{站位与构图关系}] */
  spatialRelation: string;
  /** 段4 [极具体的微表情与面部特写：{眼神与表情细节}] */
  microExpression: string;
  /** 段5 [明确的场景环境元素与前景/背景道具：{远中近景环境}] */
  environment: string;
  /** 段6 [光影几何与大气效果：{主辅光/丁达尔/色温}] */
  lighting: string;
  /** 段7 [视觉风格/胶片质感：{画风}，{焦段}，{光圈}] */
  style: { artStyle: string; focalLength: string; aperture: string };
}

/** 5 段式视频运动提示词 AST */
export interface VideoMotionAST {
  /** 段1 [明确的摄影机运镜轨迹与速度] */
  cameraMove: string;
  /** 段2 [主体极其具体的物理动作细节] */
  subjectAction: string;
  /** 段3 [环境物理动态] */
  envDynamics: string;
  /** 段4 [音效与音乐氛围描述] */
  audio: string;
  /** 段5 [时长] */
  duration: string;
}

/** 提示词解析模式：结构化 AST 表单 vs 原始字符串直发 */
export interface PromptResolveOptions {
  /** true = 跳过重写器，原样直发模型（审计时保留在 toolCalls[].function.arguments.resolvedPrompt） */
  rawPrompt: boolean;
}

// ---------------------------------------------------------------------------
// 角色资产
// ---------------------------------------------------------------------------

export interface CharacterAsset {
  id: string;
  name: string;
  age: string;
  hairstyle: string;
  outfit: string;
  props: string;
  /** 五官细节（五官/发型/痣疤痕等） */
  facial: string;
  /** 气质 */
  aura: string;
  /** 正/侧/背三视图，依次绑定 {{Image 1..3}} */
  views: { front?: string; side?: string; back?: string };
  /** 绑定的角色造型室节点 id */
  roleNodeId?: string;
}

// ---------------------------------------------------------------------------
// 画布图谱
// ---------------------------------------------------------------------------

export interface RoleStudioNodeData {
  characterId: string;
  /** 三视图槽位（与 CharacterAsset.views 同步） */
  views: { front?: string; side?: string; back?: string };
}

export interface ScriptEditorNodeData {
  original: string;
  adapted: string;
  /** 冲突改写对比 */
  conflicts: Array<{ id: string; before: string; after: string; resolved: boolean }>;
  /** 伏笔关联提示 */
  foreshadows: Array<{ id: string; text: string; linkedShotNo?: string }>;
}

export interface StoryboardTableNodeData {
  rows: StoryboardRow[];
  /** 手动审核确认 */
  approved: boolean;
}

export interface ShotImageNodeData extends PromptResolveOptions {
  shotNo: string;
  imageUrl?: string;
  /** 预览分辨率 2752×1536 */
  previewSize: { w: number; h: number };
  imagePromptAST: ImagePromptAST;
  referenceSlots: ReferenceSlots;
  /** 来源分镜表行（可回溯） */
  rowRef?: { tableNodeId: string; rowIndex: number };
  /** 宫格切分产生的子节点 id */
  children?: string[];
}

export interface VideoGenNodeData extends PromptResolveOptions {
  shotNo: string;
  videoUrl?: string;
  motionAST: VideoMotionAST;
  /** 生成引擎：本项目固定为 dola */
  engine: "dola";
  dolaTaskId?: string;
  /** 毫秒级重拍选区 */
  reshootRanges: Array<{ startMs: number; endMs: number }>;
  /** 视频续写：上一段视频的 vid/URL */
  continueFrom?: string;
}

export interface LayerSplitNodeData {
  sourceImageUrl: string;
  layers: Array<{
    id: string;
    kind: "foreground" | "prop" | "text" | "background";
    label: string;
    imageUrl?: string;
    transform: { x: number; y: number; scale: number; depth: number };
  }>;
}

export interface ThreeDBoxNodeData {
  sceneJson: string;
  /** 手绘运镜轨迹转出的相机运动向量 */
  cameraMoves: Array<{
    id: string;
    type: "push" | "pull" | "pan" | "tilt" | "dolly" | "orbit" | "crane";
    from: Vec2;
    to: Vec2;
    durationMs: number;
  }>;
}

export interface SmartClipNodeData {
  sourceVideoNodeIds: string[];
  /** 去口水词粗剪 */
  trimSilence: boolean;
  subtitles: boolean;
  bgmCuePoints: number[];
}

export type CanvasNodeData =
  | ({ kind: "roleStudio" } & RoleStudioNodeData)
  | ({ kind: "scriptEditor" } & ScriptEditorNodeData)
  | ({ kind: "storyboardTable" } & StoryboardTableNodeData)
  | ({ kind: "shotImage" } & ShotImageNodeData)
  | ({ kind: "videoGen" } & VideoGenNodeData)
  | ({ kind: "layerSplit" } & LayerSplitNodeData)
  | ({ kind: "threeDBox" } & ThreeDBoxNodeData)
  | ({ kind: "smartClip" } & SmartClipNodeData);

export interface CanvasNode {
  id: string;
  type: LibTVNodeType;
  position: Vec2;
  data: CanvasNodeData;
  /** 上游修改导致的脏状态（待重新生成） */
  stale: boolean;
  width?: number;
  height?: number;
}

export interface CanvasEdge {
  id: string;
  type: LibTVEdgeType;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  /** autolink 边携带引用角色 id */
  characterId?: string;
}

export interface CanvasGraph {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

// ---------------------------------------------------------------------------
// 四维逐帧拉片
// ---------------------------------------------------------------------------

/** 拉片维度：叙事分镜 / 精彩运镜 / 动作片段 / 音频参考 */
export type BreakdownDimension = "narrative" | "camera" | "action" | "audio";

export const BREAKDOWN_DIMENSION_LABELS: Record<BreakdownDimension, string> = {
  narrative: "叙事分镜",
  camera: "精彩运镜",
  action: "动作片段",
  audio: "音频参考",
};

export interface BreakdownNote {
  id: string;
  /** 时间点（毫秒） */
  timeMs: number;
  text: string;
}

export type FrameBreakdown = Record<BreakdownDimension, BreakdownNote[]>;

/** 空拉片 */
export function emptyBreakdown(): FrameBreakdown {
  return { narrative: [], camera: [], action: [], audio: [] };
}

// ---------------------------------------------------------------------------
// OpenAPI 会话协议（兼容 libtv-skills）
// ---------------------------------------------------------------------------

export type SessionRole = "user" | "assistant" | "system";

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    /** JSON 字符串；resolvedPrompt 字段保留最终发往模型的提示词（供审计） */
    arguments: string;
  };
}

export interface SessionMessage {
  seq: number;
  role: SessionRole;
  content: string;
  toolCalls?: ToolCall[];
  createdAt: number;
}

export interface OpenAPISession {
  sessionId: string;
  projectUuid: string;
  messages: SessionMessage[];
  nextSeq: number;
}

export interface CreateSessionRequest {
  projectUuid?: string;
  message?: string;
}

export interface CreateSessionResponse {
  data: {
    projectUuid: string;
    sessionId: string;
    resolvedPrompt?: string;
  };
}

export interface GetSessionMessagesResponse {
  data: {
    sessionId: string;
    messages: SessionMessage[];
    latestSeq: number;
  };
}

/** TV Director 在画布上创建/更新分镜表与节点时的操作 */
export type DirectorOp =
  | { op: "upsertStoryboardTable"; nodeId: string; rows: StoryboardRow[] }
  | { op: "expandStoryboardToNodes"; tableNodeId: string }
  | { op: "updateNodePrompt"; nodeId: string; imagePrompt?: string; videoMotionPrompt?: string };

// ---------------------------------------------------------------------------
// Dola 生成引擎
// ---------------------------------------------------------------------------

export type DolaModel = "seedance_v2.5" | "seedance_v2.0" | "seedance_v1.0";
export type DolaRatio = "1:1" | "3:4" | "4:3" | "9:16" | "16:9" | "21:9";

/** Dola 账号（多账号池成员） */
export interface DolaAccount {
  id: string;
  label: string;
  /** 加密后的 session cookie（AES-GCM，绝不明文落盘） */
  cookieCipher: string;
  /** 今日剩余额度（null = 未知，取自最近一次提交的配额文本） */
  quotaRemaining: number | null;
  /** 今日已消耗额度（本地累计） */
  quotaDailyUsed: number;
  status: "active" | "exhausted" | "invalid";
  updatedAt: number;
}

export type DolaTaskStatus =
  | "queued"
  | "submitting"
  | "generating"
  | "polling"
  | "succeeded"
  | "failed";

export interface DolaVideoTask {
  id: string;
  kind: "video";
  prompt: string;
  model: DolaModel;
  /** 时长秒数：5~30（Dola ability_param.duration 直传） */
  duration: number;
  ratio: DolaRatio;
  accountId: string;
  status: DolaTaskStatus;
  conversationId?: string;
  vid?: string;
  /** get_play_info 返回的无水印原文件直链 */
  playUrl?: string;
  quotaCost?: number;
  error?: string;
  createdAt: number;
}

export interface DolaImageTask {
  id: string;
  kind: "image";
  prompt: string;
  ratio: DolaRatio;
  accountId: string;
  status: DolaTaskStatus;
  conversationId?: string;
  imageUrl?: string;
  quotaCost?: number;
  error?: string;
  createdAt: number;
}

export type DolaTask = DolaVideoTask | DolaImageTask;

/** 从提交 SSE 配额文本解析出的额度信息 */
export interface DolaQuotaInfo {
  /** 本次消耗额度 */
  cost: number;
  /** 今日剩余（文本未给出时为 null） */
  remaining: number | null;
  rawText: string;
}
