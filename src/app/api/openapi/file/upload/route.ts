/**
 * POST /openapi/file/upload — 文件上传（参考图/素材）
 *
 * multipart/form-data，字段名 file；落盘到 public/uploads/，返回可访问 URL。
 */
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { requireAuth } from "../../_auth";

const MAX_BYTES = 50 * 1024 * 1024;

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "file";
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少 file 字段" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "文件超过 50MB 限制" }, { status: 400 });
  }
  const fname = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}-${sanitize(file.name)}`;
  const dir = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(dir, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(dir, fname), buf);
  return NextResponse.json({ data: { url: `/uploads/${fname}` } });
}
