import { describe, expect, it } from 'vitest';
import type { GraphData } from '../src/types';
import { buildAdjacency, neighborhood, shortestPath } from '../src/data/Adjacency';

// 链式 0-1-2-3 + 一条分支 1-4：用来验证 CSR 与深度 BFS
//   0 — 1 — 2 — 3
//       |
//       4
function chain(): GraphData {
	return {
		nodes: [0, 1, 2, 3, 4].map((i) => ({
			id: `${i}`,
			name: `${i}`,
			folderTop: '',
			degree: 0,
			inDegree: 0,
			outDegree: 0,
			fileSize: 0,
			tags: [],
			unresolved: false,
			tag: false,
		})),
		links: [
			{ source: 0, target: 1 },
			{ source: 1, target: 2 },
			{ source: 2, target: 3 },
			{ source: 1, target: 4 },
		],
	};
}

describe('buildAdjacency (CSR)', () => {
	it('每条无向边贡献两个 incidence；offset 单调、长度 n+1', () => {
		const adj = buildAdjacency(chain());
		expect(adj.offset).toHaveLength(6); // n+1
		expect(adj.neighbor).toHaveLength(8); // 2m
		expect(adj.linkOf).toHaveLength(8);
		// 节点 1 的度数 = 3（连 0,2,4）
		const deg1 = (adj.offset[2] ?? 0) - (adj.offset[1] ?? 0);
		expect(deg1).toBe(3);
	});

	it('邻接项含正确对端与并行 link 索引', () => {
		const adj = buildAdjacency(chain());
		const start = adj.offset[1] ?? 0;
		const end = adj.offset[2] ?? 0;
		const neigh = new Set<number>();
		for (let e = start; e < end; e++) neigh.add(adj.neighbor[e] ?? -1);
		expect(neigh).toEqual(new Set([0, 2, 4]));
	});

	it('空图不崩', () => {
		const adj = buildAdjacency({ nodes: [], links: [] });
		expect(adj.offset).toHaveLength(1);
		expect(adj.neighbor).toHaveLength(0);
	});
});

describe('neighborhood (depth-limited BFS)', () => {
	it('depth 1：只到直接邻居，linkTier1 = 选中的边，无 tier2', () => {
		const { depthOf, linkTier1, linkTier2 } = neighborhood(buildAdjacency(chain()), 1, 1);
		expect(depthOf.get(1)).toBe(0);
		expect(depthOf.get(0)).toBe(1);
		expect(depthOf.get(2)).toBe(1);
		expect(depthOf.get(4)).toBe(1);
		expect(depthOf.has(3)).toBe(false); // 二度不在深度 1
		expect(linkTier1).toHaveLength(3); // 1-0, 1-2, 1-4
		expect(linkTier2).toHaveLength(0);
	});

	it('depth 2：纳入二度环（节点 3），tier2 非空', () => {
		const { depthOf, linkTier2 } = neighborhood(buildAdjacency(chain()), 1, 2);
		expect(depthOf.get(3)).toBe(2);
		expect(linkTier2.length).toBeGreaterThan(0); // 2-3 连到二度环
	});

	it('从叶子 0 出发 depth 2：0→1(一度)→{2,4}(二度)', () => {
		const { depthOf } = neighborhood(buildAdjacency(chain()), 0, 2);
		expect(depthOf.get(0)).toBe(0);
		expect(depthOf.get(1)).toBe(1);
		expect(depthOf.get(2)).toBe(2);
		expect(depthOf.get(4)).toBe(2);
		expect(depthOf.has(3)).toBe(false); // 三度之外
	});
});

describe('shortestPath (guided path BFS)', () => {
	it('链上最短路 0→3 = [0,1,2,3]', () => {
		expect(shortestPath(buildAdjacency(chain()), 0, 3)).toEqual([0, 1, 2, 3]);
	});

	it('分支 3→4 经枢纽 1 = [3,2,1,4]', () => {
		expect(shortestPath(buildAdjacency(chain()), 3, 4)).toEqual([3, 2, 1, 4]);
	});

	it('同点返回单元素，不连通返回空', () => {
		expect(shortestPath(buildAdjacency(chain()), 2, 2)).toEqual([2]);
		// 加一个孤立节点 5（无边）→ 与其它不连通
		const g = chain();
		g.nodes.push({ id: '5', name: '5', folderTop: '', degree: 0, inDegree: 0, outDegree: 0, fileSize: 0, tags: [], unresolved: false, tag: false });
		expect(shortestPath(buildAdjacency(g), 0, 5)).toEqual([]);
	});
});
