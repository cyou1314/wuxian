import type { CanvasSnapshot } from '@/store/useCanvasStore';
import type { DolaTask } from './libtv-schema';

export interface DesktopProject {
  format: 'wuxian-project';
  version: 1;
  canvas: CanvasSnapshot;
  tasks: DolaTask[];
}
export interface DesktopAccount { id: string; label: string }
export interface DesktopBridge {
  platform: string;
  openGeneration(input: import("@/lib/studio-types").WebGenerationInput): Promise<{id:string;accountId:string}>;
  generationStatus(id:string): Promise<import("@/lib/studio-types").WebGenerationStatus>;
  upload(file: { name: string; type: string; bytes: ArrayBuffer }): Promise<{ url: string }>;
  downloadMedia(url: string): Promise<void>;
  mediaCapabilities(): Promise<{ ffmpeg: boolean }>;
  processMedia(request: import('@/lib/studio-types').MediaRequest): Promise<Array<{url: string; name: string; kind: 'image'|'video'|'audio'}>>;

  ready(): Promise<void>;
  loadRecovery(): Promise<DesktopProject | null>;
  autosave(project: DesktopProject): Promise<void>;
  openProject(): Promise<DesktopProject | null>;
  saveProject(project: DesktopProject, saveAs: boolean): Promise<string | null>;
  close(project: DesktopProject): Promise<void>;
  accounts(): Promise<DesktopAccount[]>;
  login(id?: string, label?: string): Promise<DesktopAccount[]>;
  removeAccount(id: string): Promise<DesktopAccount[]>;
  request(id: string, path: string, body: string): Promise<{ status: number; text: string }>;
  onCommand(callback: (command: string) => void): () => void;
}
declare global {
  interface Window { wuxianDesktop?: DesktopBridge }
}
