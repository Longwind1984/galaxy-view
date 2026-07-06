export const VIEW_TYPE_GALAXY = 'galaxy-view';
// 力学/辉光/外观的默认值与持久化见 src/settings.ts

// 节点尺寸（世界单位）：2.2×(1+0.5√degree)，上限 6 倍——枢纽不能吞掉画面
export const NODE_BASE_RADIUS = 2.2;
export const NODE_MAX_RADIUS = NODE_BASE_RADIUS * 6;

// NASA 配方（bloom 初值会立刻被 settings 覆盖，见 GraphController.applySettings）
export const BACKGROUND_COLOR = 0x000003;
export const BLOOM_DEFAULTS = { strength: 0.6, radius: 0.4, threshold: 0.18 };
export const LINK_OPACITY = 0.16;

// 镜头编排（数字来自视觉规格，实现者无需品味）
export const CRUISE = {
	angularSpeed: 0.022, // rad/s
	elevationDeg: 8,
	elevationPeriodS: 90,
	radiusBreath: 0.04,
	radiusPeriodS: 60,
	resumeDelayMs: 6_000, // 真正拖动/缩放后静置多久恢复环绕（原 10s 偏久；配合「仅拖动才打断」体验更连贯）
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
