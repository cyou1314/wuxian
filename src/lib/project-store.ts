/**
 * project-store.ts — OpenAPI 服务端持久化
 *
 * 会话 / 项目画布 / 生成任务落盘到 .data/wuxian-server.json（gitignored）。
 * SQLite 可在数据量上来后替换本文件实现，接口保持不变。
 */
import { promises as fs } from "fs";
import path from "path";
import type {
  CanvasGraph,
  CharacterAsset,
  DolaTask,
  OpenAPISession,
} from "@/types/libtv-schema";

export interface ServerData {
  sessions: OpenAPISession[];
  projects: Record<string, CanvasGraph>;
  tasks: DolaTask[];
  characters: Record<string, CharacterAsset[]>;
}

const FILE = path.join(process.cwd(), ".data", "wuxian-server.json");

const EMPTY: ServerData = { sessions: [], projects: {}, tasks: [], characters: {} };

export async function loadServerData(): Promise<ServerData> {
  try {
    const raw = await fs.readFile(FILE, "utf-8");
    const d = JSON.parse(raw) as Partial<ServerData>;
    return {
      sessions: Array.isArray(d.sessions) ? d.sessions : [],
      projects: d.projects ?? {},
      tasks: Array.isArray(d.tasks) ? d.tasks : [],
      characters: d.characters ?? {},
    };
  } catch {
    return { ...EMPTY };
  }
}

export async function saveServerData(d: ServerData): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(d), "utf-8");
}
