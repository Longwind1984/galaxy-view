import type { App } from 'obsidian';
import { normalizePath } from 'obsidian';

export interface ColorGroup {
	query: string; // 已 trim（真实配置带尾随空格）
	color: string; // #rrggbb
}

/**
 * 读自带图谱的 colorGroups（.obsidian/graph.json，未文档化格式——尽力解析，失败回 null）。
 * 颜色存的是十进制 int；query 形如 "path:01学习  "（注意尾随空格）。只读，永不回写。
 */
export async function readGraphColorGroups(app: App): Promise<ColorGroup[] | null> {
	try {
		const path = normalizePath(app.vault.configDir + '/graph.json');
		if (!(await app.vault.adapter.exists(path))) return null;
		const parsed = JSON.parse(await app.vault.adapter.read(path)) as {
			colorGroups?: { query?: unknown; color?: { rgb?: unknown } }[];
		};
		const groups: ColorGroup[] = [];
		for (const g of parsed.colorGroups ?? []) {
			const query = typeof g.query === 'string' ? g.query.trim() : '';
			const rgb = g.color?.rgb;
			if (!query || typeof rgb !== 'number') continue;
			groups.push({ query, color: `#${(rgb & 0xffffff).toString(16).padStart(6, '0')}` });
		}
		return groups;
	} catch {
		return null;
	}
}
