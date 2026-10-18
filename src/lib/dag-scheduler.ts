/**
 * dag-scheduler.ts — DAG 执行调度器
 *
 *  - Kahn 拓扑排序：决定节点执行顺序，输出可并行层级（levels）
 *  - 脏状态级联传播：上游节点被修改后，下游节点自动标记 stale（待重新生成）
 */

import type { CanvasGraph, LibTVEdgeType } from "@/types/libtv-schema";

export interface TopoOptions {
  /** 参与排序的边类型，默认全部（含 autolink 引用边） */
  edgeTypes?: LibTVEdgeType[];
}

export interface TopoResult {
  /** 拓扑序（节点 id 列表） */
  order: string[];
  /** 按最长路径深度分层的可并行执行层级 */
  levels: string[][];
  hasCycle: boolean;
  /** 成环的节点 id（hasCycle 时非空） */
  cycleNodes: string[];
}

function relevantEdges(graph: CanvasGraph, opts?: TopoOptions) {
  const types = opts?.edgeTypes;
  return types ? graph.edges.filter((e) => types.includes(e.type)) : graph.edges;
}

/**
 * Kahn 拓扑排序。返回执行顺序与并行层级；有环时 hasCycle=true，
 * order 中只包含无环部分，cycleNodes 列出成环节点。
 */
export function topologicalSort(graph: CanvasGraph, opts?: TopoOptions): TopoResult {
  const edges = relevantEdges(graph, opts);
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const n of graph.nodes) {
    indegree.set(n.id, 0);
    outgoing.set(n.id, []);
  }
  for (const e of edges) {
    if (!indegree.has(e.source) || !indegree.has(e.target)) continue;
    if (e.source === e.target) continue;
    indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
    outgoing.get(e.source)?.push(e.target);
  }

  const queue: string[] = [];
  const depth = new Map<string, number>();
  for (const [id, deg] of indegree) {
    if (deg === 0) {
      queue.push(id);
      depth.set(id, 0);
    }
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    order.push(id);
    for (const next of outgoing.get(id) ?? []) {
      const d = (depth.get(id) ?? 0) + 1;
      if (d > (depth.get(next) ?? -1)) depth.set(next, d);
      const deg = (indegree.get(next) ?? 1) - 1;
      indegree.set(next, deg);
      if (deg === 0) queue.push(next);
    }
  }

  const cycleNodes = graph.nodes.map((n) => n.id).filter((id) => !order.includes(id));
  const levels: string[][] = [];
  for (const id of order) {
    const d = depth.get(id) ?? 0;
    (levels[d] ??= []).push(id);
  }

  return { order, levels, hasCycle: cycleNodes.length > 0, cycleNodes };
}

/** 取直接上游节点 id */
export function getUpstream(graph: CanvasGraph, nodeId: string): string[] {
  return graph.edges.filter((e) => e.target === nodeId).map((e) => e.source);
}

/** 取直接下游节点 id */
export function getDownstream(graph: CanvasGraph, nodeId: string): string[] {
  return graph.edges.filter((e) => e.source === nodeId).map((e) => e.target);
}

/**
 * 脏状态级联传播：从 changedNodeIds 出发沿边向下游 BFS，
 * 返回所有受影响的下游节点 id（不含源头自身）。
 * 角色节点改动会经 autolink 引用边同步污染引用它的分镜节点。
 */
export function propagateStale(
  graph: CanvasGraph,
  changedNodeIds: string[],
  opts?: TopoOptions,
): Set<string> {
  const edges = relevantEdges(graph, opts);
  const downstream = new Map<string, string[]>();
  for (const e of edges) {
    if (e.source === e.target) continue;
    const list = downstream.get(e.source) ?? [];
    list.push(e.target);
    downstream.set(e.source, list);
  }

  const affected = new Set<string>();
  const queue = [...changedNodeIds];
  const visited = new Set<string>(changedNodeIds);
  while (queue.length > 0) {
    const id = queue.shift() as string;
    for (const next of downstream.get(id) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      affected.add(next);
      queue.push(next);
    }
  }
  return affected;
}

/**
 * 返回标记了 stale 的新图谱（不可变更新，配合 zustand + immer）。
 * changedNodes 自身 stale=false（它们是修改源），下游 stale=true。
 */
export function markStale(graph: CanvasGraph, changedNodeIds: string[]): CanvasGraph {
  const changed = new Set(changedNodeIds);
  const affected = propagateStale(graph, changedNodeIds);
  return {
    nodes: graph.nodes.map((n) => ({
      ...n,
      stale: changed.has(n.id) ? false : affected.has(n.id) ? true : n.stale,
    })),
    edges: graph.edges,
  };
}
