/**
 * 质量档位（M4）：三档静态预设。
 * Platform.isMobile 是硬上限（移动永不自动升档）；手动覆盖绝对优先；
 * auto = high 起步 + FPS 看门狗单向降档（沉降后采样，会话内不回升）。
 */
export type TierId = 'high' | 'low' | 'mobile';

export interface QualityTier {
	id: TierId;
	pixelRatioCap: number;
	bloomAllowed: boolean; // mobile 关 bloom：shader 热核保住 80% 观感，省掉全部后期开销
	starScale: number; // 星空点数缩放（天幕星点与空间浮星共用）
	linkSegments: number; // 曲线连线每边折线段数（曲率>0 时生效；0 曲率恒为 1 段）
	clusterCloudsAllowed: boolean; // 集群云雾（加色大精灵有填充率风险，mobile 关）
	nodeCap: number | null; // 按度数排序取 top N（实测 top1500 保 94% 链接质量）
	linkCap: number | null; // 按 min(端点度数) 取 top N
	hubLabels: number;
	neighborLabels: number;
	hoverThrottleMs: number | null; // null = 仅 tap（触屏无 hover）
}

/** 同一档位下 WebGL 主渲染与后处理链共用的有效设备像素比。 */
export function effectivePixelRatio(devicePixelRatio: number, cap: number): number {
	return Math.min(devicePixelRatio, cap);
}

export const TIERS: Record<TierId, QualityTier> = {
	high: {
		id: 'high',
		pixelRatioCap: 2,
		bloomAllowed: true,
		starScale: 1,
		linkSegments: 8,
		clusterCloudsAllowed: true,
		nodeCap: null,
		linkCap: null,
		hubLabels: 14,
		neighborLabels: 20,
		hoverThrottleMs: 30,
	},
	low: {
		id: 'low',
		pixelRatioCap: 1,
		bloomAllowed: true,
		starScale: 0.4,
		linkSegments: 6,
		clusterCloudsAllowed: true,
		nodeCap: null,
		linkCap: null,
		hubLabels: 8,
		neighborLabels: 12,
		hoverThrottleMs: 80,
	},
	mobile: {
		id: 'mobile',
		pixelRatioCap: 1.5,
		bloomAllowed: false,
		starScale: 0.32,
		linkSegments: 4,
		clusterCloudsAllowed: false,
		nodeCap: 1500,
		linkCap: 12_000,
		hubLabels: 6,
		neighborLabels: 8,
		hoverThrottleMs: null,
	},
};
