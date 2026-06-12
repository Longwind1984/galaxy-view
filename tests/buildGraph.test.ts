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
		const g = buildGraph(files, {}, {}, { includeUnresolved: false });
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
		const g = buildGraph(files, resolved, {}, { includeUnresolved: false });
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
		const g = buildGraph(files, { '01学习/笔记A.md': { '02工作/笔记C.md': 99 } }, {}, { includeUnresolved: false });
		expect(g.links).toHaveLength(1);
	});

	it('未解析：开关开启时生成幽灵节点并跨来源去重', () => {
		const unresolved = {
			'01学习/笔记A.md': { 概念词典: 2 },
			'02工作/笔记C.md': { 概念词典: 1, 另一个幽灵: 1 },
		};
		const off = buildGraph(files, {}, unresolved, { includeUnresolved: false });
		expect(off.nodes).toHaveLength(4);
		expect(off.links).toHaveLength(0);

		const on = buildGraph(files, {}, unresolved, { includeUnresolved: true });
		const ghosts = on.nodes.filter((n) => n.unresolved);
		expect(ghosts).toHaveLength(2);
		expect(ghosts[0]).toMatchObject({ id: 'unresolved:概念词典', folderTop: '__unresolved__' });
		expect(on.links).toHaveLength(3);
		expect(on.nodes.find((n) => n.id === 'unresolved:概念词典')?.degree).toBe(2);
	});

	it('空 vault 不炸', () => {
		const g = buildGraph([], {}, {}, { includeUnresolved: true });
		expect(g.nodes).toHaveLength(0);
		expect(g.links).toHaveLength(0);
	});
});
