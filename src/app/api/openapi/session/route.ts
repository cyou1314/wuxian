/**
 * POST /openapi/session — 创建会话 / 追加消息
 *
 * body: { projectUuid?, sessionId?, message?, mode?: "auto"|"plan" }
 *  - 无 sessionId → 创建新会话（projectUuid 可选，不传则新建）
 *  - 有 message → 追加 user 消息，触发 TV Director 在绑定项目画布上
 *    创建/更新分镜表与节点，并追加 assistant 消息（含 toolCalls）
 * 返回：{ data: { projectUuid, sessionId, resolvedPrompt? } }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "../_auth";
import { loadServerData, saveServerData } from "@/lib/project-store";
import { runDirector } from "@/lib/tv-director-agent";
import type { OpenAPISession, SessionMessage } from "@/types/libtv-schema";

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    projectUuid?: string;
    sessionId?: string;
    message?: string;
    mode?: "auto" | "plan";
  };

  const data = await loadServerData();
  let session: OpenAPISession | undefined = body.sessionId
    ? data.sessions.find((s) => s.sessionId === body.sessionId)
    : undefined;
  if (body.sessionId && !session) {
    return NextResponse.json({ error: "会话不存在" }, { status: 404 });
  }
  const projectUuid = body.projectUuid ?? session?.projectUuid ?? newId("proj");
  if (!session) {
    session = { sessionId: newId("ses"), projectUuid, messages: [], nextSeq: 1 };
    data.sessions.push(session);
  } else if (body.projectUuid) {
    session.projectUuid = body.projectUuid;
  }

  let resolvedPrompt: string | undefined;
  if (body.message && body.message.trim()) {
    const userMsg: SessionMessage = {
      seq: session.nextSeq++,
      role: "user",
      content: body.message,
      createdAt: Date.now(),
    };
    session.messages.push(userMsg);

    const graph = data.projects[projectUuid] ?? { nodes: [], edges: [] };
    const characters = data.characters[projectUuid] ?? [];
    const result = runDirector({
      graph,
      text: body.message,
      characters,
      mode: body.mode ?? "auto",
    });
    data.projects[projectUuid] = result.graph;
    data.tasks.push(...result.tasks);

    const assistantMsg: SessionMessage = {
      seq: session.nextSeq++,
      role: "assistant",
      content: result.summary,
      toolCalls: result.toolCalls.length > 0 ? result.toolCalls : undefined,
      createdAt: Date.now(),
    };
    session.messages.push(assistantMsg);
    resolvedPrompt = result.resolvedPrompt;
  }

  await saveServerData(data);
  return NextResponse.json({
    data: { projectUuid: session.projectUuid, sessionId: session.sessionId, resolvedPrompt },
  });
}
