import type { GraphData } from '../types';

/**
 * 无向邻接（CSR：压缩稀疏行）——三条扁平 typed array，零逐节点对象分配、缓存友好。
 * 纯数据、可单测（仿 buildGraph.ts 约定），随 GraphStore.rebuild 每次重建、键于新索引。
 */
export interface Adjacency {
	/** 长度 n+1；节点 i 的邻接项在 [offset[i], offset[i+1]) */
	offset: Int32Array;
	/** 长度 2m；每个 incidence 的对端节点索引 */
	neighbor: Int32Array;
	/** 长度 2m；并行数组：该 incidence 对应的 GraphLink 索引 */
	linkOf: Int32Array;
}

export function buildAdjacency(data: GraphData): Adjacency {
	const n = data.nodes.length;
	const m = data.links.length;
	const offset = new Int32Array(n + 1);
	// 计数：每条边给两端各 +1（无向）
	for (const l of data.links) {
		offset[l.source + 1] = (offset[l.source + 1] ?? 0) + 1;
		offset[l.target + 1] = (offset[l.target + 1] ?? 0) + 1;
	}
	// 前缀和 → 每个节点的起始写入位
	for (let i = 0; i < n; i++) offset[i + 1] = (offset[i + 1] ?? 0) + (offset[i] ?? 0);
	const neighbor = new Int32Array(2 * m);
	const linkOf = new Int32Array(2 * m);
	const cursor = new Int32Array(n);
	for (let i = 0; i < n; i++) cursor[i] = offset[i] ?? 0;
	for (let li = 0; li < m; li++) {
		const l = data.links[li];
		if (!l) continue;
		const s = l.source;
		const t = l.target;
		const cs = cursor[s] ?? 0;
		neighbor[cs] = t;
		linkOf[cs] = li;
		cursor[s] = cs + 1;
		const ct = cursor[t] ?? 0;
		neighbor[ct] = s;
		linkOf[ct] = li;
		cursor[t] = ct + 1;
	}
	return { offset, neighbor, linkOf };
}

export interface Neighborhood {
	/** 节点索引 → 深度（0=选中 / 1=一度 / 2=二度） */
	depthOf: Map<number, number>;
	/** 与选中直接相连的边索引（一度高亮） */
	linkTier1: number[];
	/** 连到二度环的边索引（二度高亮，仅 maxDepth=2 时非空） */
	linkTier2: number[];
}

/** 两节点间最短链接路径（无权 BFS）；不连通返回 []，同点返回 [start]。引导巡游用。 */
export function shortestPath(adj: Adjacency, start: number, end: number): number[] {
	if (start === end) return [start];
	const prev = new Map<number, number>([[start, -1]]);
	const queue = [start];
	let head = 0;
	while (head < queue.length) {
		const u = queue[head++] ?? -1;
		if (u === end) break;
		const s = adj.offset[u] ?? 0;
		const e = adj.offset[u + 1] ?? 0;
		for (let i = s; i < e; i++) {
			const v = adj.neighbor[i] ?? 0;
			if (!prev.has(v)) {
				prev.set(v, u);
				queue.push(v);
			}
		}
	}
	if (!prev.has(end)) return []; // 不连通
	const path: number[] = [];
	let cur: number | undefined = end;
	while (cur !== undefined && cur !== -1) {
		path.push(cur);
		cur = prev.get(cur);
	}
	return path.reverse();
}

/** 从 seed 做深度受限 BFS（maxDepth 1|2）。19.5k 边上仅数十微秒。 */
export function neighborhood(adj: Adjacency, seed: number, maxDepth: 1 | 2): Neighborhood {
	const depthOf = new Map<number, number>([[seed, 0]]);
	const linkTier1: number[] = [];
	const linkTier2: number[] = [];
	let frontier: number[] = [seed];
	for (let d = 1; d <= maxDepth; d++) {
		const next: number[] = [];
		for (const u of frontier) {
			const start = adj.offset[u] ?? 0;
			const end = adj.offset[u + 1] ?? 0;
			for (let e = start; e < end; e++) {
				const v = adj.neighbor[e] ?? 0;
				const li = adj.linkOf[e] ?? 0;
				const dv = depthOf.get(v);
				if (d === 1) linkTier1.push(li);
				else if (dv === undefined || dv === 2) linkTier2.push(li); // 连到新（二度）环的边
				if (dv === undefined) {
					depthOf.set(v, d);
					if (d < maxDepth) next.push(v);
				}
			}
		}
		frontier = next;
	}
	return { depthOf, linkTier1, linkTier2 };
}
