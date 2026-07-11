import { describe, expect, it } from 'vitest';
import { buildGraph } from '../src/data/buildGraph';

const files = [
	{ path: '01学习/笔记A.md', basename: '笔记A' },
	{ path: '01学习/子目录/笔记B.md', basename: '笔记B' },
	{ path: '02工作/笔记C.md', basename: '笔记C' },
	{ path: '根笔记.md', basename: '根笔记' },
];

describe('buildGraph', () => {
	it('节点：路径为 id，顶层文件夹归组，根目录为空串', () => {
		const g = buildGraph(files, {}, {}, { includeUnresolved: false, includeOrphans: true });
		expect(g.nodes).toHaveLength(4);
		expect(g.nodes[0]).toMatchObject({ id: '01学习/笔记A.md', folderTop: '01学习', unresolved: false });
		expect(g.nodes[1]?.folderTop).toBe('01学习');
		expect(g.nodes[3]?.folderTop).toBe('');
	});

	it('边：按索引，degree=出+入；非 md 集合内目标（附件/不存在）被丢弃', () => {
		const resolved = {
			'01学习/笔记A.md': { '01学习/子目录/笔记B.md': 3, '附件/图.png': 1 },
			'02工作/笔记C.md': { '01学习/笔记A.md': 1 },
			'幽灵来源.md': { '01学习/笔记A.md': 1 },
		};
		const g = buildGraph(files, resolved, {}, { includeUnresolved: false, includeOrphans: true });
		expect(g.links).toEqual([
			{ source: 0, target: 1 },
			{ source: 2, target: 0 },
		]);
		expect(g.nodes[0]?.degree).toBe(2);
		expect(g.nodes[1]?.degree).toBe(1);
		expect(g.nodes[2]?.degree).toBe(1);
		expect(g.nodes[3]?.degree).toBe(0);
	});

	it('resolvedLinks 同对多次出现（值=次数）只产生一条边', () => {
		const g = buildGraph(files, { '01学习/笔记A.md': { '02工作/笔记C.md': 99 } }, {}, { includeUnresolved: false, includeOrphans: true });
		expect(g.links).toHaveLength(1);
	});

	it('未解析：开关开启时生成幽灵节点并跨来源去重', () => {
		const unresolved = {
			'01学习/笔记A.md': { 概念词典: 2 },
			'02工作/笔记C.md': { 概念词典: 1, 另一个幽灵: 1 },
		};
		const off = buildGraph(files, {}, unresolved, { includeUnresolved: false, includeOrphans: true });
		expect(off.nodes).toHaveLength(4);
		expect(off.links).toHaveLength(0);

		const on = buildGraph(files, {}, unresolved, { includeUnresolved: true, includeOrphans: true });
		const ghosts = on.nodes.filter((n) => n.unresolved);
		expect(ghosts).toHaveLength(2);
		expect(ghosts[0]).toMatchObject({ id: 'unresolved:概念词典', folderTop: '__unresolved__' });
		expect(on.links).toHaveLength(3);
		expect(on.nodes.find((n) => n.id === 'unresolved:概念词典')?.degree).toBe(2);
	});

	it('空 vault 不炸', () => {
		const g = buildGraph([], {}, {}, { includeUnresolved: true, includeOrphans: true });
		expect(g.nodes).toHaveLength(0);
		expect(g.links).toHaveLength(0);
	});
});

describe('孤儿过滤', () => {
	it('includeOrphans=false 时去掉零度节点并重排边索引', () => {
		const resolved = { '01学习/笔记A.md': { '02工作/笔记C.md': 1 } };
		const g = buildGraph(files, resolved, {}, { includeUnresolved: false, includeOrphans: false });
		expect(g.nodes.map((n) => n.name)).toEqual(['笔记A', '笔记C']);
		expect(g.links).toEqual([{ source: 0, target: 1 }]);
	});

	it('fileSize 从 FileRecord.size 透传', () => {
		const sized = [{ path: 'a.md', basename: 'a', size: 12345 }];
		const g = buildGraph(sized, {}, {}, { includeUnresolved: false, includeOrphans: true });
		expect(g.nodes[0]?.fileSize).toBe(12345);
	});
});

describe('质量档位帽（M4）', () => {
	it('nodeCap 按度数取 top N 并重排索引；linkCap 按 min(端点度数) 截断', () => {
		const resolved = {
			'01学习/笔记A.md': { '01学习/子目录/笔记B.md': 1, '02工作/笔记C.md': 1, '根笔记.md': 1 },
			'01学习/子目录/笔记B.md': { '02工作/笔记C.md': 1 },
		};
		// 度数：A=3, B=2, C=2, 根=1
		const capped = buildGraph(files, resolved, {}, { includeUnresolved: false, includeOrphans: true, nodeCap: 3 });
		expect(capped.nodes.map((n) => n.name)).toEqual(['笔记A', '笔记B', '笔记C']);
		expect(capped.links).toHaveLength(3); // A-根 被丢弃
		const linkCapped = buildGraph(files, resolved, {}, { includeUnresolved: false, includeOrphans: true, linkCap: 2 });
		expect(linkCapped.links).toHaveLength(2);
		// 保留的是 min 度数最高的边：A-B(min2)、A-C(min2)，丢 B-C? min(B,C)=2 同分按原序——丢的是 A-根(min1)
		expect(linkCapped.links.every((l) => l.source !== 3 && l.target !== 3)).toBe(true);
	});
});

describe('标签作为节点', () => {
	const taggedFiles = [
		{ path: 'a.md', basename: 'a', tags: ['#课堂笔记', '#数学'] },
		{ path: 'b.md', basename: 'b', tags: ['#课堂笔记'] },
	];

	it('includeTags：共享 tag 的两篇笔记连到同一 tag 节点，该节点 degree=2', () => {
		const g = buildGraph(taggedFiles, {}, {}, { includeUnresolved: false, includeOrphans: true, includeTags: true });
		const tagIdx = g.nodes.findIndex((n) => n.id === 'tag:#课堂笔记');
		expect(tagIdx).toBeGreaterThanOrEqual(0);
		expect(g.nodes[tagIdx]?.tag).toBe(true);
		expect(g.nodes[tagIdx]?.folderTop).toBe('__tag__');
		expect(g.nodes[tagIdx]?.degree).toBe(2); // a、b 各连一条
		expect(g.links.filter((l) => l.target === tagIdx)).toHaveLength(2);
		// #数学 只有 a 带 → degree 1
		expect(g.nodes.find((n) => n.id === 'tag:#数学')?.degree).toBe(1);
	});

	it('includeTags=false：无 tag 节点', () => {
		const g = buildGraph(taggedFiles, {}, {}, { includeUnresolved: false, includeOrphans: true, includeTags: false });
		expect(g.nodes.every((n) => !n.tag)).toBe(true);
		expect(g.nodes).toHaveLength(2);
	});

	it('同笔记重复同一 tag 去重，不产生重边', () => {
		const dup = [{ path: 'a.md', basename: 'a', tags: ['#x', '#x'] }];
		const g = buildGraph(dup, {}, {}, { includeUnresolved: false, includeOrphans: true, includeTags: true });
		expect(g.links).toHaveLength(1);
		expect(g.nodes.filter((n) => n.tag)).toHaveLength(1);
	});
});
