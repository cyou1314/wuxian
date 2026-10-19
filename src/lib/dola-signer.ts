/**
 * dola-signer.ts — Dola 写接口 a_bogus 签名器（服务端专用）
 *
 * 原理（2026-10-16 逆向结论）：
 *   /chat/completion 等写接口强制校验字节系 a_bogus/msToken 签名，
 *   无签名请求一律被 710022002（伪装成 high demand）拦截；
 *   只读接口（/samantha/skill/pack）无签名要求。
 *   本模块用 webmssdk_1.0.0.44（字节反爬 SDK）在 Node vm 沙箱里
 *   直接调用 frontierSign 生成签名，无需反混淆复刻算法。
 *
 * 硬约束：
 *   - 仅服务端（Node）可用：依赖 node:vm / node:fs，浏览器导入会抛错。
 *   - 签名只解决「签名关」；VM 机房出口另有 IP 风控，签名请求同样被拦。
 *     实际提交必须跑在家宽出口（用户本地 next dev / Electron webview）。
 *   - vendor/webmssdk_1.0.0.44.part{0..3}.js 为字节专有 SDK（切块存放），
 *     仅随私有仓库分发。
 */
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";

if (typeof window !== "undefined") {
  throw new Error("dola-signer 仅限服务端（Node）使用，浏览器请走 /api/dola/execute");
}

const SDK_BASENAME = "webmssdk_1.0.0.44";
const SDK_PARTS = 4;
// 注：SDK 被切成 4 个 ~80KB 分块存放（push_files 单参数 128KB 上限），
// 运行时按顺序拼接，与原文件逐字节一致。

/**
 * 定位 SDK 分块。Next.js 打包后 __dirname 不再指向源码目录，
 * 因此按顺序尝试：模块旁 vendor/ → 项目根 src/lib/vendor/。
 */
function findSdkParts(): string[] {
  const dirs = [path.join(__dirname, "vendor"), path.join(process.cwd(), "src", "lib", "vendor")];
  for (const dir of dirs) {
    const parts = Array.from(
      { length: SDK_PARTS },
      (_, i) => path.join(dir, `${SDK_BASENAME}.part${i}.js`),
    );
    if (parts.every((p) => fs.existsSync(p))) return parts;
  }
  throw new Error(`签名 SDK 分块缺失（${SDK_BASENAME}.part0..3.js），尝试过：${dirs.join(" / ")}`);
}

interface Acrawler {
  frontierSign(url: string): Record<string, string>;
}

let _ac: Acrawler | null = null;

function getAcrawler(): Acrawler {
  if (_ac) return _ac;

  // 与 dola-research/abogus/signer.js 同构的 mock 环境
  const mockWindow: Record<string, unknown> = {
    addEventListener: () => {},
    removeEventListener: () => {},
    devicePixelRatio: 2,
    innerWidth: 1440,
    innerHeight: 900,
  };
  const sandbox: Record<string, unknown> = {
    window: mockWindow,
    document: {
      createElement: () => ({
        getContext: () => null,
        toDataURL: () => "",
        width: 300,
        height: 150,
        style: {},
      }),
      documentElement: { style: {} },
      referrer: "",
      cookie: "",
      addEventListener: () => {},
    },
    navigator: {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      platform: "MacIntel",
      language: "zh-CN",
      languages: ["zh-CN", "zh", "en"],
      hardwareConcurrency: 8,
      maxTouchPoints: 0,
      webdriver: false,
    },
    location: {
      href: "https://www.dola.com/chat/",
      protocol: "https:",
      host: "www.dola.com",
      hostname: "www.dola.com",
      pathname: "/chat/",
      origin: "https://www.dola.com",
    },
    screen: {
      width: 1440,
      height: 900,
      availWidth: 1440,
      availHeight: 900,
      colorDepth: 24,
      pixelDepth: 24,
    },
    self: mockWindow,
    setTimeout: () => 0,
    clearTimeout: () => {},
    queueMicrotask: () => {},
    TextEncoder,
    TextDecoder,
    URL,
    URLSearchParams,
    JSON,
    Math,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Date,
    RegExp,
    Error,
    TypeError,
    RangeError,
    Promise,
    Map,
    Set,
    WeakMap,
    Symbol,
    ArrayBuffer,
    Uint8Array,
    Uint32Array,
    Int8Array,
    DataView,
    console,
  };
  sandbox.globalThis = sandbox;
  mockWindow.window = mockWindow;

  const sdkCode = findSdkParts()
    .map((p) => fs.readFileSync(p, "utf8"))
    .join("");
  vm.createContext(sandbox);
  vm.runInContext(sdkCode, sandbox, { filename: "webmssdk.js" });

  const ac = (sandbox as Record<string, unknown>).byted_acrawler as Acrawler | undefined;
  if (!ac || typeof ac.frontierSign !== "function") {
    throw new Error("byted_acrawler/frontierSign 初始化失败");
  }
  _ac = ac;
  return ac;
}

/** 签名器是否可用（SDK 文件存在且能初始化） */
export function isSignerAvailable(): boolean {
  try {
    getAcrawler();
    return true;
  } catch {
    return false;
  }
}

/**
 * 为 Dola 写接口 URL 生成 a_bogus 并拼接到查询参数。
 * @param url 不带签名的完整 URL
 * @returns 带 a_bogus 参数的 URL
 */
export async function signDolaUrl(url: string): Promise<string> {
  const ac = getAcrawler();
  const res = ac.frontierSign(url);
  const sig = res["X-Bogus"] || res["a_bogus"];
  if (!sig) throw new Error("签名返回为空：" + JSON.stringify(res));
  const sep = url.includes("?") ? "&" : "?";
  return url + sep + "a_bogus=" + encodeURIComponent(sig);
}
