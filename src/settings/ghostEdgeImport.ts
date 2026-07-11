import type { App } from 'obsidian';
import { normalizePath } from 'obsidian';

export interface GhostEdgeRecord {
	source: string; // vault 相对路径（= GraphNode.id）
	target: string;
	state: 'pending' | 'deferred';
	score: number; // 0..1
}

/**
 * 读 Constellation 伴侣插件输出的幽灵边协议文件（只读，永不回写）。
 * 协议 version 1；遇到更高版本整体忽略（fail-safe）。文件缺失/损坏一律回 null——
 * 联动可视化是增强，绝不能碎主功能。姿势与 graphJsonImport.ts 完全一致。
 */
export async function readGhostEdges(app: App): Promise<GhostEdgeRecord[] | null> {
	try {
		const path = normalizePath(app.vault.configDir + '/plugins/constellation/ghost-edges.json');
		if (!(await app.vault.adapter.exists(path))) return null;
		const parsed = JSON.parse(await app.vault.adapter.read(path)) as {
			version?: unknown;
			edges?: unknown[];
		};
		if (typeof parsed.version !== 'number' || parsed.version > 1) return null; // 版本门禁
		const out: GhostEdgeRecord[] = [];
		for (const e of parsed.edges ?? []) {
			const r = e as { source?: unknown; target?: unknown; state?: unknown; score?: unknown };
			if (typeof r.source !== 'string' || typeof r.target !== 'string' || r.source === r.target) continue;
			out.push({
				source: r.source,
				target: r.target,
				state: r.state === 'deferred' ? 'deferred' : 'pending',
				score: typeof r.score === 'number' && isFinite(r.score) ? Math.min(Math.max(r.score, 0), 1) : 0.5,
			});
		}
		return out;
	} catch {
		return null;
	}
}
