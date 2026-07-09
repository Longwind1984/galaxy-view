import type { GraphData, GraphLink, GraphNode } from '../types';
import { topTags } from './tags';


/** 输入用纯记录，不依赖 obsidian —— 可单测（设计要求） */
export interface FileRecord {
	path: string;
	basename: string;
	size?: number; // 字节
	tags?: string[];
}

export type LinkTable = Record<string, Record<string, number>>;

export interface BuildOptions {
	includeUnresolved: boolean;
	includeOrphans: boolean;
	/** 移动档：按度数取 top N 节点（保枢纽结构），null=不限 */
	nodeCap?: number | null;
	/** 移动档：按 min(端点度数) 取 top N 边，null=不限 */
	linkCap?: number | null;
	/** 可选：把 top N 标签加入为星云 hub 节点，null/0=关闭 */
	tagHubLimit?: number | null;
}

function topFolder(path: string): string {
	const idx = path.indexOf('/');
	return idx === -1 ? '' : path.slice(0, idx);
}

/**
 * vault 快照 → 图模型。
 * - 只收 files 集合内的目标（附件等非 md 链接目标被丢弃）
 * - resolvedLinks 本身已按 (src,dst) 去重（值是出现次数），无需再去重
 * - degree = 出度 + 入度
 */
export function buildGraph(
	files: FileRecord[],
	resolvedLinks: LinkTable,
	unresolvedLinks: LinkTable,
	opts: BuildOptions,
): GraphData {
	const nodes: GraphNode[] = [];
	const indexById = new Map<string, number>();

	for (const f of files) {
		indexById.set(f.path, nodes.length);
		nodes.push({
			id: f.path,
			name: f.basename,
			folderTop: topFolder(f.path),
			degree: 0,
			inDegree: 0,
			outDegree: 0,
			fileSize: f.size ?? 0,
			tags: f.tags ?? [],
			tagHub: false,
			unresolved: false,
		});
	}

	const links: GraphLink[] = [];
	const addLink = (si: number, ti: number) => {
		links.push({ source: si, target: ti });
		const s = nodes[si];
		const t = nodes[ti];
		if (s) {
			s.degree++;
			s.outDegree++;
		}
		if (t) {
			t.degree++;
			t.inDegree++;
		}
	};

	for (const src of Object.keys(resolvedLinks)) {
		const si = indexById.get(src);
		if (si === undefined) continue;
		const targets = resolvedLinks[src] ?? {};
		for (const dst of Object.keys(targets)) {
			const ti = indexById.get(dst);
			if (ti === undefined) continue;
			addLink(si, ti);
		}
	}

	if (opts.includeUnresolved) {
		for (const src of Object.keys(unresolvedLinks)) {
			const si = indexById.get(src);
			if (si === undefined) continue;
			const targets = unresolvedLinks[src] ?? {};
			for (const name of Object.keys(targets)) {
				const ghostId = `unresolved:${name}`;
				let gi = indexById.get(ghostId);
				if (gi === undefined) {
					gi = nodes.length;
					indexById.set(ghostId, gi);
					nodes.push({
						id: ghostId,
						name,
						folderTop: '__unresolved__',
						degree: 0,
						inDegree: 0,
						outDegree: 0,
						fileSize: 0,
						tags: [],
						tagHub: false,
						unresolved: true,
					});
				}
				addLink(si, gi);
			}
		}
	}

	const tagHubLimit = opts.tagHubLimit ?? null;
	if (tagHubLimit !== null && tagHubLimit > 0) {
		const stats = topTags(nodes, tagHubLimit);
		const keep = new Set(stats.map((s) => s.tag));
		const hubByTag = new Map<string, number>();
		for (const { tag } of stats) {
			const id = `tag:${tag}`;
			const hi = nodes.length;
			indexById.set(id, hi);
			hubByTag.set(tag, hi);
			nodes.push({
				id,
				name: tag,
				folderTop: '__tag__',
				degree: 0,
				inDegree: 0,
				outDegree: 0,
				fileSize: 0,
				tags: [tag],
				tagHub: true,
				unresolved: false,
			});
		}
		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];
			if (!node || node.tagHub || node.unresolved) continue;
			for (const tag of new Set(node.tags)) {
				if (!keep.has(tag)) continue;
				const hi = hubByTag.get(tag);
				if (hi !== undefined) addLink(i, hi);
			}
		}
	}

	let result: GraphData = { nodes, links };
	if (!opts.includeOrphans) {
		// 过滤孤儿（degree 0）：被过滤节点必然无边，只需重排索引
		result = filterNodes(result, (n) => n.degree > 0);
	}
	const nodeCap = opts.nodeCap ?? null;
	if (nodeCap !== null && result.nodes.length > nodeCap) {
		// 度数榜 top N（并列按原序）——保住枢纽结构，「仍像这座库」
		const ranked = [...result.nodes.entries()].sort((a, b) => b[1].degree - a[1].degree || a[0] - b[0]);
		const keepIdx = new Set(ranked.slice(0, nodeCap).map(([i]) => i));
		result = filterNodes(result, (_n, i) => keepIdx.has(i));
	}
	const linkCap = opts.linkCap ?? null;
	if (linkCap !== null && result.links.length > linkCap) {
		const deg = (i: number) => result.nodes[i]?.degree ?? 0;
		result = {
			nodes: result.nodes,
			links: [...result.links.entries()]
				.sort((a, b) => Math.min(deg(b[1].source), deg(b[1].target)) - Math.min(deg(a[1].source), deg(a[1].target)) || a[0] - b[0])
				.slice(0, linkCap)
				.map(([, l]) => l),
		};
	}
	return result;
}

function filterNodes(g: GraphData, keep: (n: GraphNode, i: number) => boolean): GraphData {
	const remap = new Map<number, number>();
	const kept: GraphNode[] = [];
	g.nodes.forEach((n, i) => {
		if (keep(n, i)) {
			remap.set(i, kept.length);
			kept.push(n);
		}
	});
	const links: GraphLink[] = [];
	for (const l of g.links) {
		const s2 = remap.get(l.source);
		const t2 = remap.get(l.target);
		if (s2 !== undefined && t2 !== undefined) links.push({ source: s2, target: t2 });
	}
	return { nodes: kept, links };
}
