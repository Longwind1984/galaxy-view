import { Color } from 'three';
import { hash32 } from '../data/seed';
import type { GraphNode } from '../types';
import type { ColorGroup } from '../settings/graphJsonImport';
import { primaryTag } from '../data/tagLens';

export type NodeColorFn = (node: GraphNode) => Color;

/**
 * 用户的 2D 图谱配色 → 节点调色函数。
 * 语义对齐自带图谱：path: 前缀匹配、自上而下首个命中生效；无命中走 hash 回退调色板。
 */
export function makeNodeColorFn(groups: ColorGroup[]): NodeColorFn {
	const parsed = groups.map((g) => ({
		prefix: g.query.startsWith('path:') ? g.query.slice(5).trim() : null,
		raw: g.query,
		color: new Color(g.color),
	}));
	return (node) => {
		if (node.tag) return TAG;
		if (node.unresolved) return UNRESOLVED;
		for (const g of parsed) {
			if (g.prefix !== null ? node.id.startsWith(g.prefix) : node.id.includes(g.raw)) return g.color;
		}
		return folderColor(node.folderTop, false);
	};
}

export const fallbackColorFn: NodeColorFn = (node) =>
	node.tag ? TAG : folderColor(node.folderTop, node.unresolved);

const tagColorCache = new Map<string, Color>();

/**
 * 标签颜色只覆盖有主标签的笔记与 hub；无标签/未解析节点回落既有文件夹或导入配色。
 * hash 直接映射 360 色相，新增标签不会让已有标签因排名改变颜色。
 */
export function makeTagColorFn(base: NodeColorFn): NodeColorFn {
	return (node) => {
		if (node.unresolved) return base(node);
		const tag = primaryTag(node);
		if (!tag) return base(node);
		let color = tagColorCache.get(tag);
		if (!color) {
			color = new Color().setHSL((hash32(tag) % 360) / 360, 0.68, 0.6);
			tagColorCache.set(tag, color);
		}
		return color;
	};
}

// Obsidian 标准色族 hsl(h, 60%, 60%) 的色相轮（与 Rick 的 9 组配色同族）；
// 有 colorGroups 时那套优先，本表是无配置文件夹的回退
const HUES = [0, 40, 80, 120, 160, 200, 240, 280, 320];

const NEUTRAL = new Color('#9aa4b2'); // 未分组
const UNRESOLVED = new Color('#7a8499'); // 幽灵
const TAG = new Color('#d8a94b'); // 标签节点：暖琥珀，与文件夹色相/未解析灰区分，读作「元/结构」

const cache = new Map<string, Color>();

/**
 * 按笔记数排名给回退色相，替代原来的 `HUES[hash32(folder) % 9]`。
 *
 * 原实现的缺陷（实测 Rick 的库）：14 个顶层文件夹撞 9 个色相槽，且 hash 是乱序的 →
 * 99Archive(545 篇) / 90故纸堆(86) / Readwise(68) 拿到**同一个蓝**，共 1184 篇＝全库 37%
 * 落在读不出区别的颜色上。0.5.0 把配色图例做进面板后，这个缺陷会被直接摆到用户眼前。
 *
 * 修法两点：① 按笔记数降序发色相，大文件夹优先拿到不撞的；② **只发给真正要回退的文件夹**——
 * 已被 colorGroups 覆盖的不占槽位（Rick 的 9 个导入组占 9 个文件夹，剩 5 个正好各拿一个独立色相）。
 * 超过 9 个待发文件夹时仍会回收色相（色轮就这么大），但撞的是最小的那几个，不再是最大的。
 *
 * @param foldersByCount 顶层文件夹，**按笔记数降序**（见 noteFilter.folderStats）
 * @param covered 该文件夹是否已被 colorGroups 覆盖（覆盖的不占色相槽）
 */
export function assignFolderHues(foldersByCount: readonly string[], covered: (folder: string) => boolean): void {
	cache.clear();
	let i = 0;
	for (const f of foldersByCount) {
		if (f === '' || covered(f)) continue;
		const hue = HUES[i % HUES.length] ?? 0;
		cache.set(f, new Color().setHSL(hue / 360, 0.6, 0.6));
		i++;
	}
}

/** 判断顶层文件夹是否已被某个配色组吃掉（语义对齐 makeNodeColorFn 的匹配规则） */
export function folderCoveredByGroups(folder: string, groups: readonly ColorGroup[]): boolean {
	return groups.some((g) => {
		const q = g.query.startsWith('path:') ? g.query.slice(5).trim() : null;
		if (q === null) return folder.includes(g.query);
		// 组前缀匹配的是 node.id（完整路径）；文件夹被覆盖 ⟺ 该文件夹下的任意路径都以此前缀开头
		return `${folder}/`.startsWith(q) || folder === q.replace(/\/$/, '');
	});
}

export function folderColor(folderTop: string, unresolved: boolean): Color {
	if (unresolved) return UNRESOLVED;
	if (folderTop === '') return NEUTRAL;
	let c = cache.get(folderTop);
	if (!c) {
		// assignFolderHues 之后新出现的文件夹（重建之间新建的）：回落 hash，下次重建即归位
		const hue = HUES[hash32(folderTop) % HUES.length] ?? 0;
		c = new Color().setHSL(hue / 360, 0.6, 0.6);
		cache.set(folderTop, c);
	}
	return c;
}

/** 链接色：端点色 50/50 混合 → 去饱和 60% + 压亮度（NASA 细灰线，辉光由 bloom 给） */
export function linkColor(a: Color, b: Color): Color {
	const c = a.clone().lerp(b, 0.5);
	const hsl = { h: 0, s: 0, l: 0 };
	c.getHSL(hsl);
	c.setHSL(hsl.h, hsl.s * 0.4, Math.min(hsl.l, 0.35));
	return c;
}
