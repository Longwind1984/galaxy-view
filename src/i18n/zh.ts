import type { Translations } from './en';

/** 简体中文 — 插件原始语言。结构须与 en.ts 完全一致（由 Translations 类型强制）。 */
export const zh: Translations = {
	cmd: {
		open: '打开星系视图',
		search: '搜索星系节点并飞行',
	},

	notice: {
		workerUnavailable: '星系视图：后台线程不可用，已回退主线程布局',
		mobileCap: (cap, total) => `移动档：已显示链接最多的前 ${cap} 个节点（共 ${total}）`,
		autoPerf: '星系视图：已自动切换到性能模式（可在面板「高级」改回）',
		notSettled: '星系还在成形中，沉降后再试',
		importFirst: '先导入二维图谱配色，才能洗牌',
		noColorGroups: '未找到自带图谱的颜色分组（graph.json）',
		importedColors: (n) => `已导入 ${n} 组 2D 图谱配色`,
	},

	mask: {
		building: '构建星图…',
		contextLost: '渲染上下文丢失，点击重建',
	},

	hud: {
		settled: '已沉降',
		settling: '布局中',
	},

	panel: {
		search: '搜索',
		recenter: '回中心',
		cruiseOn: '巡航：开',
		cruiseOff: '巡航：关',
		reveal: '创世动画',
		secBloom: '辉光',
		secPhysics: '力学',
		secLook: '外观与配色',
		secCruise: '巡航',
		secAdvanced: '高级',
		strength: '强度',
		spread: '扩散',
		threshold: '阈值',
		repel: '斥力',
		linkDistance: '链接距离',
		linkStrength: '链接强度',
		centerPull: '向心力',
		flatten: '扁平度',
		nodeSize: '节点大小',
		linkOpacity: '链接透明度',
		twinkle: '星星眨眼',
		twinkleOff: '关',
		themePlaceholder: '配色主题…',
		importColors: '导入二维配色',
		shuffleColors: '配色洗牌',
		speed: '速度',
		reset: '重置默认',
		unresolvedShow: '未解析：显示',
		unresolvedHide: '未解析：隐藏',
		orphansShow: '孤儿：显示',
		orphansHide: '孤儿：隐藏',
		sizeByDegree: '大小：链接数',
		sizeByFileSize: '大小：文档量',
		sizeByUniform: '大小：一致',
		presetDeepSpace: '视觉：深空',
		presetAdaptive: '视觉：随主题',
		qualityAuto: '画质：自动',
		qualityHigh: '画质：高',
		qualityLow: '画质：低',
		qualityMobile: '画质：移动模拟',
		help: [
			'左键拖 = 环绕 · 滚轮 = 缩放',
			'右键拖 / ⌘或⇧+左键拖 = 平移',
			'（macOS 的 Ctrl+点击被系统当右键）',
			'WASD = 平飞 · Q/E = 升降 · Shift = 加速',
			'点击节点 = 选中飞行并环绕 · ESC = 取消',
			'F = 飞向选中 · R = 回总览',
			'双击滑杆 = 回默认值',
		],
		sliderDefault: (v) => `默认 ${v}`,
	},

	card: {
		unresolvedLink: '未解析链接（笔记尚不存在）',
		rootFolder: '根目录',
		emptyNote: '（空笔记）',
		openNote: '打开笔记',
		focus: '聚焦',
		degrees: (inDeg, outDeg) => `↩ ${inDeg} 反链 · → ${outDeg} 出链`,
		modified: (date) => ` · 改于 ${date}`,
	},

	search: {
		placeholder: '搜索笔记，回车飞过去…',
		unresolved: '未解析',
		links: (n) => `${n} 链接`,
	},

	presets: {
		galaxy: '银河',
		nebula: '星云',
		minimal: '极简',
		fireworks: '烟火',
	},

	themes: {
		hubble: '哈勃深空',
		tiktok: '抖音霓虹',
		sunset: '落日胶片',
		cyber: '赛博都市',
		matrix: '黑客帝国',
		aurora: '极光',
	},

	dateLocale: 'zh-CN',
};
