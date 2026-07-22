import type { GraphData } from '../types';
import type { Adjacency } from './Adjacency';

export interface TopTag {
	id: string;
	name: string;
	count: number;
}

export interface TagLensFocus {
	/** 对应 hub 未开启/未进入 top N 时为 null；Lens 本身不依赖 hub 存在。 */
	tagIndex: number | null;
	nodeIndices: Set<number>;
	linkIndices: number[];
}

export interface ResolvedTagLens {
	id: string | null;
	focus: TagLensFocus | null;
}

export const TAG_HUB_LIMIT_MIN = 5;
export const TAG_HUB_LIMIT_MAX = 50;

export function boundedTagHubLimit(value: number): number {
	if (!Number.isFinite(value)) return 20;
	return Math.min(Math.max(Math.round(value), TAG_HUB_LIMIT_MIN), TAG_HUB_LIMIT_MAX);
}

/** 笔记按文档顺序出现的第一个标签；配色只用这一条，避免多标签混色语义不清。 */
export function primaryTag(node: GraphData['nodes'][number]): string | null {
	return node.tag ? (node.tags[0] ?? node.name) : (node.tags[0] ?? null);
}

/** 当前图中的标签按笔记数降序排列；不依赖 hub 节点，榜外激活标签保留清除入口。 */
export function topTags(data: GraphData, limit = 12, activeId: string | null = null): TopTag[] {
	if (limit <= 0) return [];
	const counts = new Map<string, number>();
	for (const node of data.nodes) {
		if (node.tag || node.unresolved) continue;
		for (const tag of new Set(node.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
	}
	const ranked = [...counts.entries()]
		.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
		.map(([name, count]) => ({ id: `tag:${name}`, name, count }));
	const visible = ranked.slice(0, limit);
	if (activeId && !visible.some((tag) => tag.id === activeId)) {
		const active = ranked.find((tag) => tag.id === activeId);
		if (active) visible.push(active);
	}
	return visible;
}

/** 单选 chip：再次点当前标签即清除。 */
export function toggleTagLens(current: string | null, clicked: string): string | null {
	return current === clicked ? null : clicked;
}

/**
 * 从笔记自身 tags 解析 Lens；hub 只是可选视觉，不是 Lens 的数据依赖。
 * 点击时 O(N+E) 计算一次并缓存到渲染缓冲，动画帧不扫描图。
 */
export function tagLensFocus(data: GraphData, adjacency: Adjacency, tagId: string | null): TagLensFocus | null {
	if (!tagId) return null;
	const tagName = tagId.startsWith('tag:') ? tagId.slice(4) : tagId;
	const nodeIndices = new Set<number>();
	let tagIndex: number | null = null;
	for (let i = 0; i < data.nodes.length; i++) {
		const node = data.nodes[i];
		if (!node) continue;
		if (node.tag && node.id === `tag:${tagName}`) {
			tagIndex = i;
			nodeIndices.add(i);
		} else if (!node.tag && !node.unresolved && node.tags.includes(tagName)) {
			nodeIndices.add(i);
		}
	}
	if (nodeIndices.size === 0 || (tagIndex !== null && nodeIndices.size === 1)) return null;

	const linkSet = new Set<number>();
	if (tagIndex !== null) {
		const start = adjacency.offset[tagIndex] ?? 0;
		const end = adjacency.offset[tagIndex + 1] ?? start;
		for (let edge = start; edge < end; edge++) linkSet.add(adjacency.linkOf[edge] ?? 0);
	}
	for (let i = 0; i < data.links.length; i++) {
		const link = data.links[i];
		if (link && nodeIndices.has(link.source) && nodeIndices.has(link.target)) linkSet.add(i);
	}
	const linkIndices = [...linkSet].sort((a, b) => a - b);
	return { tagIndex, nodeIndices, linkIndices };
}

/** showTags 与当前图共同决定持久化 Lens 是否仍有效。 */
export function resolveTagLens(data: GraphData, adjacency: Adjacency, showTags: boolean, requested: string | null): ResolvedTagLens {
	if (!showTags || !requested) return { id: null, focus: null };
	const focus = tagLensFocus(data, adjacency, requested);
	return focus ? { id: requested, focus } : { id: null, focus: null };
}
