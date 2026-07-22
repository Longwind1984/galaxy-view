import type { GraphData, GraphLink, GraphNode } from '../types';
import { boundedTagHubLimit, topTags } from './tagLens';


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
	/** 读取并透传笔记标签；本身不生成节点或边。 */
	includeTags?: boolean;
	/** 只有 includeTags 同时开启才生成 top-N 标签 hub。 */
	includeTagHubs?: boolean;
	/** 用户设置范围 5–50；构建端再次收口，防止旧/损坏存档制造无界图。 */
	tagHubLimit?: number;
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
 * - 只收 files 集合内的目标（附件等非图节点目标被丢弃）
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
			tags: opts.includeTags ? [...new Set(f.tags ?? [])] : [],
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
						tags: [],
						unresolved: true,
						tag: false,
					});
				}
				addLink(si, gi);
			}
		}
	}

	if (opts.includeTags && opts.includeTagHubs) {
		const limit = boundedTagHubLimit(opts.tagHubLimit ?? 20);
		const ranked = topTags({ nodes, links }, limit);
		const hubByTag = new Map<string, number>();
		for (const stat of ranked) {
			const ti = nodes.length;
			hubByTag.set(stat.name, ti);
			indexById.set(stat.id, ti);
			nodes.push({
				id: stat.id,
				name: stat.name,
				folderTop: '__tag__',
				degree: 0,
				inDegree: 0,
				outDegree: 0,
				fileSize: 0,
				tags: [stat.name],
				unresolved: false,
				tag: true,
			});
		}
		// 最多 limit 个 hub；新增边只遍历已有笔记 tags，一次重建 O(标签出现总数)。
		for (let si = 0; si < nodes.length; si++) {
			const node = nodes[si];
			if (!node || node.tag || node.unresolved) continue;
			for (const rawTag of node.tags) {
				const ti = hubByTag.get(rawTag);
				if (ti !== undefined) addLink(si, ti);
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
