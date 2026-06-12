import type { GraphData, GraphLink, GraphNode } from '../types';

/** 输入用纯记录，不依赖 obsidian —— 可单测（设计要求） */
export interface FileRecord {
	path: string;
	basename: string;
}

export type LinkTable = Record<string, Record<string, number>>;

export interface BuildOptions {
	includeUnresolved: boolean;
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
			unresolved: false,
		});
	}

	const links: GraphLink[] = [];
	const addLink = (si: number, ti: number) => {
		links.push({ source: si, target: ti });
		const s = nodes[si];
		const t = nodes[ti];
		if (s) s.degree++;
		if (t) t.degree++;
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
						unresolved: true,
					});
				}
				addLink(si, gi);
			}
		}
	}

	return { nodes, links };
}
