import type { BloomSettings, LookSettings, PhysicsSettings } from '../settings';

/**
 * 风格预设 = 一整套外观：辉光 + 力学 + 外观 + 星空背景开关 + 配色主题 + 取景仰角。
 * v0.3 面板重做：合并为一条扁平列表（靠名字/图标区分），每个预设在「有无星空 / 配色 /
 * 大小 / 力学 / 辉光」五个维度同时拉开差异。名称/副标题走 i18n（preset.sub.<id>），
 * 图标由 src/overlay/presetIcons.ts 按 id 现画。数值是起点值，最终以真机眼调为准。
 */
export interface StylePreset {
	id: string;
	name: string; // 中文名（英文名走 nameEn；面板按语言取）
	nameEn?: string;
	/** 星空背景开关 */
	starfield: boolean;
	/** 配色主题 id（见 colorThemes.ts）——预设会一并套用 */
	theme: string;
	/** 相机取景仰角（度）：盘类俯视看臂 ~50°，球/团类保持 18° */
	frameElevDeg?: number;
	bloom: BloomSettings;
	physics: PhysicsSettings;
	look: LookSettings;
}

export const STYLE_PRESETS: StylePreset[] = [
	{
		id: 'galaxy', name: '银河', nameEn: 'Galaxy', starfield: true, theme: 'hubble', frameElevDeg: 50,
		bloom: { strength: 0.35, radius: 0.35, threshold: 0.22 },
		physics: { repel: 170, linkDistance: 55, linkStrength: 1.1, centerPull: 0.05, flatten: 0.55, coreGravity: 0.1, spiral: 0.02 },
		look: { nodeSize: 1, linkOpacity: 0.14, twinkle: 0.5, sizeBy: 'degree' },
	},
	{
		id: 'spiral', name: '旋臂', nameEn: 'Spiral', starfield: true, theme: 'aurora', frameElevDeg: 52,
		bloom: { strength: 0.5, radius: 0.45, threshold: 0.2 },
		physics: { repel: 170, linkDistance: 48, linkStrength: 1.15, centerPull: 0.05, flatten: 0.62, coreGravity: 0.14, spiral: 0.07 },
		look: { nodeSize: 1, linkOpacity: 0.16, twinkle: 0.6, sizeBy: 'degree' },
	},
	{
		id: 'orbits', name: '轨道', nameEn: 'Orbits', starfield: true, theme: 'sunset', frameElevDeg: 35,
		bloom: { strength: 0.42, radius: 0.35, threshold: 0.24 },
		physics: { repel: 200, linkDistance: 95, linkStrength: 0.9, centerPull: 0.09, flatten: 0.5, coreGravity: 0.2, spiral: 0 },
		look: { nodeSize: 1.15, linkOpacity: 0.11, twinkle: 0.4, sizeBy: 'degree' },
	},
	{
		id: 'deepfield', name: '深空场', nameEn: 'Deep Field', starfield: true, theme: 'hubble', frameElevDeg: 18,
		bloom: { strength: 0.28, radius: 0.4, threshold: 0.3 },
		physics: { repel: 300, linkDistance: 110, linkStrength: 1.5, centerPull: 0.02, flatten: 0, coreGravity: 0, spiral: 0 },
		look: { nodeSize: 0.8, linkOpacity: 0.08, twinkle: 0.3, sizeBy: 'degree' },
	},
	{
		id: 'nebula', name: '星云', nameEn: 'Nebula', starfield: false, theme: 'tiktok', frameElevDeg: 18,
		bloom: { strength: 0.6, radius: 0.32, threshold: 0.2 },
		physics: { repel: 150, linkDistance: 70, linkStrength: 0.9, centerPull: 0.03, flatten: 0.15, coreGravity: 0.03, spiral: 0 },
		look: { nodeSize: 1.05, linkOpacity: 0.2, twinkle: 0.5, sizeBy: 'degree' },
	},
	{
		id: 'minimal', name: '极简', nameEn: 'Minimal', starfield: false, theme: 'matrix', frameElevDeg: 18,
		bloom: { strength: 0, radius: 0.3, threshold: 0.3 },
		physics: { repel: 230, linkDistance: 80, linkStrength: 1, centerPull: 0.04, flatten: 0, coreGravity: 0, spiral: 0 },
		look: { nodeSize: 0.8, linkOpacity: 0.07, twinkle: 0, sizeBy: 'degree' },
	},
	{
		id: 'fireworks', name: '烟火', nameEn: 'Fireworks', starfield: false, theme: 'cyber', frameElevDeg: 18,
		bloom: { strength: 1, radius: 0.38, threshold: 0.16 },
		physics: { repel: 150, linkDistance: 58, linkStrength: 1.3, centerPull: 0.05, flatten: 0, coreGravity: 0, spiral: 0 },
		look: { nodeSize: 1.2, linkOpacity: 0.28, twinkle: 1.3, sizeBy: 'degree' },
	},
	{
		id: 'supernova', name: '超新星', nameEn: 'Supernova', starfield: false, theme: 'sunset', frameElevDeg: 22,
		bloom: { strength: 0.9, radius: 0.4, threshold: 0.18 },
		physics: { repel: 260, linkDistance: 62, linkStrength: 1.1, centerPull: 0.03, flatten: 0, coreGravity: -0.08, spiral: 0 },
		look: { nodeSize: 1.3, linkOpacity: 0.24, twinkle: 1.5, sizeBy: 'degree' },
	},
];
