import type { BloomSettings, LookSettings, PhysicsSettings } from '../settings';

/**
 * 风格预设 = 辉光 + 力学 + 外观 的成套参数（G2 反馈：给经典组合，新用户第一印象优先）。
 * 「银河」即出厂默认：扁平星盘靠 flatten（Y 轴额外向心力）实现——自然引斥力做不出盘。
 */
export interface StylePreset {
	id: string;
	/** English fallback label; the panel prefers the localized name from i18n (t.presets[id]). */
	name: string;
	bloom: BloomSettings;
	physics: PhysicsSettings;
	look: LookSettings;
}

export const STYLE_PRESETS: StylePreset[] = [
	{
		id: 'galaxy',
		name: 'Galaxy',
		bloom: { strength: 0.35, radius: 0.35, threshold: 0.22 },
		physics: { repel: 200, linkDistance: 70, linkStrength: 1, centerPull: 0.04, flatten: 0.3 },
		look: { nodeSize: 1, linkOpacity: 0.14, twinkle: 0.5, sizeBy: 'degree' },
	},
	{
		id: 'nebula',
		name: 'Nebula',
		bloom: { strength: 0.6, radius: 0.4, threshold: 0.18 },
		physics: { repel: 180, linkDistance: 80, linkStrength: 1, centerPull: 0.04, flatten: 0 },
		look: { nodeSize: 1, linkOpacity: 0.16, twinkle: 0.5, sizeBy: 'degree' },
	},
	{
		id: 'minimal',
		name: 'Minimal',
		bloom: { strength: 0, radius: 0.3, threshold: 0.3 },
		physics: { repel: 220, linkDistance: 80, linkStrength: 1, centerPull: 0.04, flatten: 0 },
		look: { nodeSize: 0.85, linkOpacity: 0.08, twinkle: 0.2, sizeBy: 'degree' },
	},
	{
		id: 'fireworks',
		name: 'Fireworks',
		bloom: { strength: 1.2, radius: 0.6, threshold: 0.1 },
		physics: { repel: 160, linkDistance: 60, linkStrength: 1.2, centerPull: 0.05, flatten: 0 },
		look: { nodeSize: 1.15, linkOpacity: 0.25, twinkle: 1.2, sizeBy: 'degree' },
	},
];
