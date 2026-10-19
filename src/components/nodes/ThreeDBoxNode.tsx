"use client";

/**
 * ThreeDBoxNode — 3D-BOX 空间预演节点
 * Three.js 视口搭景（网格 + 3 景片）+ 手绘运镜轨迹转相机运动向量 + 播放预览
 * 注意：three 初始化只在 useEffect（客户端）内执行，SSR 安全。
 */
import { useEffect, useRef, useState } from "react";
import type { NodeProps } from "@xyflow/react";
import * as THREE from "three";
import { NodeShell } from "./NodeShell";
import { useCanvasStore } from "@/store/useCanvasStore";
import type { ThreeDBoxNodeData, Vec2 } from "@/types/libtv-schema";

type CameraMove = ThreeDBoxNodeData["cameraMoves"][number];
type MoveType = CameraMove["type"];
const MOVE_TYPES: MoveType[] = ["push", "pull", "pan", "tilt", "dolly", "orbit", "crane"];
const MOVE_LABELS: Record<MoveType, string> = {
  push: "推",
  pull: "拉",
  pan: "摇",
  tilt: "俯仰",
  dolly: "移",
  orbit: "环绕",
  crane: "升降",
};

const inputCls =
  "w-full rounded bg-[var(--wx-bg-input)] border border-[var(--wx-border)] px-2 py-1 text-xs text-[var(--wx-text-1)]";
const labelCls = "mb-1 block text-[11px] text-[var(--wx-text-2)]";
const ghostBtnCls =
  "rounded border border-[var(--wx-border)] px-2.5 py-1 text-xs text-[var(--wx-text-2)] hover:bg-[var(--wx-text-1)]/5";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export default function ThreeDBoxNode(props: NodeProps) {
  const { id, selected } = props;
  const data = props.data as unknown as ThreeDBoxNodeData;
  const stale = useCanvasStore((s) => s.graph.nodes.find((n) => n.id === id)?.stale ?? false);
  const patchNodeData = useCanvasStore((s) => s.patchNodeData);
  const touchNode = useCanvasStore((s) => s.touchNode);

  const containerRef = useRef<HTMLDivElement>(null);
  const orbitRef = useRef({ az: 0.8, pol: 1.0, r: 12 });
  const playOffsetRef = useRef({ az: 0, pol: 0 });
  const stopRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [objectCount, setObjectCount] = useState(0);

  const moves: CameraMove[] = data.cameraMoves ?? [];

  // --- Three.js 场景初始化（仅客户端） ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const w = container.clientWidth || 348;
    const h = 220;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0e14);
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 1000);

    scene.add(new THREE.GridHelper(20, 20, 0x334155, 0x1e293b));
    const boxes: THREE.Mesh[] = [];
    const defs: Array<[number, number, number, number]> = [
      [-3, 1, 0, 0x38bdf8],
      [0, 1, -3, 0xfb7185],
      [3, 1, 2, 0x2dd4bf],
    ];
    for (const [x, y, z, color] of defs) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(2, 2, 2),
        new THREE.MeshStandardMaterial({ color }),
      );
      mesh.position.set(x, y, z);
      scene.add(mesh);
      boxes.push(mesh);
    }
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 10, 7);
    scene.add(dir);
    setObjectCount(1 + boxes.length); // 网格 + 3 景片

    // 指针拖拽旋转 / 滚轮缩放
    const canvas = renderer.domElement;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const o = orbitRef.current;
      o.az -= (e.clientX - lastX) * 0.005;
      o.pol = Math.min(1.45, Math.max(0.15, o.pol - (e.clientY - lastY) * 0.005));
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onUp = () => {
      dragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const o = orbitRef.current;
      o.r = Math.min(30, Math.max(4, o.r * (e.deltaY > 0 ? 1.1 : 0.9)));
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    let raf = 0;
    const render = () => {
      const o = orbitRef.current;
      const p = playOffsetRef.current;
      const az = o.az + p.az;
      const pol = o.pol + p.pol;
      camera.position.set(
        o.r * Math.sin(pol) * Math.cos(az),
        o.r * Math.cos(pol),
        o.r * Math.sin(pol) * Math.sin(az),
      );
      camera.lookAt(0, 1, 0);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("wheel", onWheel);
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          const mat = mesh.material as THREE.Material | THREE.Material[];
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
      });
      renderer.dispose();
      if (container.contains(canvas)) container.removeChild(canvas);
    };
  }, []);

  // --- 运镜播放：from→to 映射为球坐标偏移，按 durationMs 线性插值 ---
  const playMoves = () => {
    const list = (
      useCanvasStore.getState().graph.nodes.find((n) => n.id === id)?.data as unknown as
        | ThreeDBoxNodeData
        | undefined
    )?.cameraMoves;
    if (!list || list.length === 0) return;
    stopRef.current = false;
    setPlaying(true);
    playOffsetRef.current = { az: 0, pol: 0 };

    const playOne = (move: CameraMove): Promise<void> =>
      new Promise((resolve) => {
        const start = performance.now();
        const step = (now: number) => {
          if (stopRef.current) {
            resolve();
            return;
          }
          const t = Math.min(1, (now - start) / Math.max(1, move.durationMs));
          playOffsetRef.current = {
            az: lerp(move.from.x, move.to.x, t) * 1.2,
            pol: lerp(move.from.y, move.to.y, t) * 0.6,
          };
          if (t < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });

    (async () => {
      for (const move of list) {
        if (stopRef.current) break;
        await playOne(move);
      }
      playOffsetRef.current = { az: 0, pol: 0 };
      setPlaying(false);
    })();
  };

  const stopMoves = () => {
    stopRef.current = true;
  };

  const setMoves = (next: CameraMove[]) => {
    patchNodeData(id, { cameraMoves: next });
  };
  const updateMove = (moveId: string, patch: Partial<CameraMove>) => {
    setMoves(moves.map((m) => (m.id === moveId ? { ...m, ...patch } : m)));
  };
  const updateVec = (moveId: string, key: "from" | "to", axis: "x" | "y", v: number) => {
    setMoves(
      moves.map((m) =>
        m.id === moveId ? { ...m, [key]: { ...m[key], [axis]: v } as Vec2 } : m,
      ),
    );
  };

  return (
    <NodeShell
      id={id}
      title="3D-BOX 空间预演"
      stale={stale}
      selected={selected}
      accent="var(--wx-accent)"
      width={380}
    >
      <div ref={containerRef} className="h-[220px] w-full overflow-hidden rounded bg-[var(--wx-bg-input)]" />
      <pre className="mt-1 text-[11px] text-[var(--wx-text-3)]">
        {JSON.stringify({ objects: objectCount, cameraMoves: moves.length })}
      </pre>

      <div className="mt-1 flex gap-2">
        {!playing ? (
          <button className={ghostBtnCls} onClick={playMoves} disabled={moves.length === 0}>
            播放运镜
          </button>
        ) : (
          <button className={ghostBtnCls} onClick={stopMoves}>
            停止
          </button>
        )}
        <button
          className={ghostBtnCls}
          onClick={() => {
            setMoves([
              ...moves,
              {
                id: `move-${Date.now()}`,
                type: "push",
                from: { x: 0, y: 0 },
                to: { x: 0.5, y: 0 },
                durationMs: 2000,
              },
            ]);
            touchNode(id);
          }}
        >
          + 添加运镜
        </button>
      </div>

      <div className="mt-2 space-y-2">
        {moves.length === 0 && (
          <div className="text-[11px] text-[var(--wx-text-3)]">暂无运镜，点击上方添加</div>
        )}
        {moves.map((m) => (
          <div key={m.id} className="rounded border border-[var(--wx-border)] p-2">
            <div className="mb-1 flex items-center gap-1">
              <select
                className={`${inputCls} w-24 shrink-0`}
                value={m.type}
                onChange={(e) => updateMove(m.id, { type: e.target.value as MoveType })}
                onBlur={() => touchNode(id)}
              >
                {MOVE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {MOVE_LABELS[t]}
                  </option>
                ))}
              </select>
              <div className="flex flex-1 items-center gap-1">
                <input
                  type="number"
                  step={0.1}
                  className={inputCls}
                  title="from.x"
                  value={m.from.x}
                  onChange={(e) => updateVec(m.id, "from", "x", Number(e.target.value) || 0)}
                  onBlur={() => touchNode(id)}
                />
                <input
                  type="number"
                  step={0.1}
                  className={inputCls}
                  title="from.y"
                  value={m.from.y}
                  onChange={(e) => updateVec(m.id, "from", "y", Number(e.target.value) || 0)}
                  onBlur={() => touchNode(id)}
                />
                <span className="text-[var(--wx-text-2)]">→</span>
                <input
                  type="number"
                  step={0.1}
                  className={inputCls}
                  title="to.x"
                  value={m.to.x}
                  onChange={(e) => updateVec(m.id, "to", "x", Number(e.target.value) || 0)}
                  onBlur={() => touchNode(id)}
                />
                <input
                  type="number"
                  step={0.1}
                  className={inputCls}
                  title="to.y"
                  value={m.to.y}
                  onChange={(e) => updateVec(m.id, "to", "y", Number(e.target.value) || 0)}
                  onBlur={() => touchNode(id)}
                />
              </div>
              <button
                className="shrink-0 rounded px-1.5 text-[var(--wx-text-2)] hover:bg-[var(--wx-danger)]/20 hover:text-[var(--wx-danger)]"
                title="删除运镜"
                onClick={() => {
                  setMoves(moves.filter((x) => x.id !== m.id));
                  touchNode(id);
                }}
              >
                ×
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className={labelCls}>时长(ms)</span>
              <input
                type="number"
                min={100}
                step={100}
                className={inputCls}
                value={m.durationMs}
                onChange={(e) =>
                  updateMove(m.id, { durationMs: Math.max(100, Number(e.target.value) || 100) })
                }
                onBlur={() => touchNode(id)}
              />
            </div>
          </div>
        ))}
      </div>
    </NodeShell>
  );
}
