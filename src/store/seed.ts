/**
 * seed.ts — 画布初始图谱种子数据
 *
 * 双角色（顾长宁 × 师姐）+ 9 镜完整 17 列分镜表 + 分镜图节点 + 视频节点。
 * 所有分镜提示词 / 视频运动提示词均由 prompt-compiler 按 7+5 段式公式编译生成，
 * 保证种子数据与线上公式严格一致。
 */

import { compileImagePrompt, compileVideoMotion } from "@/lib/prompt-compiler";
import type {
  CanvasEdge,
  CanvasGraph,
  CanvasNode,
  CharacterAsset,
  ImagePromptAST,
  StoryboardRow,
  VideoMotionAST,
} from "@/types/libtv-schema";

// ---------------------------------------------------------------------------
// 角色
// ---------------------------------------------------------------------------

const GC_DESC = "[顾长宁: 18岁+黑色长发束起+玄色劲装+雁回刀+剑眉星目+冷峻坚毅]";
const SJ_DESC = "[师姐: 20岁+银白长发+月白道袍+赤手空拳+眉目清冷+超然物外]";

export const SEED_CHARACTERS: CharacterAsset[] = [
  {
    id: "char-guchangning",
    name: "顾长宁",
    age: "18岁",
    hairstyle: "黑色长发束起",
    outfit: "玄色劲装",
    props: "雁回刀",
    facial: "剑眉星目",
    aura: "冷峻坚毅",
    views: {},
    roleNodeId: "role-guchangning",
  },
  {
    id: "char-shijie",
    name: "师姐",
    age: "20岁",
    hairstyle: "银白长发",
    outfit: "月白道袍",
    props: "赤手空拳",
    facial: "眉目清冷",
    aura: "超然物外",
    views: {},
    roleNodeId: "role-shijie",
  },
];

// ---------------------------------------------------------------------------
// 9 镜分镜定义
// ---------------------------------------------------------------------------

interface ShotDef {
  shotNo: string;
  duration: number;
  description: string;
  chars: Array<{ name: string; desc: string }>;
  reference: string;
  shotSize: string;
  angle: string;
  emotion: string;
  lighting: string;
  sfx: string;
  dialogue: string;
  img: Omit<ImagePromptAST, "composition"> & { shotSize: string; angle: string };
  vid: VideoMotionAST;
}

const SHOTS: ShotDef[] = [
  {
    shotNo: "1",
    duration: 4,
    description: "雪山断崖横亘天地，一线雪桥横跨万丈深渊，风雪漫天",
    chars: [],
    reference: "",
    shotSize: "大远景",
    angle: "鸟瞰微俯",
    emotion: "苍凉肃杀",
    lighting: "阴天漫射冷光，雪雾弥漫，色温7000K",
    sfx: "风声呼啸",
    dialogue: "（无）",
    img: {
      shotSize: "大远景",
      angle: "鸟瞰微俯",
      character: "（空镜，无人物）",
      spatialRelation: "雪桥横贯画面三分之一处，深渊居下，群峰压顶",
      microExpression: "无人物",
      environment: "远景雪山群峰、中景断崖雪桥、前景飘雪",
      lighting: "阴天漫射冷光，雪雾弥漫，色温7000K",
      style: { artStyle: "水墨电影质感", focalLength: "24mm镜头", aperture: "f/8" },
    },
    vid: {
      cameraMove: "缓慢横移环绕雪桥",
      subjectAction: "空镜，无主体动作",
      envDynamics: "风雪漫天，雪粒横飞",
      audio: "风声呼啸+低沉弦乐铺底",
      duration: "4.0s",
    },
  },
  {
    shotNo: "2",
    duration: 3,
    description: "顾长宁仗刀立于桥头，衣袂翻飞",
    chars: [{ name: "顾长宁", desc: GC_DESC }],
    reference: "{{Image 1}}",
    shotSize: "全身景",
    angle: "平视微仰",
    emotion: "沉稳蓄势",
    lighting: "侧逆光勾勒轮廓，雪粒丁达尔，色温6000K",
    sfx: "风声，衣袂猎猎",
    dialogue: "顾长宁：“师姐，雁回关前，你我终有一战。”",
    img: {
      shotSize: "全身景",
      angle: "平视微仰",
      character: `顾长宁: ${GC_DESC}`,
      spatialRelation: "人物居左站位，右侧留白指向桥面纵深",
      microExpression: "眼神锐利如刀，嘴角紧抿",
      environment: "桥头石栏、脚下深渊云雾、远景雪峰",
      lighting: "侧逆光勾勒轮廓，雪粒丁达尔，色温6000K",
      style: { artStyle: "电影质感", focalLength: "35mm镜头", aperture: "f/2.8" },
    },
    vid: {
      cameraMove: "缓慢前推",
      subjectAction: "0-1s 衣袂翻飞，1-3s 右手缓按刀柄",
      envDynamics: "风雪拂面，衣袂翻卷",
      audio: "风声+衣袂猎猎声",
      duration: "3.0s",
    },
  },
  {
    shotNo: "3",
    duration: 3,
    description: "师姐踏雪而来，周身银白掌劲流转",
    chars: [{ name: "师姐", desc: SJ_DESC }],
    reference: "{{Image 1}}",
    shotSize: "全身景",
    angle: "平视",
    emotion: "超然淡漠",
    lighting: "柔光漫射，掌劲微光，色温6500K",
    sfx: "雪落簌簌，气劲低鸣",
    dialogue: "师姐：“长宁，收刀吧。”",
    img: {
      shotSize: "全身景",
      angle: "平视",
      character: `师姐: ${SJ_DESC}`,
      spatialRelation: "人物居右，左侧留白，桥面为引导线",
      microExpression: "眼神淡漠，唇线平直",
      environment: "桥面雪道、远处顾长宁背影虚化",
      lighting: "柔光漫射，掌劲辉光，色温6500K",
      style: { artStyle: "电影质感", focalLength: "35mm镜头", aperture: "f/2.8" },
    },
    vid: {
      cameraMove: "侧向横移跟拍",
      subjectAction: "0-2s 踏雪前行，2-3s 掌心银光渐盛",
      envDynamics: "雪花被气劲排开，形成无形气场",
      audio: "雪落簌簌声+气劲低鸣",
      duration: "3.0s",
    },
  },
  {
    shotNo: "4",
    duration: 5,
    description: "两人隔桥对峙，气氛凝滞",
    chars: [
      { name: "顾长宁", desc: GC_DESC },
      { name: "师姐", desc: SJ_DESC },
    ],
    reference: "{{Image 1}}{{Image 2}}",
    shotSize: "中全景",
    angle: "平视",
    emotion: "剑拔弩张",
    lighting: "顶光转阴，云层压低，色温6200K",
    sfx: "风声骤紧",
    dialogue: "（无对白）",
    img: {
      shotSize: "中全景",
      angle: "平视",
      character: `顾长宁: ${GC_DESC}；师姐: ${SJ_DESC}`,
      spatialRelation: "顾长宁居左、师姐居右，三分法对称站位，桥面为视觉引导线",
      microExpression: "两人眼神交锋，顾长宁眉头微锁，师姐面无表情",
      environment: "远景雪山、中景雪桥、前景飘雪",
      lighting: "低气压顶光，云层压低，色温6200K",
      style: { artStyle: "电影质感", focalLength: "50mm镜头", aperture: "f/4" },
    },
    vid: {
      cameraMove: "环绕180度缓慢移动",
      subjectAction: "两人静立对视，衣袂翻飞",
      envDynamics: "风雪加剧，雪粒横飞",
      audio: "风声骤紧+心跳般鼓点",
      duration: "5.0s",
    },
  },
  {
    shotNo: "5",
    duration: 4,
    description: "顾长宁拔刀出鞘，红金刀光乍现",
    chars: [{ name: "顾长宁", desc: GC_DESC }],
    reference: "{{Image 1}}",
    shotSize: "特写",
    angle: "微仰",
    emotion: "杀意迸发",
    lighting: "刀光为实用主光，红金色，色温4500K",
    sfx: "锵——刀鸣",
    dialogue: "顾长宁：“得罪了！”",
    img: {
      shotSize: "特写",
      angle: "微仰",
      character: `顾长宁: ${GC_DESC}`,
      spatialRelation: "右手拔刀瞬间，刀身斜贯画面，手部居视觉中心",
      microExpression: "眼神如电，眉头紧锁",
      environment: "背景虚化雪桥，焦点在刀身",
      lighting: "刀光红金辉光为主光，雪粒反光，色温4500K",
      style: { artStyle: "电影质感", focalLength: "85mm镜头", aperture: "f/1.8" },
    },
    vid: {
      cameraMove: "急速前推",
      subjectAction: "0-0.5s 拔刀出鞘，0.5-2s 刀光暴涨",
      envDynamics: "雪粒被刀气震散",
      audio: "刀鸣+气爆声",
      duration: "3.0s",
    },
  },
  {
    shotNo: "6",
    duration: 5,
    description: "银白掌劲与红金刀光正面相撞，气浪翻涌",
    chars: [
      { name: "顾长宁", desc: GC_DESC },
      { name: "师姐", desc: SJ_DESC },
    ],
    reference: "{{Image 1}}{{Image 2}}",
    shotSize: "中景",
    angle: "侧面平视",
    emotion: "激烈碰撞",
    lighting: "双色光源对冲，红金 vs 银白，色温混合",
    sfx: "轰然巨响",
    dialogue: "（无对白）",
    img: {
      shotSize: "中景",
      angle: "侧面平视",
      character: `顾长宁: ${GC_DESC}；师姐: ${SJ_DESC}`,
      spatialRelation: "左侧刀光右劈、右侧掌劲左推，画面中央为能量爆点",
      microExpression: "两人发力表情，顾长宁怒目，师姐凝神",
      environment: "气浪呈环形扩散，桥面积雪翻卷",
      lighting: "双色辉光对冲，冲击波纹，色温混合",
      style: { artStyle: "电影质感", focalLength: "35mm镜头", aperture: "f/2.8" },
    },
    vid: {
      cameraMove: "希区柯克变焦",
      subjectAction: "0-1s 刀掌相接，1-3s 气浪翻涌扩散",
      envDynamics: "积雪被掀飞，气浪环形扩散",
      audio: "轰然巨响+耳鸣声",
      duration: "4.0s",
    },
  },
  {
    shotNo: "7",
    duration: 4,
    description: "雪桥从中断裂，碎石坠入深渊",
    chars: [],
    reference: "",
    shotSize: "大远景",
    angle: "侧面微俯",
    emotion: "险象环生",
    lighting: "阴云密布，尘雪飞扬，色温6800K",
    sfx: "断裂轰鸣，碎石坠落",
    dialogue: "（无对白）",
    img: {
      shotSize: "大远景",
      angle: "侧面微俯",
      character: "（空镜，无人物）",
      spatialRelation: "雪桥中断裂口居中，断裂两端向画面两侧延伸",
      microExpression: "无人物",
      environment: "裂缝特写质感、深渊云雾、坠落碎石",
      lighting: "阴云密布，尘雪飞扬，色温6800K",
      style: { artStyle: "灾难电影质感", focalLength: "24mm镜头", aperture: "f/5.6" },
    },
    vid: {
      cameraMove: "快速拉远",
      subjectAction: "桥体断裂下沉",
      envDynamics: "碎石雪块坠落深渊，尘雪腾起",
      audio: "断裂轰鸣+碎石坠落声",
      duration: "4.0s",
    },
  },
  {
    shotNo: "8",
    duration: 5,
    description: "两人身形交错，刀光掌影难分",
    chars: [
      { name: "顾长宁", desc: GC_DESC },
      { name: "师姐", desc: SJ_DESC },
    ],
    reference: "{{Image 1}}{{Image 2}}",
    shotSize: "近景",
    angle: "低角度仰拍",
    emotion: "酣战正烈",
    lighting: "高速动态光影，残影拖尾，色温5500K",
    sfx: "金铁交鸣连响",
    dialogue: "（无对白）",
    img: {
      shotSize: "近景",
      angle: "低角度仰拍",
      character: `顾长宁: ${GC_DESC}；师姐: ${SJ_DESC}`,
      spatialRelation: "两人身形交错瞬间，刀光划出弧线贯穿画面",
      microExpression: "表情专注凌厉",
      environment: "背景高速虚化，雪粒拉线",
      lighting: "高速动态光影，残影拖尾，色温5500K",
      style: { artStyle: "武侠电影质感", focalLength: "50mm镜头", aperture: "f/2.0" },
    },
    vid: {
      cameraMove: "环绕跟拍",
      subjectAction: "0-2s 三次交手，残影连绵",
      envDynamics: "雪被劲风卷成旋涡",
      audio: "金铁交鸣连响",
      duration: "5.0s",
    },
  },
  {
    shotNo: "9",
    duration: 6,
    description: "两人背对而立，风雪渐紧，定格",
    chars: [
      { name: "顾长宁", desc: GC_DESC },
      { name: "师姐", desc: SJ_DESC },
    ],
    reference: "{{Image 3}}",
    shotSize: "全景",
    angle: "背面平视",
    emotion: "惺惺相惜的苍凉",
    lighting: "暮色将至，剪影效果，色温5000K",
    sfx: "风声渐远，一声叹息",
    dialogue: "师姐：“……你赢了半招。”",
    img: {
      shotSize: "全景",
      angle: "背面平视",
      character: `顾长宁: ${GC_DESC}；师姐: ${SJ_DESC}`,
      spatialRelation: "两人背对剪影，分居画面左右，中间隔断裂雪桥",
      microExpression: "背面，无面部",
      environment: "残破雪桥、漫天风雪、暮色天光",
      lighting: "暮色剪影，色温5000K",
      style: { artStyle: "电影质感", focalLength: "35mm镜头", aperture: "f/4" },
    },
    vid: {
      cameraMove: "Crane up 缓慢上升",
      subjectAction: "两人静立不动",
      envDynamics: "风雪漫卷",
      audio: "风声渐远+一声叹息+萧声起",
      duration: "5.0s",
    },
  },
];

// ---------------------------------------------------------------------------
// 组装 17 列分镜表行
// ---------------------------------------------------------------------------

export const SEED_ROWS: StoryboardRow[] = SHOTS.map((s) => {
  const imagePromptAST: ImagePromptAST = {
    composition: { shotSize: s.shotSize, angle: s.angle },
    character: s.img.character,
    spatialRelation: s.img.spatialRelation,
    microExpression: s.img.microExpression,
    environment: s.img.environment,
    lighting: s.img.lighting,
    style: s.img.style,
  };
  return {
    shotNo: s.shotNo,
    duration: s.duration,
    description: s.description,
    char1Name: s.chars[0]?.name ?? "",
    char1Desc: s.chars[0]?.desc ?? "",
    char1Image: "",
    char2Name: s.chars[1]?.name ?? "",
    char2Desc: s.chars[1]?.desc ?? "",
    char2Image: "",
    reference: s.reference,
    shotSize: s.shotSize,
    emotion: s.emotion,
    lighting: s.lighting,
    sfx: s.sfx,
    dialogue: s.dialogue,
    imagePrompt: compileImagePrompt(imagePromptAST),
    videoMotionPrompt: compileVideoMotion(s.vid),
  };
});

// ---------------------------------------------------------------------------
// 初始图谱：角色节点 + 分镜表节点 + 9 分镜图节点 + 9 视频节点
// ---------------------------------------------------------------------------

const TABLE_NODE_ID = "table-node";

export function buildSeedGraph(): { graph: CanvasGraph; rows: StoryboardRow[] } {
  const nodes: CanvasNode[] = [
    {
      id: "role-guchangning",
      type: "roleStudio",
      position: { x: -480, y: 80 },
      data: { kind: "roleStudio", characterId: "char-guchangning", views: {} },
      stale: false,
    },
    {
      id: "role-shijie",
      type: "roleStudio",
      position: { x: -480, y: 400 },
      data: { kind: "roleStudio", characterId: "char-shijie", views: {} },
      stale: false,
    },
    {
      id: TABLE_NODE_ID,
      type: "storyboardTable",
      position: { x: 40, y: 40 },
      data: { kind: "storyboardTable", rows: SEED_ROWS, approved: false },
      stale: false,
    },
  ];
  const edges: CanvasEdge[] = [];

  SHOTS.forEach((s, i) => {
    const shotId = `shot-${s.shotNo}`;
    const videoId = `video-${s.shotNo}`;
    const x = 780 + i * 360;
    const imagePromptAST: ImagePromptAST = {
      composition: { shotSize: s.shotSize, angle: s.angle },
      character: s.img.character,
      spatialRelation: s.img.spatialRelation,
      microExpression: s.img.microExpression,
      environment: s.img.environment,
      lighting: s.img.lighting,
      style: s.img.style,
    };
    nodes.push({
      id: shotId,
      type: "shotImage",
      position: { x, y: 60 },
      data: {
        kind: "shotImage",
        shotNo: s.shotNo,
        previewSize: { w: 2752, h: 1536 },
        imagePromptAST,
        rawPrompt: false,
        referenceSlots: {},
        rowRef: { tableNodeId: TABLE_NODE_ID, rowIndex: i },
      },
      stale: false,
    });
    nodes.push({
      id: videoId,
      type: "videoGen",
      position: { x, y: 460 },
      data: {
        kind: "videoGen",
        shotNo: s.shotNo,
        motionAST: s.vid,
        rawPrompt: false,
        engine: "dola",
        reshootRanges: [],
      },
      stale: false,
    });
    edges.push({ id: `e-table-${shotId}`, type: "dataflow", source: TABLE_NODE_ID, target: shotId });
    edges.push({ id: `e-${shotId}-${videoId}`, type: "dataflow", source: shotId, target: videoId });

    // AutoLink 引用边：角色造型室 → 出场分镜
    for (const c of s.chars) {
      const char = SEED_CHARACTERS.find((x) => x.name === c.name);
      if (char?.roleNodeId) {
        edges.push({
          id: `autolink:${char.roleNodeId}->${shotId}`,
          type: "autolink",
          source: char.roleNodeId,
          target: shotId,
          characterId: char.id,
        });
      }
    }
  });

  return { graph: { nodes, edges }, rows: SEED_ROWS };
}
