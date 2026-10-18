/**
 * POST /openapi/session/change-project — 会话换绑项目
 *
 * body: { sessionId, projectUuid }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "../../_auth";
import { loadServerData, saveServerData } from "@/lib/project-store";

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    sessionId?: string;
    projectUuid?: string;
  };
  if (!body.sessionId || !body.projectUuid) {
    return NextResponse.json({ error: "缺少 sessionId 或 projectUuid" }, { status: 400 });
  }
  const data = await loadServerData();
  const session = data.sessions.find((s) => s.sessionId === body.sessionId);
  if (!session) return NextResponse.json({ error: "会话不存在" }, { status: 404 });

  session.projectUuid = body.projectUuid;
  await saveServerData(data);
  return NextResponse.json({
    data: { sessionId: session.sessionId, projectUuid: session.projectUuid },
  });
}
