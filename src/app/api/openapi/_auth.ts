/** OpenAPI 鉴权：Authorization: Bearer <LIBTV_ACCESS_KEY> */
import type { NextRequest } from "next/server";

export function requireAuth(
  req: NextRequest,
): { ok: true } | { ok: false; error: string } {
  const key = process.env.LIBTV_ACCESS_KEY;
  if (!key) return { ok: false, error: "服务端未配置 LIBTV_ACCESS_KEY" };
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/.exec(header.trim());
  if (!m || m[1] !== key) return { ok: false, error: "鉴权失败：无效的 access key" };
  return { ok: true };
}
