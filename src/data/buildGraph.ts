import type { GraphData, GraphLink, GraphNode } from '../types';


/** 输入用纯记录，不依赖 obsidian —— 可单测（设计要求） */
export interface FileRecord {
	path: string;
	basename: string;
	size?: number; // 字节
	tags?: string[]; // getAllTags 结果（带 # 前缀，含 frontmatter+正文）；仅 includeTags 时用
}

export type LinkTable = Record<string, Record<string, number>>;

export interface BuildOptions {
	includeUnresolved: boolean;
	includeOrphans: boolean;
	/** 标签作为节点：每篇笔记连到它带的标签合成节点上（共享 tag 的笔记通过标签星成簇） */
	includeTags?: boolean;
	/** 移动档：按度数取 top N 节点（保枢纽结构），null=不限 */
	nodeCap?: number | null;
	/** 移动档：按 min(端点度数) 取 top N 边，null=不限 */
	linkCap?: number | null;
}

/** 顶层文件夹＝配色分组键，也是「过滤」图例的粒度；根目录下的笔记返回 '' */
export function topFolder(path: string): string {
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
			unresolved: false,
			tag: false,
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
						unresolved: true,
						tag: false,
					});
				}
				addLink(si, gi);
			}
		}
	}

	if (opts.includeTags) {
		// 每篇笔记 → 它的标签合成节点（复用 unresolved 同构模式）。
		// 新增边数 = 标签出现总次数（线性），不是「共享 tag 两两连」的 N² 爆炸。
		for (const f of files) {
			const si = indexById.get(f.path);
			if (si === undefined) continue;
			for (const rawTag of new Set(f.tags ?? [])) {
				// 同笔记 frontmatter+正文可能重复同一 tag，去重防重边
				const tagId = `tag:${rawTag}`;
				let ti = indexById.get(tagId);
				if (ti === undefined) {
					ti = nodes.length;
					indexById.set(tagId, ti);
					nodes.push({
						id: tagId,
						name: rawTag, // 带 # 前缀
						folderTop: '__tag__',
						degree: 0,
						inDegree: 0,
						outDegree: 0,
						fileSize: 0,
						unresolved: false,
						tag: true,
					});
				}
				addLink(si, ti);
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
