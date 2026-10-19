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
  const dir = process.env.WUXIAN_DATA_DIR
    ? path.join(process.env.WUXIAN_DATA_DIR, "uploads")
    : path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(dir, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(dir, fname), buf);
  return NextResponse.json({ data: { url: process.env.WUXIAN_DATA_DIR
    ? `/api/openapi/file/upload?name=${encodeURIComponent(fname)}`
    : `/uploads/${fname}` } });
}


/** Desktop uploads live in userData, outside the read-only installed resources. */
export async function GET(req: NextRequest) {
  const base = process.env.WUXIAN_DATA_DIR;
  const name = req.nextUrl.searchParams.get("name");
  if (!base || !name || name.length > 120 || !/^[a-zA-Z0-9._-]+$/.test(name) || name.includes("..")) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }
  try {
    const bytes = await fs.readFile(path.join(base, "uploads", name));
    const types: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg", ".wav": "audio/wav" };
    const mime = types[path.extname(name).toLowerCase()] ?? "application/octet-stream";
    return new NextResponse(new Uint8Array(bytes), { headers: {
      "Content-Type": mime, "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Content-Disposition": `${mime === "application/octet-stream" ? "attachment" : "inline"}; filename="${name}"`,
    } });
  } catch {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }
}
