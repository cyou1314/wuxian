/**
 * dola-pool.ts — DolaAccountPool 浏览器端单例
 *
 * 顶栏"添加 Dola 账号并解锁"时调用 getDolaPool(passphrase)（PBKDF2 派生 AES-GCM 密钥）；
 * 节点组件只读 getDolaPoolSync()，为 null 即尚未解锁。
 */
import {
  DolaAccountPool,
  DolaClient,
  createAesGcmVault,
  type CookieVault,
} from "@/lib/dola-engine";

let pool: DolaAccountPool | null = null;
let vault: CookieVault | null = null;

export async function getDolaPool(passphrase: string): Promise<DolaAccountPool> {
  if (!vault) {
    const enc = new TextEncoder();
    const keyMat = await crypto.subtle.importKey(
      "raw",
      enc.encode(passphrase),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: enc.encode("wuxian-dola-v1"),
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMat,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    vault = createAesGcmVault(key);
  }
  if (!pool) pool = new DolaAccountPool({ vault });
  return pool;
}

export function getDolaPoolSync(): DolaAccountPool | null {
  return pool;
}

/** 登出/锁定：丢弃内存中的池与密钥 */
export function lockDolaPool(): void {
  pool = null;
  vault = null;
}

/** Desktop credentials stay in isolated Chromium sessions, never in the canvas. */
export async function getDesktopDolaPool(): Promise<DolaAccountPool> {
  const bridge = window.wuxianDesktop;
  if (!bridge) throw new Error("请在桌面应用中使用账号登录");
  if (!pool) {
    pool = new DolaAccountPool({
      vault: { encrypt: async () => { throw new Error("桌面版请使用网页登录"); }, decrypt: async () => "" },
      clientForAccount: (id) => new DolaClient("", {
        fetchImpl: async (input, init) => {
          if (init?.signal?.aborted) throw new Error("请求已取消");
          const result = await bridge.request(id, new URL(String(input)).pathname, String(init?.body ?? "{}"));
          return new Response(result.text, { status: result.status });
        },
      }),
    });
  }
  pool.syncDesktopAccounts(await bridge.accounts());
  return pool;
}
