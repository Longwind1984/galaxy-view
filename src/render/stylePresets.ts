import type { BloomSettings, LookSettings, PhysicsSettings, SpaceSettings } from '../settings';

/**
 * 风格预设 = 一整套外观：辉光 + 力学 + 外观 + 星空背景开关 + 深空背景形态层 + 配色主题 + 取景仰角。
 * v0.3 面板重做：合并为一条扁平列表（靠名字/图标区分），每个预设在「有无星空 / 配色 /
 * 大小 / 力学 / 辉光」五个维度同时拉开差异。名称/副标题走 i18n（preset.sub.<id>），
 * 图标由 src/overlay/presetIcons.ts 按 id 现画。数值是起点值，最终以真机眼调为准。
 *
 * v0.4 新增两个维度（曲线弯曲 look.linkCurve + 背景形态层 space），配值大原则（Rick 拍板）：
 * 贴合各预设自身气质、预设之间拉开区分度——银河克制正统 / 旋臂流动 / 轨道大弧净空 /
 * 深空场直线+浮星海（哈勃深场的满视野远景小点）/ 星云满云雾 / 极简全关 /
 * 烟火纯黑底爆发 / 超新星暖尘余晖。
 */
export interface StylePreset {
	id: string;
	name: string; // 中文名（英文名走 nameEn；面板按语言取）
	nameEn?: string;
	/** 星点天幕开关（球壳背景星） */
	starfield: boolean;
	/** 深空背景形态层（星云天幕/空间浮星/集群云雾，0=关） */
	space: SpaceSettings;
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
		space: { nebula: 0.35, fieldStars: 0.25, clusterClouds: 0.3 },
		bloom: { strength: 0.35, radius: 0.35, threshold: 0.22 },
		physics: { repel: 170, linkDistance: 55, linkStrength: 1.1, centerPull: 0.05, flatten: 0.55, coreGravity: 0.1, spiral: 0.02 },
		look: { nodeSize: 1, linkOpacity: 0.14, linkCurve: 0.35, twinkle: 0.5, sizeBy: 'degree' },
	},
	{
		// 与「银河」拉开区分度（Rick 反馈）：极扁盘 + 拉满旋臂力 + 强聚核 + 强弯流动连线 + 更俯视看臂
		id: 'spiral', name: '旋臂', nameEn: 'Spiral', starfield: true, theme: 'aurora', frameElevDeg: 62,
		space: { nebula: 0.4, fieldStars: 0.35, clusterClouds: 0.35 },
		bloom: { strength: 0.5, radius: 0.45, threshold: 0.2 },
		physics: { repel: 150, linkDistance: 62, linkStrength: 1.15, centerPull: 0.06, flatten: 0.75, coreGravity: 0.22, spiral: 0.095 },
		look: { nodeSize: 1, linkOpacity: 0.16, linkCurve: 0.72, twinkle: 0.6, sizeBy: 'degree' },
	},
	{
		id: 'orbits', name: '轨道', nameEn: 'Orbits', starfield: true, theme: 'sunset', frameElevDeg: 35,
		space: { nebula: 0.12, fieldStars: 0.1, clusterClouds: 0 },
		bloom: { strength: 0.42, radius: 0.35, threshold: 0.24 },
		physics: { repel: 200, linkDistance: 95, linkStrength: 0.9, centerPull: 0.09, flatten: 0.5, coreGravity: 0.2, spiral: 0 },
		look: { nodeSize: 1.15, linkOpacity: 0.11, linkCurve: 0.75, twinkle: 0.4, sizeBy: 'degree' },
	},
	{
		id: 'deepfield', name: '深空场', nameEn: 'Deep Field', starfield: true, theme: 'hubble', frameElevDeg: 18,
		space: { nebula: 0.55, fieldStars: 0.65, clusterClouds: 0.25 },
		bloom: { strength: 0.28, radius: 0.4, threshold: 0.3 },
		physics: { repel: 300, linkDistance: 110, linkStrength: 1.5, centerPull: 0.02, flatten: 0, coreGravity: 0, spiral: 0 },
		look: { nodeSize: 0.8, linkOpacity: 0.08, linkCurve: 0, twinkle: 0.3, sizeBy: 'degree' },
	},
	{
		id: 'nebula', name: '星云', nameEn: 'Nebula', starfield: false, theme: 'tiktok', frameElevDeg: 18,
		space: { nebula: 0.8, fieldStars: 0.45, clusterClouds: 0.7 },
		bloom: { strength: 0.6, radius: 0.32, threshold: 0.2 },
		physics: { repel: 150, linkDistance: 70, linkStrength: 0.9, centerPull: 0.03, flatten: 0.15, coreGravity: 0.03, spiral: 0 },
		look: { nodeSize: 1.05, linkOpacity: 0.2, linkCurve: 0.45, twinkle: 0.5, sizeBy: 'degree' },
	},
	{
		id: 'minimal', name: '极简', nameEn: 'Minimal', starfield: false, theme: 'matrix', frameElevDeg: 18,
		space: { nebula: 0, fieldStars: 0, clusterClouds: 0 },
		bloom: { strength: 0, radius: 0.3, threshold: 0.3 },
		physics: { repel: 230, linkDistance: 80, linkStrength: 1, centerPull: 0.04, flatten: 0, coreGravity: 0, spiral: 0 },
		look: { nodeSize: 0.8, linkOpacity: 0.07, linkCurve: 0, twinkle: 0, sizeBy: 'degree' },
	},
	{
		id: 'fireworks', name: '烟火', nameEn: 'Fireworks', starfield: false, theme: 'cyber', frameElevDeg: 18,
		space: { nebula: 0, fieldStars: 0, clusterClouds: 0 },
		bloom: { strength: 1, radius: 0.38, threshold: 0.16 },
		physics: { repel: 150, linkDistance: 58, linkStrength: 1.3, centerPull: 0.05, flatten: 0, coreGravity: 0, spiral: 0 },
		look: { nodeSize: 1.2, linkOpacity: 0.28, linkCurve: 0.2, twinkle: 1.3, sizeBy: 'degree' },
	},
	{
		id: 'supernova', name: '超新星', nameEn: 'Supernova', starfield: false, theme: 'sunset', frameElevDeg: 22,
		space: { nebula: 0.45, fieldStars: 0.2, clusterClouds: 0.4 },
		bloom: { strength: 0.9, radius: 0.4, threshold: 0.18 },
		physics: { repel: 260, linkDistance: 62, linkStrength: 1.1, centerPull: 0.03, flatten: 0, coreGravity: -0.08, spiral: 0 },
		look: { nodeSize: 1.3, linkOpacity: 0.24, linkCurve: 0.3, twinkle: 1.5, sizeBy: 'degree' },
	},
];
