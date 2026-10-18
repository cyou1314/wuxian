/**
 * GET /openapi/session/:sessionId?afterSeq=N — 增量拉取会话消息
 *
 * 返回 seq > N 的消息；assistant 消息内含 toolCalls（create_generation_task 参数）
 * 与生成结果 URL。官方 libtv-skills 脚本无需修改即可对接。
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "../../_auth";
import { loadServerData } from "@/lib/project-store";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ sessionId: string }> },
) {
  const auth = requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { sessionId } = await ctx.params;
  const afterSeq = parseInt(new URL(req.url).searchParams.get("afterSeq") ?? "0", 10) || 0;
  const data = await loadServerData();
  const session = data.sessions.find((s) => s.sessionId === sessionId);
  if (!session) return NextResponse.json({ error: "会话不存在" }, { status: 404 });

  const messages = session.messages.filter((m) => m.seq > afterSeq);
  return NextResponse.json({
    data: { sessionId, messages, latestSeq: session.nextSeq - 1 },
  });
}
