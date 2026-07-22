import { describe, expect, it } from 'vitest';
import { buildAdjacency } from '../src/data/Adjacency';
import { buildGraph } from '../src/data/buildGraph';
import { boundedTagHubLimit, primaryTag, resolveTagLens, tagLensFocus, toggleTagLens, topTags } from '../src/data/tagLens';

function taggedGraph(hubs = false) {
	return buildGraph(
		[
			{ path: 'a.md', basename: 'a', tags: ['#shared', '#alpha'] },
			{ path: 'b.md', basename: 'b', tags: ['#shared', '#beta'] },
			{ path: 'c.md', basename: 'c', tags: ['#shared', '#beta'] },
		],
		{ 'a.md': { 'b.md': 1 } },
		{},
		{ includeUnresolved: false, includeOrphans: true, includeTags: true, includeTagHubs: hubs, tagHubLimit: 5 },
	);
}

describe('topTags', () => {
	it('不依赖 hub 节点，按笔记标签出现次数返回 top N', () => {
		const tags = topTags(taggedGraph(), 2);
		expect(tags).toEqual([
			{ id: 'tag:#shared', name: '#shared', count: 3 },
			{ id: 'tag:#beta', name: '#beta', count: 2 },
		]);
	});

	it('默认最多 12 个标签', () => {
		const files = Array.from({ length: 14 }, (_, i) => ({ path: `${i}.md`, basename: `${i}`, tags: [`#t${i}`] }));
		const graph = buildGraph(files, {}, {}, { includeUnresolved: false, includeOrphans: true, includeTags: true });
		expect(topTags(graph)).toHaveLength(12);
	});

	it('激活标签跌出 top 12 时追加保留清除入口', () => {
		const files = Array.from({ length: 14 }, (_, i) => ({ path: `${i}.md`, basename: `${i}`, tags: [`#t${i}`] }));
		const graph = buildGraph(files, {}, {}, { includeUnresolved: false, includeOrphans: true, includeTags: true });
		const tags = topTags(graph, 12, 'tag:#t9');
		expect(tags).toHaveLength(13);
		expect(tags[12]?.id).toBe('tag:#t9');
	});
});

describe('tagLensFocus', () => {
	it('hubs 关闭时仍包含匹配笔记及匹配笔记之间的真实链接', () => {
		const graph = taggedGraph();
		const lens = tagLensFocus(graph, buildAdjacency(graph), 'tag:#shared');
		expect(lens).not.toBeNull();
		const ids = [...(lens?.nodeIndices ?? [])].map((index) => graph.nodes[index]?.id);
		expect(new Set(ids)).toEqual(new Set(['a.md', 'b.md', 'c.md']));
		expect(lens?.tagIndex).toBeNull();
		expect(lens?.linkIndices).toEqual([0]); // a → b 是两篇匹配笔记间的真实链接
	});

	it('hubs 开启时复用同一 Lens，并加入对应 hub 与 hub 边', () => {
		const graph = taggedGraph(true);
		const lens = tagLensFocus(graph, buildAdjacency(graph), 'tag:#shared');
		const ids = [...(lens?.nodeIndices ?? [])].map((index) => graph.nodes[index]?.id);
		expect(new Set(ids)).toEqual(new Set(['tag:#shared', 'a.md', 'b.md', 'c.md']));
		expect(lens?.tagIndex).not.toBeNull();
		expect(lens?.linkIndices).toHaveLength(4); // 1 条真实链接 + 3 条 hub 边
	});

	it('标签在重建后消失时返回 null', () => {
		const graph = taggedGraph();
		expect(tagLensFocus(graph, buildAdjacency(graph), 'tag:#missing')).toBeNull();
		expect(tagLensFocus(graph, buildAdjacency(graph), null)).toBeNull();
	});
});

describe('tag helpers', () => {
	it('hub limit 对旧存档/异常值收口到 5–50', () => {
		expect(boundedTagHubLimit(-1)).toBe(5);
		expect(boundedTagHubLimit(12.6)).toBe(13);
		expect(boundedTagHubLimit(999)).toBe(50);
	});

	it('primaryTag 使用笔记的第一个标签，hub 使用自身代表标签', () => {
		const graph = taggedGraph(true);
		expect(primaryTag(graph.nodes.find((n) => n.id === 'a.md')!)).toBe('#shared');
		expect(primaryTag(graph.nodes.find((n) => n.id === 'tag:#shared')!)).toBe('#shared');
	});
});

describe('toggleTagLens', () => {
	it('单选切换；再次点当前标签清除', () => {
		expect(toggleTagLens(null, 'tag:#a')).toBe('tag:#a');
		expect(toggleTagLens('tag:#a', 'tag:#b')).toBe('tag:#b');
		expect(toggleTagLens('tag:#a', 'tag:#a')).toBeNull();
	});
});

describe('resolveTagLens', () => {
	it('关闭 showTags 或重建后标签消失都会清理持久化 id', () => {
		const graph = taggedGraph();
		const adjacency = buildAdjacency(graph);
		expect(resolveTagLens(graph, adjacency, false, 'tag:#shared')).toEqual({ id: null, focus: null });
		expect(resolveTagLens(graph, adjacency, true, 'tag:#missing')).toEqual({ id: null, focus: null });
	});

	it('启用且标签仍存在时保留持久化 id 并恢复 Lens', () => {
		const graph = taggedGraph();
		const resolved = resolveTagLens(graph, buildAdjacency(graph), true, 'tag:#shared');
		expect(resolved.id).toBe('tag:#shared');
		expect(resolved.focus?.nodeIndices.size).toBe(3); // hub 关闭也能恢复三篇匹配笔记
	});
});
