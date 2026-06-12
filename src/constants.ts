import type { LayoutParams } from './types';

export const VIEW_TYPE_GALAXY = 'galaxy-view';

// 2D graph.json 力参数的 3D 校准（映射表见 docs/design/00-实施计划.md；M2 接真实导入）
export const DEFAULT_LAYOUT_PARAMS: LayoutParams = {
	charge: -180,
	linkDistance: 80,
	centerPull: 0.04,
	velocityDecay: 0.6,
};

// 节点尺寸（世界单位）：2.2×(1+0.5√degree)，上限 6 倍——枢纽不能吞掉画面
export const NODE_BASE_RADIUS = 2.2;
export const NODE_MAX_RADIUS = NODE_BASE_RADIUS * 6;

// NASA 配方
export const BACKGROUND_COLOR = 0x000003;
export const BLOOM_DEFAULTS = { strength: 0.9, radius: 0.45, threshold: 0.1 };
export const LINK_OPACITY = 0.16;

// 镜头编排（数字来自视觉规格，实现者无需品味）
export const CRUISE = {
	angularSpeed: 0.022, // rad/s
	elevationDeg: 8,
	elevationPeriodS: 90,
	radiusBreath: 0.04,
	radiusPeriodS: 60,
	resumeDelayMs: 10_000,
	rampUpMs: 2_000,
};
export const FLY_TO = {
	distancePerRadius: 12,
	minDistance: 40,
	maxDistance: 140,
	azimuthOffsetRad: (15 * Math.PI) / 180,
	minMs: 800,
	maxMs: 1800,
	msPerWorldUnit: 0.45,
};

export const STARFIELD_ROTATION_RAD_PER_S = 0.0008;
