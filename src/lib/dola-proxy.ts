/**
 * dola-proxy.ts — 浏览器端 Dola fetch 代理（client-only）
 *
 * 用法：
 *   const client = new DolaClient(cookie, { fetchImpl: createProxyFetch(cookie) });
 *
 * 它把 DolaClient 的每一次 fetch 转成对同源 /api/dola/fetch 的 POST，
 * 真正的出站请求由服务端（用户本机，家宽出口）发出并附带 a_bogus 签名。
 * 注意：经此代理时不要再给 DolaClient 传 signer，避免重复签名。
 */
export function createProxyFetch(cookie: string): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const headers: Record<string, string> = {};
    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((v, k) => {
          headers[k] = v;
        });
      } else if (Array.isArray(init.headers)) {
        for (const [k, v] of init.headers) headers[k] = v;
      } else {
        Object.assign(headers, init.headers);
      }
    }
    let body: string | undefined;
    if (typeof init?.body === "string") body = init.body;

    const res = await fetch("/api/dola/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cookie, url, init: { method: init?.method ?? "GET", headers, body } }),
    });
    const data = (await res.json()) as { ok: boolean; status: number; text: string; error?: string };
    if (!res.ok) {
      throw new Error(`代理网关错误：${data.error ?? res.status}`);
    }
    return new Response(data.text ?? "", { status: data.status || 200 });
  }) as typeof fetch;
}
