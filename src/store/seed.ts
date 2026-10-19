/** New workspaces start empty. Existing saved projects still restore normally. */
import type { CanvasGraph, CharacterAsset, StoryboardRow } from "@/types/libtv-schema";

export const SEED_CHARACTERS: CharacterAsset[] = [];
export const SEED_ROWS: StoryboardRow[] = [];

export function buildSeedGraph(): { graph: CanvasGraph; rows: StoryboardRow[] } {
  return { graph: { nodes: [], edges: [] }, rows: [] };
}
