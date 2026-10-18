/**
 * grid-slicer.ts — 宫格切分器数学库
 *
 *  - computeCells：按归一化分割线位置计算每个子格的像素矩形
 *  - cropCells：用 OffscreenCanvas（不可用时回退普通 canvas）无损裁切
 *  - 子节点坐标：宫格展开时的画布坐标计算
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 计算宫格。verticals/horizontals 为归一化分割线位置（0..1，不含 0/1 边界）。
 * 例：2×2 → verticals=[0.5], horizontals=[0.5]；3×3 → [1/3, 2/3]。
 */
export function computeCells(
  imgW: number,
  imgH: number,
  verticals: number[],
  horizontals: number[],
): Rect[] {
  const xs = [0, ...[...verticals].sort((a, b) => a - b).map((f) => f * imgW), imgW];
  const ys = [0, ...[...horizontals].sort((a, b) => a - b).map((f) => f * imgH), imgH];
  const cells: Rect[] = [];
  for (let r = 0; r < ys.length - 1; r++) {
    for (let c = 0; c < xs.length - 1; c++) {
      const x = Math.round(xs[c]);
      const y = Math.round(ys[r]);
      cells.push({ x, y, w: Math.round(xs[c + 1]) - x, h: Math.round(ys[r + 1]) - y });
    }
  }
  return cells;
}

/** 加载图片（用于裁切前取自然尺寸） */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("图片加载失败"));
    img.src = src;
  });
}

function makeCanvas(w: number, h: number): {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
} {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(w, h);
    return { canvas, ctx: canvas.getContext("2d") };
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext("2d") };
}

/**
 * 按 cells 裁切，返回每格的 PNG Blob（无损）。
 * dataURL/objectURL 来源的同源图片可直接裁切；跨域图片需 CORS 头。
 */
export async function cropCells(
  img: HTMLImageElement,
  cells: Rect[],
): Promise<Array<{ blob: Blob; rect: Rect }>> {
  const out: Array<{ blob: Blob; rect: Rect }> = [];
  for (const rect of cells) {
    const { canvas, ctx } = makeCanvas(rect.w, rect.h);
    if (!ctx) throw new Error("无法创建 2D 上下文");
    ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
    const blob: Blob | null =
      canvas instanceof OffscreenCanvas
        ? await canvas.convertToBlob({ type: "image/png" })
        : await new Promise((res) => (canvas as HTMLCanvasElement).toBlob(res, "image/png"));
    if (!blob) throw new Error("裁切导出失败");
    out.push({ blob, rect });
  }
  return out;
}

/**
 * 子节点坐标：以父节点为基准向右展开，2 列行列布局。
 * 返回第 index 个子节点的画布坐标。
 */
export function childNodePosition(
  parentX: number,
  parentY: number,
  index: number,
  cols = 2,
): { x: number; y: number } {
  const col = index % cols;
  const row = Math.floor(index / cols);
  return { x: parentX + 420 + col * 360, y: parentY + row * 300 };
}
