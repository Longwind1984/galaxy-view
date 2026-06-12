export interface BloomSettings {
	strength: number;
	radius: number;
	threshold: number;
}

export interface PhysicsSettings {
	repel: number; // 正值，布局内取负作 charge
	linkDistance: number;
	linkStrength: number; // 倍率：1 = d3 默认（1/min(端点度数)）
	centerPull: number;
}

export interface LookSettings {
	nodeSize: number; // 倍率
	linkOpacity: number;
}

export type VisualPreset = 'deep-space' | 'adaptive';

export interface GalaxySettings {
	bloom: BloomSettings;
	physics: PhysicsSettings;
	look: LookSettings;
	cruise: boolean;
	showUnresolved: boolean;
	preset: VisualPreset;
	/** 从 .obsidian/graph.json 一次性导入的 2D 配色（可在面板重新导入） */
	colorGroups: import('./settings/graphJsonImport').ColorGroup[];
	/** 沉降坐标缓存：暖启动用（id → [x,y,z]） */
	positionCache: Record<string, [number, number, number]>;
}

// G1 反馈后的温和默认值：阈值抬高让内部结构可见，辉光只属于亮核与亮星
export const DEFAULT_SETTINGS: GalaxySettings = {
	bloom: { strength: 0.6, radius: 0.4, threshold: 0.18 },
	physics: { repel: 180, linkDistance: 80, linkStrength: 1, centerPull: 0.04 },
	look: { nodeSize: 1, linkOpacity: 0.16 },
	cruise: true,
	showUnresolved: false,
	preset: 'deep-space',
	colorGroups: [],
	positionCache: {},
};

export function mergeSettings(saved: unknown): GalaxySettings {
	const d = DEFAULT_SETTINGS;
	const s = (saved ?? {}) as Partial<Record<keyof GalaxySettings, Record<string, unknown>>>;
	const sv = (saved ?? {}) as Partial<Record<keyof GalaxySettings, unknown>> & {
		cruise?: unknown;
		showUnresolved?: unknown;
		preset?: unknown;
		colorGroups?: unknown[];
		positionCache?: unknown;
	};
	const num = (v: unknown, fallback: number) => (typeof v === 'number' && isFinite(v) ? v : fallback);
	return {
		bloom: {
			strength: num(s.bloom?.['strength'], d.bloom.strength),
			radius: num(s.bloom?.['radius'], d.bloom.radius),
			threshold: num(s.bloom?.['threshold'], d.bloom.threshold),
		},
		physics: {
			repel: num(s.physics?.['repel'], d.physics.repel),
			linkDistance: num(s.physics?.['linkDistance'], d.physics.linkDistance),
			linkStrength: num(s.physics?.['linkStrength'], d.physics.linkStrength),
			centerPull: num(s.physics?.['centerPull'], d.physics.centerPull),
		},
		look: {
			nodeSize: num(s.look?.['nodeSize'], d.look.nodeSize),
			linkOpacity: num(s.look?.['linkOpacity'], d.look.linkOpacity),
		},
		cruise: typeof sv.cruise === 'boolean' ? sv.cruise : d.cruise,
		showUnresolved: typeof sv.showUnresolved === 'boolean' ? sv.showUnresolved : d.showUnresolved,
		preset: sv.preset === 'adaptive' ? 'adaptive' : 'deep-space',
		colorGroups: Array.isArray(sv.colorGroups)
			? sv.colorGroups.filter(
					(g): g is import('./settings/graphJsonImport').ColorGroup =>
						typeof (g as { query?: unknown })?.query === 'string' &&
						typeof (g as { color?: unknown })?.color === 'string',
				)
			: [],
		positionCache:
			sv.positionCache && typeof sv.positionCache === 'object'
				? (sv.positionCache as Record<string, [number, number, number]>)
				: {},
	};
}

/** 视图通过它拿设置与持久化（避免与 main.ts 循环依赖） */
export interface SettingsHost {
	settings: GalaxySettings;
	saveSettings(): Promise<void>;
}

export function toLayoutParams(p: PhysicsSettings): import('./types').LayoutParams {
	return {
		charge: -p.repel,
		linkDistance: p.linkDistance,
		linkStrength: p.linkStrength,
		centerPull: p.centerPull,
		velocityDecay: 0.6,
	};
}
