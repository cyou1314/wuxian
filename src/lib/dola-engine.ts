/**
 * dola-engine.ts — Dola 生成引擎
 *
 * 将 REA 逆向定稿的 Dola 服务端链路（docs/dola-api-chain.md）封装为可调用客户端：
 *   skill/pack → /chat/completion (SSE) → 轮询 /im/chain/single → /samantha/video/get_play_info
 *
 * 硬约束（已验证，不可绕过）：
 *  - 写入接口（/chat/completion）强制 a_bogus 签名：DolaClient 支持注入 signer
 *   （见 ./dola-signer，webmssdk frontierSign），无签名一律 710022002；
 *  - 机房出口另有 IP 风控：即使签名正确也会被 710022002 拦截，
 *    实际提交必须跑在家宽出口（用户本地 next dev / Electron webview）；
 *    本客户端必须运行在「已登录真实页面上下文」或「家宽出口」。
 *  - 只读接口（/samantha/skill/pack）无签名要求，任意出口可调。
 *  - 认证：session cookie；额度无独立 API，从提交 SSE 的配额文本解析。
 */

import type {
  DolaAccount,
  DolaImageTask,
  DolaModel,
  DolaQuotaInfo,
  DolaRatio,
  DolaVideoTask,
} from "@/types/libtv-schema";

export const DOLA_BASE = "https://www.dola.com";
export const DOLA_BOT_ID = "7339470689562525703";

/** skill_type / ability_type：17=视频生成，3=图片生成（TS 枚举三处印证） */
export const DOLA_SKILL = { VIDEO: 17, IMAGE: 3 } as const;

/** Dola 下发模型（pack 可能滞后，实发以此处为准） */
export const DOLA_MODELS: DolaModel[] = ["seedance_v2.5", "seedance_v2.0", "seedance_v1.0"];

/** 模型额度倍率（实测：2.5 旗舰 5 倍消耗；此处为相对系数，供调度估算） */
export const DOLA_MODEL_COST_FACTOR: Record<DolaModel, number> = {
  "seedance_v2.5": 5,
  "seedance_v2.0": 1,
  "seedance_v1.0": 1,
};

export interface DolaRequestOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /**
   * 写接口签名函数。提供后，post() 会在调用写路径（/chat/completion）
   * 前对 URL 做 a_bogus 签名；只读路径不受影响。
   * 浏览器端请使用服务端代签（/api/dola/execute），不要直接传入。
   */
  signer?: (url: string) => Promise<string> | string;
}

interface JsonObj {
  [k: string]: unknown;
}

function isObj(v: unknown): v is JsonObj {
  return typeof v === "object" && v !== null;
}

function newUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ---------------------------------------------------------------------------
// Cookie 保险库（AES-GCM）：cookieCipher 的加解密抽象
// ---------------------------------------------------------------------------

export interface CookieVault {
  encrypt(plain: string): Promise<string>;
  decrypt(cipher: string): Promise<string>;
}

/** 基于 WebCrypto AES-GCM 的保险库实现；key 由应用层保管（如用户口令派生） */
export function createAesGcmVault(key: CryptoKey): CookieVault {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  return {
    async encrypt(plain: string): Promise<string> {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const buf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain));
      const bytes = new Uint8Array(iv.length + buf.byteLength);
      bytes.set(iv, 0);
      bytes.set(new Uint8Array(buf), iv.length);
      return btoa(String.fromCharCode(...bytes));
    },
    async decrypt(cipher: string): Promise<string> {
      const bytes = Uint8Array.from(atob(cipher), (c) => c.charCodeAt(0));
      const iv = bytes.slice(0, 12);
      const data = bytes.slice(12);
      const buf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
      return dec.decode(buf);
    },
  };
}

// ---------------------------------------------------------------------------
// DolaClient：单账号调用客户端
// ---------------------------------------------------------------------------

export class DolaClient {
  private cookie: string;
  private fetchImpl: typeof fetch;
  private timeoutMs: number;
  private signer?: (url: string) => Promise<string> | string;

  constructor(cookie: string, opts?: DolaRequestOptions) {
    this.cookie = cookie;
    this.fetchImpl = opts?.fetchImpl ?? fetch;
    this.timeoutMs = opts?.timeoutMs ?? 60000;
    this.signer = opts?.signer;
  }

  /** 需要签名的写路径（2026-10-16 逆向结论：无签名一律 710022002） */
  private needsSign(path: string): boolean {
    return path.startsWith("/chat/completion");
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      let url = `${DOLA_BASE}${path}`;
      if (this.signer && this.needsSign(path)) {
        url = await this.signer(url);
      }
      const res = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: this.cookie,
          Origin: DOLA_BASE,
          Referer: `${DOLA_BASE}/chat/`,
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify(body),
        credentials: "include",
        signal: ctrl.signal,
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`Dola ${path} HTTP ${res.status}: ${text.slice(0, 200)}`);
      return text as unknown as T;
    } finally {
      clearTimeout(timer);
    }
  }

  /** 取 skill 配置（只读，无签名要求）。video → skill_type 17，image → 3 */
  async skillPack(skillType: number): Promise<JsonObj> {
    const raw = await this.post<string>("/samantha/skill/pack", { skill_type: skillType });
    const data = JSON.parse(raw) as JsonObj;
    if (data["code"] !== 0) throw new Error(`skill/pack code=${String(data["code"])}`);
    return data;
  }

  /**
   * 提交视频生成。duration 直传 5~30（30 秒无需改写 pack 响应）。
   * 返回 conversationId 与 SSE 配额文本解析结果。
   */
  async submitVideo(params: {
    prompt: string;
    model: DolaModel;
    duration: number;
    ratio: DolaRatio;
  }): Promise<{ conversationId: string; quota: DolaQuotaInfo | null; sseText: string }> {
    if (params.duration < 1 || params.duration > 30) {
      throw new Error(`duration 必须在 1~30 秒之间，收到 ${params.duration}`);
    }
    const abilityParam = JSON.stringify({
      model: params.model,
      duration: params.duration,
      ratio: params.ratio,
      input_box_content: {
        user_input_content: params.prompt,
        reply_message_format: "生成视频：%s",
      },
    });
    const sseText = await this.post<string>("/chat/completion", {
      client_meta: {
        local_conversation_id: newUuid(),
        conversation_id: "",
        bot_id: DOLA_BOT_ID,
        last_section_id: "",
      },
      messages: [
        {
          content_block: [
            {
              block_type: 10000,
              content: { text_block: { text: `生成视频：${params.prompt}` } },
            },
          ],
        },
      ],
      option: {
        need_create_conversation: true,
        unique_key: newUuid(),
        create_time_ms: Date.now(),
      },
      chat_ability: { ability_type: DOLA_SKILL.VIDEO, ability_param: abilityParam },
    });

    // 710022002 = 签名/出口拦截（伪装成 high demand），直接抛错不重试
    if (sseText.includes("710022002")) {
      throw new Error(
        "Dola 拒绝提交（710022002）：当前出口未通过签名校验，请在已登录真实页面上下文或家宽出口重试",
      );
    }
    const conversationId = extractConversationId(sseText);
    if (!conversationId) throw new Error("提交响应中未找到 conversation_id");
    return { conversationId, quota: parseQuotaText(sseText), sseText };
  }

  /**
   * 提交图片生成。ability_type=3；内层 param schema 为高置信类比结构，
   * 待一次带响应正文的抓包最终确认（见 docs/dola-api-chain.md）。
   */
  async submitImage(params: {
    prompt: string;
    ratio: DolaRatio;
    style?: string;
  }): Promise<{ conversationId: string; quota: DolaQuotaInfo | null; sseText: string }> {
    const abilityParam = JSON.stringify({
      ratio: params.ratio,
      style: params.style ?? "skill_image_styles_general",
      input_box_content: {
        user_input_content: params.prompt,
        reply_message_format: "生成图片：%s",
      },
    });
    const sseText = await this.post<string>("/chat/completion", {
      client_meta: {
        local_conversation_id: newUuid(),
        conversation_id: "",
        bot_id: DOLA_BOT_ID,
        last_section_id: "",
      },
      messages: [
        {
          content_block: [
            {
              block_type: 10000,
              content: { text_block: { text: `生成图片：${params.prompt}` } },
            },
          ],
        },
      ],
      option: {
        need_create_conversation: true,
        unique_key: newUuid(),
        create_time_ms: Date.now(),
      },
      chat_ability: { ability_type: DOLA_SKILL.IMAGE, ability_param: abilityParam },
    });
    if (sseText.includes("710022002")) {
      throw new Error(
        "Dola 拒绝提交（710022002）：当前出口未通过签名校验，请在已登录真实页面上下文或家宽出口重试",
      );
    }
    const conversationId = extractConversationId(sseText);
    if (!conversationId) throw new Error("提交响应中未找到 conversation_id");
    return { conversationId, quota: parseQuotaText(sseText), sseText };
  }

  /** 轮询 /im/chain/single 直到拿到 creation_block.video.vid */
  async pollForVid(
    conversationId: string,
    opts?: { maxAttempts?: number; intervalMs?: number },
  ): Promise<string> {
    const maxAttempts = opts?.maxAttempts ?? 60;
    const intervalMs = opts?.intervalMs ?? 10000;
    for (let i = 0; i < maxAttempts; i++) {
      const raw = await this.post<string>("/im/chain/single", {
        cmd: 3100,
        uplink_body: {
          pull_singe_chain_uplink_body: {
            conversation_id: conversationId,
            anchor_index: 5,
            conversation_type: 3,
            direction: 1,
            limit: 20,
            ext: {},
            filter: { index_list: [] },
          },
        },
        sequence_id: newUuid(),
        channel: 2,
        version: "1",
      });
      const vid = extractVid(raw);
      if (vid) return vid;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error(`轮询超时：${maxAttempts} 次未拿到 vid（conversation ${conversationId}）`);
  }

  /** 取无水印原文件直链 */
  async getPlayInfo(vid: string): Promise<string> {
    const raw = await this.post<string>("/samantha/video/get_play_info", { vid });
    const data = JSON.parse(raw) as JsonObj;
    const d = data["data"];
    if (!isObj(d)) throw new Error("get_play_info 返回异常");
    const infos = d["play_infos"];
    if (!Array.isArray(infos) || infos.length === 0) throw new Error("get_play_info 无 play_infos");
    const first = infos[0];
    if (!isObj(first) || typeof first["main"] !== "string") {
      throw new Error("get_play_info 未找到 main 直链");
    }
    return first["main"] as string;
  }

  /** 一条龙：提交 → 轮询 → 取链 */
  async generateVideo(params: {
    prompt: string;
    model: DolaModel;
    duration: number;
    ratio: DolaRatio;
  }): Promise<Pick<DolaVideoTask, "conversationId" | "vid" | "playUrl" | "quotaCost">> {
    const { conversationId, quota } = await this.submitVideo(params);
    const vid = await this.pollForVid(conversationId);
    const playUrl = await this.getPlayInfo(vid);
    return { conversationId, vid, playUrl, quotaCost: quota?.cost };
  }
}

// ---------------------------------------------------------------------------
// SSE / 配额解析
// ---------------------------------------------------------------------------

/** 从 SSE 文本提取 conversation_id（SSE_ACK 回填） */
export function extractConversationId(sseText: string): string | null {
  // 优先找显式 conversation_id 字段
  const m = /"conversation_id"\s*:\s*"(\d+)"/.exec(sseText);
  if (m) return m[1];
  return null;
}

/**
 * 从提交 SSE 文本解析配额：
 * 「本次使用…将消耗 4 个视频生成额度…今日剩余 0 个视频生成额度」
 * 兼容抓包乱码：数字提取不依赖完整中文匹配。
 */
export function parseQuotaText(sseText: string): DolaQuotaInfo | null {
  const costM = /将消耗\s*(\d+)\s*个/.exec(sseText) ?? /消耗\s*(\d+)\s*个.{0,8}额度/.exec(sseText);
  if (!costM) return null;
  const remainingM = /剩余\s*(\d+)\s*个/.exec(sseText);
  return {
    cost: parseInt(costM[1], 10),
    remaining: remainingM ? parseInt(remainingM[1], 10) : null,
    rawText: sseText.slice(0, 500),
  };
}

/** 从 /im/chain/single 响应提取 creation_block.creations[0].video.vid */
export function extractVid(chainSingleText: string): string | null {
  try {
    const data = JSON.parse(chainSingleText) as JsonObj;
    const messages = findMessages(data);
    for (const msg of messages) {
      const creations = digCreationBlocks(msg);
      for (const c of creations) {
        const video = (c as JsonObj)["video"];
        if (isObj(video) && typeof video["vid"] === "string") {
          return video["vid"] as string;
        }
      }
    }
  } catch {
    // 非 JSON 响应则忽略，继续轮询
  }
  return null;
}

function findMessages(data: JsonObj): JsonObj[] {
  const out: JsonObj[] = [];
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) {
      for (const item of v) visit(item);
      return;
    }
    if (!isObj(v)) return;
    if (Array.isArray(v["messages"])) {
      for (const m of v["messages"] as unknown[]) if (isObj(m)) out.push(m);
    }
    for (const key of Object.keys(v)) {
      if (key !== "messages") visit(v[key]);
    }
  };
  visit(data);
  return out;
}

function digCreationBlocks(msg: JsonObj): unknown[] {
  const out: unknown[] = [];
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) {
      for (const item of v) visit(item);
      return;
    }
    if (!isObj(v)) return;
    if (v["creation_block"] !== undefined) {
      const cb = v["creation_block"];
      if (isObj(cb) && Array.isArray(cb["creations"])) {
        out.push(...(cb["creations"] as unknown[]));
      }
    }
    for (const key of Object.keys(v)) visit(v[key]);
  };
  visit(msg);
  return out;
}

// ---------------------------------------------------------------------------
// DolaAccountPool：多账号额度池（wuxian 差异化核心）
// ---------------------------------------------------------------------------

export interface AccountPoolOptions {
  vault: CookieVault;
  fetchImpl?: typeof fetch;
}

export class DolaAccountPool {
  private accounts: DolaAccount[] = [];
  private vault: CookieVault;
  private fetchImpl?: typeof fetch;

  constructor(opts: AccountPoolOptions) {
    this.vault = opts.vault;
    this.fetchImpl = opts.fetchImpl;
  }

  /** 新增账号：明文 cookie 只在内存停留，入库即加密 */
  async addAccount(label: string, cookiePlain: string): Promise<DolaAccount> {
    const account: DolaAccount = {
      id: newUuid(),
      label,
      cookieCipher: await this.vault.encrypt(cookiePlain),
      quotaRemaining: null,
      quotaDailyUsed: 0,
      status: "active",
      updatedAt: Date.now(),
    };
    this.accounts.push(account);
    return account;
  }

  removeAccount(id: string): void {
    this.accounts = this.accounts.filter((a) => a.id !== id);
  }

  listAccounts(): DolaAccount[] {
    return [...this.accounts];
  }

  /**
   * 额度优先选号：active 账号中，
   * 已知剩余额度>0 的按剩余降序 > 未知额度（视为可用）> 剩余额度为 0 的跳过。
   */
  pickAccount(): DolaAccount | null {
    const active = this.accounts.filter((a) => a.status === "active");
    const known = active
      .filter((a) => a.quotaRemaining !== null && (a.quotaRemaining as number) > 0)
      .sort((a, b) => (b.quotaRemaining as number) - (a.quotaRemaining as number));
    if (known.length > 0) return known[0];
    const unknown = active.filter((a) => a.quotaRemaining === null);
    return unknown[0] ?? null;
  }

  /** 记录一次消耗：更新剩余额度/日消耗；归零则标记 exhausted */
  recordUsage(accountId: string, quota: DolaQuotaInfo): void {
    const acc = this.accounts.find((a) => a.id === accountId);
    if (!acc) return;
    acc.quotaDailyUsed += quota.cost;
    if (quota.remaining !== null) {
      acc.quotaRemaining = quota.remaining;
      if (quota.remaining <= 0) acc.status = "exhausted";
    }
    acc.updatedAt = Date.now();
  }

  markInvalid(accountId: string): void {
    const acc = this.accounts.find((a) => a.id === accountId);
    if (acc) {
      acc.status = "invalid";
      acc.updatedAt = Date.now();
    }
  }

  /** 为选中的账号创建带其 cookie 的客户端 */
  async clientFor(accountId: string): Promise<DolaClient> {
    const acc = this.accounts.find((a) => a.id === accountId);
    if (!acc) throw new Error(`账号不存在：${accountId}`);
    const cookie = await this.vault.decrypt(acc.cookieCipher);
    return new DolaClient(cookie, { fetchImpl: this.fetchImpl });
  }

  /**
   * 取账号明文 cookie（仅内存）。用于经 /api/dola/fetch 服务端代理的场景：
   * 浏览器无法直发 Dola 请求（CORS + forbidden Cookie header），
   * 由本机服务端代发（家宽出口 + a_bogus 签名）。
   */
  async cookieFor(accountId: string): Promise<string> {
    const acc = this.accounts.find((a) => a.id === accountId);
    if (!acc) throw new Error(`账号不存在：${accountId}`);
    return this.vault.decrypt(acc.cookieCipher);
  }

  /** 每日零点调用：重置日消耗与 exhausted 状态 */
  resetDaily(): void {
    for (const a of this.accounts) {
      a.quotaDailyUsed = 0;
      if (a.status === "exhausted") a.status = "active";
      a.quotaRemaining = null;
    }
  }
}

/** 任务工厂：为视频任务分配账号并初始化 */
export function createVideoTask(
  pool: DolaAccountPool,
  params: { prompt: string; model: DolaModel; duration: number; ratio: DolaRatio; nodeId?: string },
): DolaVideoTask | null {
  const account = pool.pickAccount();
  if (!account) return null; // 无可用账号（全部耗尽/失效）
  return {
    id: newUuid(),
    kind: "video",
    prompt: params.prompt,
    model: params.model,
    duration: params.duration,
    ratio: params.ratio,
    accountId: account.id,
    status: "queued",
    nodeId: params.nodeId,
    createdAt: Date.now(),
  };
}

/** 任务工厂：图片任务 */
export function createImageTask(
  pool: DolaAccountPool,
  params: { prompt: string; ratio: DolaRatio; nodeId?: string },
): DolaImageTask | null {
  const account = pool.pickAccount();
  if (!account) return null;
  return {
    id: newUuid(),
    kind: "image",
    prompt: params.prompt,
    ratio: params.ratio,
    accountId: account.id,
    status: "queued",
    nodeId: params.nodeId,
    createdAt: Date.now(),
  };
}
