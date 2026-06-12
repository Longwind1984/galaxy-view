import { Color } from 'three';
import { hash32 } from '../data/seed';

// Obsidian 标准色族 hsl(h, 60%, 60%) 的色相轮（与 Rick 的 9 组配色同族）；
// M2 接 graph.json 真实 colorGroups，本表是无配置时的回退
const HUES = [0, 40, 80, 120, 160, 200, 240, 280, 320];

const NEUTRAL = new Color('#9aa4b2'); // 未分组
const UNRESOLVED = new Color('#7a8499'); // 幽灵

const cache = new Map<string, Color>();

export function folderColor(folderTop: string, unresolved: boolean): Color {
	if (unresolved) return UNRESOLVED;
	if (folderTop === '') return NEUTRAL;
	let c = cache.get(folderTop);
	if (!c) {
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
