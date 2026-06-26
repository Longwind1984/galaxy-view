import { moment } from 'obsidian';

const locale = moment.locale();

const TRANSLATIONS: Record<'zh' | 'en', Record<string, string>> = {
	zh: {
		// Ribbon / Commands
		open_view: '打开星系视图',
		search_nodes_fly: '搜索星系节点并飞行',
		bench_suite: '基准：环绕、冷布局、含未解析',
		bench_leak: '基准：泄漏检测（反复开关视图）',
		open_failed: '星系视图打开失败',
		init_timeout: '星系视图初始化超时',
		bench_completed: '基准完成，结果在 _galaxy_bench/ 目录',
		bench_waiting_reclamation: '基准：等待内存回收…',
		webgl_warning_note: 'WebGL context 告警需看开发者控制台；真泄漏判据=连续两轮 before 持续抬升',
		s4_completed: 'S4 完成：堆增量 {delta} MB（通过线 <20MB）',

		// Themes
		theme_custom: '配色主题…',
		theme_hubble: '哈勃深空',
		theme_tiktok: '抖音霓虹',
		theme_sunset: '落日胶片',
		theme_cyber: '赛博都市',
		theme_matrix: '黑客帝国',
		theme_aurora: '极光',

		// Presets
		preset_galaxy: '银河',
		preset_nebula: '星云',
		preset_minimal: '极简',
		preset_fireworks: '烟火',

		// Search Modal
		search_placeholder: '搜索笔记，回车飞过去…',
		unresolved: '未解析',
		links_count: '链接',

		// Graph Controller HUD
		context_lost: '渲染上下文丢失，点击重建',
		building_graph: '构建星图…',
		worker_unavailable: '星系视图：后台线程不可用，已回退主线程布局',
		mobile_tier_nodes: '移动档：已显示链接最多的前 {cap} 个节点（共 {total}）',
		auto_performance_mode: '星系视图：已自动切换到性能模式（可在面板「高级」改回）',
		forming_wait: '星系还在成形中，沉降后再试',
		import_colors_first: '先导入二维图谱配色，才能洗牌',
		no_graph_json_groups: '未找到自带图谱的颜色分组（graph.json）',
		imported_colors_count: '已导入 {count} 组 2D 图谱配色',
		settled: '已沉降',
		layouting: '布局中',
		waiting_settle: '{scenario}：等待布局沉降…',
		orbit_fps_test: '{scenario}：20s 环绕测帧率…',
		scenario_completed: '{scenario} 完成：avg {fps} fps · {drawCalls} calls',
		s2_started: 'S2：冷布局开始（预算化 tick，期间界面应保持可用）…',
		s2_completed: 'S2 完成：沉降 {sec}s / {ticks} ticks，最长阻塞 {longest}ms',

		// Sliders
		default_value: '默认 {val}',

		// Overlay Manager
		unresolved_link_exists: '未解析链接（笔记尚不存在）',
		root_directory: '根目录',
		link_metrics: '↩ {inDegree} 反链 · → {outDegree} 出链',
		modified_date: ' · 改于 {date}',
		empty_note: '（空笔记）',
		open_note: '打开笔记',
		focus: '聚焦',

		// Control Panel Panel Strings
		panel_search: '搜索',
		panel_recenter: '回中心',
		panel_cruise_on: '巡航：开',
		panel_cruise_off: '巡航：关',
		panel_reveal: '创世动画',
		panel_sec_bloom: '辉光',
		panel_bloom_strength: '强度',
		panel_bloom_radius: '扩散',
		panel_bloom_threshold: '阈值',
		panel_sec_physics: '力学',
		panel_physics_repel: '斥力',
		panel_physics_distance: '链接距离',
		panel_physics_strength: '链接强度',
		panel_physics_pull: '向心力',
		panel_physics_flatten: '扁平度',
		panel_sec_appearance: '外观与配色',
		panel_appearance_size: '节点大小',
		panel_appearance_opacity: '链接透明度',
		panel_appearance_twinkle: '星星眨眼',
		panel_appearance_off: '关',
		panel_import_colors: '导入二维配色',
		panel_shuffle_colors: '配色洗牌',
		panel_sec_cruise: '巡航',
		panel_cruise_speed: '速度',
		panel_sec_advanced: '高级',
		panel_unresolved_show: '未解析：显示',
		panel_unresolved_hide: '未解析：隐藏',
		panel_orphans_show: '孤儿：显示',
		panel_orphans_hide: '孤儿：隐藏',
		panel_reset_default: '重置默认',

		// Help Text
		help_orbit: '左键拖 = 环绕 · 滚轮 = 缩放',
		help_pan: '右键拖 / ⌘或⇧+左键拖 = 平移',
		help_macos_ctrl: '（macOS 的 Ctrl+点击被系统当右键）',
		help_flight: 'WASD = 平飞 · Q/E = 升降 · Shift = 加速',
		help_focus_orbit: '点击节点 = 选中飞行并环绕 · ESC = 取消',
		help_keys: 'F = 飞向选中 · R = 回总览',
		help_double_click: '双击滑杆 = 回默认值',

		// Presets and Sizing HUD labels
		visual_deep_space: '视觉：深空',
		visual_adaptive: '视觉：随主题',
		size_by_degree: '大小：链接数',
		size_by_file_size: '大小：文档量',
		size_by_uniform: '大小：一致',
		quality_auto: '画质：自动',
		quality_high: '画质：高',
		quality_low: '画质：低',
		quality_mobile: '画质：移动模拟'
	},
	en: {
		// Ribbon / Commands
		open_view: 'Open Galaxy View',
		search_nodes_fly: 'Search galaxy nodes and fly',
		bench_suite: 'Benchmark: Orbit, cold layout, including unresolved',
		bench_leak: 'Benchmark: Leak detection (repeatedly open/close view)',
		open_failed: 'Failed to open galaxy view',
		init_timeout: 'Galaxy view initialization timed out',
		bench_completed: 'Benchmark completed, results in _galaxy_bench/ directory',
		bench_waiting_reclamation: 'Benchmark: waiting for memory reclamation...',
		webgl_warning_note: 'WebGL context warnings require checking the developer console; true leak criterion = two consecutive rounds of rising "before" values',
		s4_completed: 'S4 completed: heap delta {delta} MB (pass line <20MB)',

		// Themes
		theme_custom: 'Color Theme...',
		theme_hubble: 'Hubble Space',
		theme_tiktok: 'TikTok Neon',
		theme_sunset: 'Sunset Film',
		theme_cyber: 'Cyberpunk City',
		theme_matrix: 'The Matrix',
		theme_aurora: 'Aurora',

		// Presets
		preset_galaxy: 'Galaxy',
		preset_nebula: 'Nebula',
		preset_minimal: 'Minimal',
		preset_fireworks: 'Fireworks',

		// Search Modal
		search_placeholder: 'Search notes, press Enter to fly...',
		unresolved: 'Unresolved',
		links_count: 'links',

		// Graph Controller HUD
		context_lost: 'Render context lost, click to rebuild',
		building_graph: 'Building graph...',
		worker_unavailable: 'Galaxy View: Background worker unavailable, fell back to main thread layout',
		mobile_tier_nodes: 'Mobile tier: Displayed the top {cap} nodes with the most links (out of {total})',
		auto_performance_mode: 'Galaxy View: Automatically switched to performance mode (can revert in Advanced)',
		forming_wait: 'Galaxy is still forming, try again after settling',
		import_colors_first: 'Import 2D graph colors first before shuffling',
		no_graph_json_groups: 'No color groups found in default graph settings (graph.json)',
		imported_colors_count: 'Imported {count} color groups from 2D graph',
		settled: 'Settled',
		layouting: 'Layouting',
		waiting_settle: '{scenario}: Waiting for layout to settle...',
		orbit_fps_test: '{scenario}: 20s orbit frame rate test...',
		scenario_completed: '{scenario} completed: avg {fps} fps · {drawCalls} calls',
		s2_started: 'S2: Cold layout started (budgeted tick, interface should remain responsive)...',
		s2_completed: 'S2 completed: settled in {sec}s / {ticks} ticks, longest block {longest}ms',

		// Sliders
		default_value: 'Default {val}',

		// Overlay Manager
		unresolved_link_exists: 'Unresolved link (note does not exist)',
		root_directory: 'Root',
		link_metrics: '↩ {inDegree} backlinks · → {outDegree} outlinks',
		modified_date: ' · Modified on {date}',
		empty_note: '(Empty note)',
		open_note: 'Open note',
		focus: 'Focus',

		// Control Panel Panel Strings
		panel_search: 'Search',
		panel_recenter: 'Recenter',
		panel_cruise_on: 'Cruise: On',
		panel_cruise_off: 'Cruise: Off',
		panel_reveal: 'Reveal animation',
		panel_sec_bloom: 'Bloom',
		panel_bloom_strength: 'Strength',
		panel_bloom_radius: 'Radius',
		panel_bloom_threshold: 'Threshold',
		panel_sec_physics: 'Physics',
		panel_physics_repel: 'Repulsion',
		panel_physics_distance: 'Link distance',
		panel_physics_strength: 'Link strength',
		panel_physics_pull: 'Centripetal pull',
		panel_physics_flatten: 'Flatness',
		panel_sec_appearance: 'Appearance & Colors',
		panel_appearance_size: 'Node size',
		panel_appearance_opacity: 'Link opacity',
		panel_appearance_twinkle: 'Star twinkling',
		panel_appearance_off: 'Off',
		panel_import_colors: 'Import 2D Colors',
		panel_shuffle_colors: 'Shuffle Colors',
		panel_sec_cruise: 'Cruise',
		panel_cruise_speed: 'Speed',
		panel_sec_advanced: 'Advanced',
		panel_unresolved_show: 'Unresolved: Show',
		panel_unresolved_hide: 'Unresolved: Hide',
		panel_orphans_show: 'Orphans: Show',
		panel_orphans_hide: 'Orphans: Hide',
		panel_reset_default: 'Reset defaults',

		// Help Text
		help_orbit: 'Left drag = Orbit · Scroll = Zoom',
		help_pan: 'Right drag / ⌘ or ⇧ + Left drag = Pan',
		help_macos_ctrl: '(macOS Ctrl+click is treated as right click by system)',
		help_flight: 'WASD = Fly · Q/E = Elevate · Shift = Speed up',
		help_focus_orbit: 'Click node = Focus orbit · ESC = Cancel',
		help_keys: 'F = Fly to selection · R = Recenter',
		help_double_click: 'Double click slider to reset',

		// Presets and Sizing HUD labels
		visual_deep_space: 'Visual: Deep Space',
		visual_adaptive: 'Visual: Adapt to Theme',
		size_by_degree: 'Size: Link count',
		size_by_file_size: 'Size: File size',
		size_by_uniform: 'Size: Uniform',
		quality_auto: 'Quality: Auto',
		quality_high: 'Quality: High',
		quality_low: 'Quality: Low',
		quality_mobile: 'Quality: Mobile simulation'
	}
};

export function t(key: keyof typeof TRANSLATIONS['en'], vars?: Record<string, string | number>): string {
	const currentLocale = locale.startsWith('zh') ? 'zh' : 'en';
	let text = TRANSLATIONS[currentLocale][key] || TRANSLATIONS['en'][key] || key;
	if (vars) {
		for (const [k, v] of Object.entries(vars)) {
			text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
		}
	}
	return text;
}
