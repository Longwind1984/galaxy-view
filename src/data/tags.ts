import type { GraphNode } from '../types';

export interface TagStat {
	tag: string;
	count: number;
}

export function topTags(nodes: GraphNode[], limit: number): TagStat[] {
	const counts = new Map<string, number>();
	for (const node of nodes) {
		if (node.tagHub || node.unresolved) continue;
		for (const tag of new Set(node.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
	}
	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, limit)
		.map(([tag, count]) => ({ tag, count }));
}
