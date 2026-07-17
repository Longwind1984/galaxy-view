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
	flatten: number; // 0=球体，>0=Y 轴压扁 → 银河盘
	coreGravity: number; // 径向核心引力：致密亮核（度数加权）；可为负=向外爆发（超新星）
	spiral: number; // 切向旋臂力：0=无臂
}

export type SizeBy = 'degree' | 'fileSize' | 'uniform';

export interface LookSettings {
	nodeSize: number; // 倍率
	linkOpacity: number;
	linkCurve: number; // 连线弯曲 0–1（0=直线，几何退化为单段，与旧行为等价）
	twinkle: number; // 亮星眨眼频率（0=关）
	sizeBy: SizeBy; // 节点「质量」依据
}

/** 深空背景形态层（v0.4）：三层各自独立开关（0=关），预设给组合，用户可逐层自定义 */
export interface SpaceSettings {
	nebula: number; // 星云天幕强度 0–1（一次性烘焙纹理，强度只调透明度）
	fieldStars: number; // 空间浮星密度 0–1（体积内散布，近大远小视差）
	clusterClouds: number; // 集群云雾强度 0–1（稠密星团上的彩色云团）
}

export type VisualPreset = 'deep-space' | 'adaptive';

export interface TourSettings {
	speed: number; // 漫游/连接两篇的飞行速度倍率
}

export interface GalaxySettings {
	bloom: BloomSettings;
	physics: PhysicsSettings;
	look: LookSettings;
	space: SpaceSettings;
	cruise: boolean;
	cruiseSpeed: number; // 巡航角速度倍率
	showUnresolved: boolean;
	showOrphans: boolean;
	/** 标签作为节点：共享 tag 的笔记通过标签星成簇 */
	showTags: boolean;
	/** 过滤·主：被点灭的顶层文件夹（面板图例）；空数组=全显示 */
	hiddenFolders: string[];
	/** 过滤·逃生口：文本查询，只给图例表达不了的横切模式（散落各处的 Index 等）。语法见 data/noteFilter.ts */
	filterQuery: string;
	/** 幽灵边：Constellation 伴侣插件的待确认链接建议（虚线；接受后自动变实线） */
	showGhostEdges: boolean;
	/** 深空星空背景开关（用户选项） */
	showStarfield: boolean;
	/** 随镜头缩放逐步显示节点名称，优先显示链接数最多的节点 */
	adaptiveLabels: boolean;
	colorTheme: string;
	qualityOverride: 'auto' | 'high' | 'low' | 'mobile'; // mobile 档在桌面=移动模拟 // 最近应用的配色主题 id；'imported'=二维导入，'custom'=洗牌后
	preset: VisualPreset;
	/** 当前激活的风格预设 id（面板「由 X 设定 / 已自定义」标记用） */
	activePreset: string;
	/** 用户保存的自定义预设（可排序/删除） */
	customPresets: import('./render/stylePresets').StylePreset[];
	/** 界面语言：auto=跟随 Obsidian（见 src/i18n）；en/zh/de/it/es/pt */
	language: import('./i18n').LangPref;
	/** 面板各折叠分区的展开状态（稳定 sectionId → 是否展开） */
	panelSections: Record<string, boolean>;
	/** 浮动面板宽度（px，可拖右边缘调整） */
	panelWidth: number;
	/** 首屏提示是否已看过（看过后不再默认弹出） */
	hintsSeen: boolean;
	/** 选中时高亮的关联深度：1=一度邻居，2=含二度（分级调暗） */
	selectionDepth: 1 | 2;
	/** 巡游/自动驾驶（v0.3） */
	tour: TourSettings;
	/** 从 .obsidian/graph.json 一次性导入的 2D 配色（可在面板重新导入） */
	colorGroups: import('./settings/graphJsonImport').ColorGroup[];
	/** 沉降坐标缓存：暖启动用（id → [x,y,z]） */
	positionCache: Record<string, [number, number, number]>;
}

// 默认 = 重做后的「银河」风格预设：致密亮核 + 扁平星盘 + 隐约旋臂（v0.2 银河布局重做）
export const DEFAULT_SETTINGS: GalaxySettings = {
	bloom: { strength: 0.35, radius: 0.35, threshold: 0.22 },
	physics: { repel: 170, linkDistance: 55, linkStrength: 1.1, centerPull: 0.05, flatten: 0.55, coreGravity: 0.1, spiral: 0.02 },
	look: { nodeSize: 1, linkOpacity: 0.14, linkCurve: 0.35, twinkle: 0.5, sizeBy: 'degree' },
	space: { nebula: 0.35, fieldStars: 0.25, clusterClouds: 0.3 },
	cruise: true,
	cruiseSpeed: 1,
	showUnresolved: false,
	showOrphans: true,
	showTags: false,
	hiddenFolders: [],
	filterQuery: '',
	// 默认关：ghost 幽灵边依赖 Constellation 伴侣插件（尚未正式发布），随 0.4.0 发布但先不打扰普通用户
	showGhostEdges: false,
	showStarfield: true,
	adaptiveLabels: false,
	colorTheme: 'imported',
	qualityOverride: 'auto',
	preset: 'deep-space',
	activePreset: 'galaxy',
	customPresets: [],
	language: 'auto',
	panelSections: {},
	panelWidth: 300,
	hintsSeen: false,
	selectionDepth: 1,
	tour: { speed: 1 },
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
			flatten: num(s.physics?.['flatten'], d.physics.flatten),
			coreGravity: num(s.physics?.['coreGravity'], d.physics.coreGravity),
			spiral: num(s.physics?.['spiral'], d.physics.spiral),
		},
		look: {
			nodeSize: num(s.look?.['nodeSize'], d.look.nodeSize),
			linkOpacity: num(s.look?.['linkOpacity'], d.look.linkOpacity),
			linkCurve: num(s.look?.['linkCurve'], d.look.linkCurve),
			twinkle: num(s.look?.['twinkle'], d.look.twinkle),
			sizeBy: (['degree', 'fileSize', 'uniform'] as const).includes(s.look?.['sizeBy'] as SizeBy)
				? (s.look?.['sizeBy'] as SizeBy)
				: d.look.sizeBy,
		},
		space: {
			nebula: num(s.space?.['nebula'], d.space.nebula),
			fieldStars: num(s.space?.['fieldStars'], d.space.fieldStars),
			clusterClouds: num(s.space?.['clusterClouds'], d.space.clusterClouds),
		},
		cruise: typeof sv.cruise === 'boolean' ? sv.cruise : d.cruise,
		cruiseSpeed: num((sv as Record<string, unknown>)['cruiseSpeed'], d.cruiseSpeed),
		showUnresolved: typeof sv.showUnresolved === 'boolean' ? sv.showUnresolved : d.showUnresolved,
		showOrphans:
			typeof (sv as Record<string, unknown>)['showOrphans'] === 'boolean'
				? ((sv as Record<string, unknown>)['showOrphans'] as boolean)
				: d.showOrphans,
		showTags:
			typeof (sv as Record<string, unknown>)['showTags'] === 'boolean'
				? ((sv as Record<string, unknown>)['showTags'] as boolean)
				: d.showTags,
		hiddenFolders: Array.isArray((sv as Record<string, unknown>)['hiddenFolders'])
			? ((sv as Record<string, unknown>)['hiddenFolders'] as unknown[]).filter((x): x is string => typeof x === 'string')
			: d.hiddenFolders,
		filterQuery:
			typeof (sv as Record<string, unknown>)['filterQuery'] === 'string'
				? ((sv as Record<string, unknown>)['filterQuery'] as string)
				: d.filterQuery,
		showGhostEdges:
			typeof (sv as Record<string, unknown>)['showGhostEdges'] === 'boolean'
				? ((sv as Record<string, unknown>)['showGhostEdges'] as boolean)
				: d.showGhostEdges,
		showStarfield: typeof sv.showStarfield === 'boolean' ? sv.showStarfield : d.showStarfield,
		adaptiveLabels:
			typeof (sv as Record<string, unknown>)['adaptiveLabels'] === 'boolean'
				? ((sv as Record<string, unknown>)['adaptiveLabels'] as boolean)
				: d.adaptiveLabels,
		colorTheme:
			typeof (sv as Record<string, unknown>)['colorTheme'] === 'string'
				? ((sv as Record<string, unknown>)['colorTheme'] as string)
				: d.colorTheme,
		qualityOverride: (['auto', 'high', 'low', 'mobile'] as const).includes(
			(sv as Record<string, unknown>)['qualityOverride'] as 'auto',
		)
			? ((sv as Record<string, unknown>)['qualityOverride'] as 'auto' | 'high' | 'low' | 'mobile')
			: d.qualityOverride,
		preset: sv.preset === 'adaptive' ? 'adaptive' : 'deep-space',
		activePreset: typeof sv.activePreset === 'string' ? sv.activePreset : d.activePreset,
		customPresets: Array.isArray(sv.customPresets)
			? (sv.customPresets as unknown[])
					.filter(
						(p): p is import('./render/stylePresets').StylePreset =>
							!!p && typeof (p as { id?: unknown }).id === 'string' && typeof (p as { physics?: unknown }).physics === 'object' && typeof (p as { bloom?: unknown }).bloom === 'object' && typeof (p as { look?: unknown }).look === 'object',
					)
					// v0.4 前存的预设没有 linkCurve/space：按 0 补齐 = 保持存档当时的直线/无背景观感
					.map((p) => ({
						...p,
						look: { ...p.look, linkCurve: num((p.look as { linkCurve?: unknown }).linkCurve, 0) },
						space: {
							nebula: num((p.space as { nebula?: unknown } | undefined)?.nebula, 0),
							fieldStars: num((p.space as { fieldStars?: unknown } | undefined)?.fieldStars, 0),
							clusterClouds: num((p.space as { clusterClouds?: unknown } | undefined)?.clusterClouds, 0),
						},
					}))
			: [],
		language: (['auto', 'en', 'zh', 'de', 'it', 'es', 'pt'] as const).includes(sv.language as 'auto')
			? (sv.language as import('./i18n').LangPref)
			: d.language,
		panelSections:
			sv.panelSections && typeof sv.panelSections === 'object' && !Array.isArray(sv.panelSections)
				? (Object.fromEntries(
						Object.entries(sv.panelSections as Record<string, unknown>).filter(([, v]) => typeof v === 'boolean'),
					) as Record<string, boolean>)
				: {},
		panelWidth: Math.min(Math.max(num(sv.panelWidth, d.panelWidth), 240), 480),
		hintsSeen: typeof sv.hintsSeen === 'boolean' ? sv.hintsSeen : d.hintsSeen,
		selectionDepth: sv.selectionDepth === 2 ? 2 : 1,
		tour: {
			speed: num((sv.tour as Record<string, unknown> | undefined)?.['speed'], d.tour.speed),
		},
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
		flatten: p.flatten,
		coreGravity: p.coreGravity,
		spiral: p.spiral,
		velocityDecay: 0.6,
	};
}
