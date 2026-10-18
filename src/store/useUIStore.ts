/**
 * useUIStore.ts — 纯 UI 状态（弹窗/抽屉），不进历史栈、不持久化
 */
import { create } from "zustand";

interface UIStore {
  gridSplitterNodeId: string | null;
  breakdownNodeId: string | null;
  inspectorNodeId: string | null;
  openGridSplitter: (nodeId: string) => void;
  closeGridSplitter: () => void;
  openBreakdown: (nodeId: string) => void;
  closeBreakdown: () => void;
  openInspector: (nodeId: string) => void;
  closeInspector: () => void;
}

export const useUIStore = create<UIStore>()((set) => ({
  gridSplitterNodeId: null,
  breakdownNodeId: null,
  inspectorNodeId: null,
  openGridSplitter: (nodeId) => set({ gridSplitterNodeId: nodeId }),
  closeGridSplitter: () => set({ gridSplitterNodeId: null }),
  openBreakdown: (nodeId) => set({ breakdownNodeId: nodeId }),
  closeBreakdown: () => set({ breakdownNodeId: null }),
  openInspector: (nodeId) => set({ inspectorNodeId: nodeId }),
  closeInspector: () => set({ inspectorNodeId: null }),
}));
