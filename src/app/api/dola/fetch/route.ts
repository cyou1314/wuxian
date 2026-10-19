/**
 * POST /api/dola/fetch — Dola 服务端 fetch 代签代理
 *
 * 为什么需要它：
 *  浏览器里无法直接调 Dola 写接口——Cookie 是 forbidden header（会被剥离）、
 *  跨域 CORS 预检也过不了。真正的请求必须由服务端（Node）发出：
 *  服务端 = 用户本机（家宽出口）+ 允许 Cookie header + 可做 a_bogus 签名。
 *
 * 请求体：{ cookie: string, url: string, init?: { method?: string, headers?: Record<string,string>, body?: string } }
 * 返回：{ ok: boolean, status: number, text: string }
 *
 * 安全：
 *  - 仅允许 https://www.dola.com/ 域名，防止被当成开放代理；
 *  - cookie 仅在内存中使用，不记日志、不落盘；
 *  - 本路由假设与前端同机部署（localhost），不要公网暴露。
 */
import { NextRequest, NextResponse } from "next/server";
import { DOLA_BASE } from "@/lib/dola-engine";
import { signDolaUrl, isSignerAvailable } from "@/lib/dola-signer";

export const runtime = "nodejs";

interface ProxyInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export async function POST(req: NextRequest) {
  let payload: { cookie?: unknown; url?: unknown; init?: ProxyInit };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }
  const { cookie, url, init } = payload;
  if (typeof cookie !== "string" || !cookie) {
    return NextResponse.json({ error: "缺少 cookie" }, { status: 400 });
  }
  if (typeof url !== "string" || !url.startsWith(DOLA_BASE + "/")) {
    return NextResponse.json({ error: "url 非法：仅允许 dola.com" }, { status: 400 });
  }

  // 写路径强制签名（无签名一律 710022002）
  let target = url;
  try {
    const u = new URL(url);
    if (u.pathname.startsWith("/chat/completion")) {
      if (!isSignerAvailable()) {
        return NextResponse.json({ error: "签名器不可用，无法提交" }, { status: 500 });
      }
      target = await signDolaUrl(url);
    }
  } catch {
    return NextResponse.json({ error: "url 解析失败" }, { status: 400 });
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Cookie: cookie,
    Origin: DOLA_BASE,
    Referer: `${DOLA_BASE}/chat/`,
    Accept: "application/json, text/event-stream",
    ...(init?.headers ?? {}),
  };
  // 防止调用方覆盖关键头
  headers["Cookie"] = cookie;
  headers["Origin"] = DOLA_BASE;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 110000);
  try {
    const res = await fetch(target, {
      method: init?.method ?? "POST",
      headers,
      body: init?.body,
      signal: ctrl.signal,
    });
    const text = await res.text();
    return NextResponse.json({ ok: res.ok, status: res.status, text });
  } catch (err) {
    return NextResponse.json(
      { ok: false, status: 0, text: `代理请求失败：${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}
