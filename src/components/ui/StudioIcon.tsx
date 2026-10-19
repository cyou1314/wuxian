import type { CSSProperties } from "react";
const paths: Record<string, string> = {
  roleStudio: 'M20 21v-2a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v2 M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  scriptEditor: 'M5 3h14v18H5z M8 7h8 M8 11h8 M8 15h5',
  storyboardTable: 'M3 4h18v16H3z M3 9h18 M9 4v16 M15 4v16',
  shotImage: 'M3 3h18v18H3z M3 17l6-6 4 4 3-3 5 5 M8 7h.01',
  videoGen: 'M9 6l10 6-10 6z',
  layerSplit: 'M12 3l10 6-10 6L2 9z M2 13l10 6 10-6 M2 17l10 6 10-6',
  threeDBox: 'M12 2l9 5v10l-9 5-9-5V7z M3 7l9 5 9-5 M12 12v10',
  smartClip: 'M4 4l16 16 M4 20L20 4 M8 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M8 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  plus: 'M12 5v14 M5 12h14',
  fit: 'M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5',
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',
  keyboard: 'M2 5h20v14H2z M6 9h.01 M10 9h.01 M14 9h.01 M18 9h.01 M6 13h.01 M10 13h.01 M14 13h.01 M18 13h.01 M7 16h10',
  map: 'M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2z M9 3v16 M15 5v16',
  tasks: 'M8 5h13 M8 12h13 M8 19h13 M3 5h.01 M3 12h.01 M3 19h.01',
  upload: 'M12 16V3 M7 8l5-5 5 5 M3 16v5h18v-5',
  settings: 'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6',
};
export default function StudioIcon({ name, size = 16, style }: { name: string; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name] ?? paths.settings} /></svg>;
}
