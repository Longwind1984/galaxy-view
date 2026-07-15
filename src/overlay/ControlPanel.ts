import { Menu, Platform } from 'obsidian';
import type { GalaxySettings } from '../settings';
import { DEFAULT_SETTINGS } from '../settings';
import type { StylePreset } from '../render/stylePresets';
import { STYLE_PRESETS } from '../render/stylePresets';
import type { ColorTheme } from '../render/colorThemes';
import { COLOR_THEMES } from '../render/colorThemes';
import { getLang, t, LANGS } from '../i18n';
import type { Lang, LangPref } from '../i18n';
import { drawPresetIcon } from './presetIcons';
import { Slider } from './Slider';

export interface ControlPanelCallbacks {
	onBloom: () => void;
	onPhysics: () => void;
	onLook: () => void;
	onSpace: () => void;
	onCruise: (on: boolean) => void;
	onCruiseSpeed: () => void;
	onStylePreset: (p: StylePreset) => void;
	onPresetHover: (p: StylePreset) => void;
	onPresetHoverEnd: () => void;
	onSavePreset: () => void;
	onMovePreset: (i: number, dir: -1 | 1) => void;
	onDeletePreset: (i: number) => void;
	onRenamePreset: (i: number, name: string) => void;
	onRestoreSection: (group: 'bloom' | 'physics' | 'look' | 'space') => void;
	onShowUnresolved: (on: boolean) => void;
	onImportColors: () => void;
	onShuffleColors: () => void;
	onColorTheme: (t: ColorTheme) => void;
	onStarfield: (on: boolean) => void;
	onRecenter: () => void;
	onReveal: () => void;
	onShowOrphans: (on: boolean) => void;
	onShowTags: (on: boolean) => void;
	onSizeBy: () => void;
	onQuality: () => void;
	onSearch: () => void;
	onTourToggle: () => void;
	onConnectTwo: () => void;
	onTourSpeed: () => void;
	onSectionToggle: (id: string, open: boolean) => void;
	/** 过滤·主：文件夹图例点击（点一下就重建，无需防抖） */
	onHiddenFolders: (hidden: string[]) => void;
	/** 图例数据：顶层文件夹 + 笔记数，按数量降序（全量算，不受过滤影响） */
	getFolders: () => { folder: string; count: number }[];
	/** 顶层文件夹在图上**真实生效**的颜色（含用户导入的 colorGroups）——图例跟图对不上就是装饰 */
	folderColorHex: (folder: string) => string;
	/** 过滤·逃生口：文本查询；调用方负责防抖——每次重建都要重跑布局，不能逐键触发 */
	onFilter: (query: string) => void;
	onLanguage: (pref: LangPref) => void;
	onPanelWidth: (w: number) => void;
	onReset: () => void;
	runScenario: (s: 'S1' | 'S2' | 'S3') => void;
}

const SEC = { look: 'look', space: 'space', physics: 'physics', bloom: 'bloom' } as const;
const SECTION_DEFS: { id: string; group: 'look' | 'physics' | 'bloom' | 'space'; key: Parameters<typeof t>[0] }[] = [
	{ id: SEC.look, group: 'look', key: 'panel.sec.look' },
	{ id: SEC.space, group: 'space', key: 'panel.sec.space' },
	{ id: SEC.physics, group: 'physics', key: 'panel.sec.physics' },
	{ id: SEC.bloom, group: 'bloom', key: 'panel.sec.bloom' },
];

function presetName(p: StylePreset): string {
	return getLang() === 'zh' ? p.name : (p.nameEn ?? p.name);
}
function themeColor(id: string): string {
	return COLOR_THEMES.find((th) => th.id === id)?.colors[0] ?? '#9aa6c0';
}

/**
 * 控制面板 v4（v0.3 面板重构）：按意图分区（外观 / 导航与动效 / 底栏）；预设扁平列表带图标+副标题、
 * 悬停即时预览、点击提交、分区级「由 X 设定 / 已自定义 / 还原」；自定义预设可排序/删除（原地确认）。
 */
export class ControlPanel {
	readonly statsEl: HTMLElement;
	readonly advStatsEl: HTMLElement;
	private root: HTMLElement;
	private body: HTMLElement;
	private sliders: Slider[] = [];
	private cruiseBtn: HTMLButtonElement | null = null;
	private unresolvedBtn: HTMLButtonElement | null = null;
	private orphanBtn: HTMLButtonElement | null = null;
	private tagBtn: HTMLButtonElement | null = null;
	private sizeByBtn: HTMLButtonElement | null = null;
	private starfieldBtn: HTMLButtonElement | null = null;
	private tourPlayBtn: HTMLButtonElement | null = null;
	private presetHost: HTMLElement | null = null;
	private secBadges: Record<string, { badge: HTMLElement; restore: HTMLElement }> = {};
	private filterInput: HTMLInputElement | null = null;
	private filterClearBtn: HTMLElement | null = null;
	private filterNoneEl: HTMLElement | null = null;
	private filterAllBtn: HTMLElement | null = null;
	private folderHost: HTMLElement | null = null;
	private helpEl: HTMLElement | null = null;
	private cb: ControlPanelCallbacks;

	constructor(
		parent: HTMLElement,
		private settings: GalaxySettings,
		cb: ControlPanelCallbacks,
	) {
		this.cb = cb;
		this.root = parent.createDiv({ cls: 'galaxy-panel gx-theme-dark' });
		this.root.style.width = `${settings.panelWidth}px`;
		this.buildResizer(cb);

		// —— 顶栏 ——
		const header = this.root.createDiv({ cls: 'galaxy-panel-header' });
		this.statsEl = header.createDiv({ cls: 'galaxy-panel-stats', text: '…' });
		header.createDiv({ cls: 'gx-head-spacer' });
		// 语言：表头显示当前语言码，点开原生 Menu 选 自动 + 六语（当前项打勾）——比开关列扩展到多语言更干净
		const langBtn = header.createEl('button', { cls: 'gx-lang-btn', text: this.langLabel(getLang()) });
		langBtn.setAttribute('aria-label', t('set.language'));
		langBtn.addEventListener('click', (e) => this.openLangMenu(e, cb));
		const helpBtn = header.createEl('button', { cls: 'gx-ico', text: '?' });
		const collapseBtn = header.createEl('button', { cls: 'gx-ico galaxy-panel-collapse', text: '−' });
		const body = this.root.createDiv({ cls: 'galaxy-panel-body' });
		this.body = body;
		if (Platform.isMobile) {
			body.addClass('is-hidden');
			collapseBtn.setText('+');
		}
		collapseBtn.addEventListener('click', () => {
			const hidden = body.hasClass('is-hidden');
			body.toggleClass('is-hidden', !hidden);
			collapseBtn.setText(hidden ? '−' : '+');
		});
		helpBtn.addEventListener('click', () => this.toggleHelp(header));

		const s = this.settings;
		const d = DEFAULT_SETTINGS;

		// —— 常用 ——
		const row1 = body.createDiv({ cls: 'galaxy-panel-row' });
		row1.createEl('button', { text: t('panel.search') }).addEventListener('click', cb.onSearch);
		row1.createEl('button', { text: t('panel.recenter') }).addEventListener('click', cb.onRecenter);

		// —— 外观区 ——
		body.createDiv({ cls: 'gx-zone-h', text: t('zone.look') });
		this.presetHost = body.createDiv({ cls: 'gx-preset-host' });
		this.buildPresets();

		const section = (id: string, key: Parameters<typeof t>[0], withMarker: 'look' | 'physics' | 'bloom' | 'space' | null) => {
			const det = body.createEl('details', { cls: 'gx-section' });
			if (s.panelSections[id]) det.setAttribute('open', '');
			const sum = det.createEl('summary');
			sum.createSpan({ cls: 'gx-caret', text: '▸' });
			sum.createSpan({ text: t(key) });
			if (withMarker) {
				sum.createSpan({ cls: 'gx-sec-head-spacer' });
				const badge = sum.createSpan({ cls: 'gx-sec-badge' });
				// span（非 button）：summary 内放 button 会触发「interactive element inside summary」a11y 告警
				const restore = sum.createSpan({ cls: 'gx-sec-restore', text: t('sec.restore') });
				restore.addEventListener('click', (e) => {
					e.preventDefault();
					e.stopPropagation();
					cb.onRestoreSection(withMarker);
				});
				this.secBadges[id] = { badge, restore };
			}
			det.addEventListener('toggle', () => cb.onSectionToggle(id, det.open));
			return det.createDiv({ cls: 'gx-section-body' });
		};

		// —— 过滤（#11）——
		// 「什么进图」的控件全在这里：文本过滤 + 未解析/孤儿/标签三个开关（0.4.x 时它们在页脚「高级」，
		// 与画质混居；它们本质就是过滤器，故随过滤框一起归位到主位，对齐核心 Graph View 的 IA）。
		this.buildFilterSection(body, cb);

		// 外观与配色
		const lookSec = section(SEC.look, 'panel.sec.look', 'look');
		this.sliders.push(
			new Slider(lookSec, { label: t('slider.look.nodeSize'), min: 0.3, max: 2.5, step: 0.05, defaultValue: d.look.nodeSize, get: () => s.look.nodeSize, set: (v) => (s.look.nodeSize = v), fmt: (v) => `${v.toFixed(2)}×`, onInput: () => this.tracked(cb.onLook) }),
			new Slider(lookSec, { label: t('slider.look.linkOpacity'), min: 0, max: 0.6, step: 0.01, defaultValue: d.look.linkOpacity, get: () => s.look.linkOpacity, set: (v) => (s.look.linkOpacity = v), onInput: () => this.tracked(cb.onLook) }),
			new Slider(lookSec, { label: t('slider.look.linkCurve'), min: 0, max: 1, step: 0.05, defaultValue: d.look.linkCurve, get: () => s.look.linkCurve, set: (v) => (s.look.linkCurve = v), fmt: (v) => (v < 0.025 ? t('value.off') : v.toFixed(2)), onInput: () => this.tracked(cb.onLook) }),
			new Slider(lookSec, { label: t('slider.look.twinkle'), min: 0, max: 2, step: 0.1, defaultValue: d.look.twinkle, get: () => s.look.twinkle, set: (v) => (s.look.twinkle = v), fmt: (v) => (v < 0.05 ? t('value.off') : `${v.toFixed(1)}`), onInput: () => this.tracked(cb.onLook) }),
		);
		const sizeRow = lookSec.createDiv({ cls: 'galaxy-panel-row' });
		this.sizeByBtn = sizeRow.createEl('button', { text: this.sizeByLabel() });
		this.sizeByBtn.addEventListener('click', () => {
			const order: typeof s.look.sizeBy[] = ['degree', 'fileSize', 'uniform'];
			s.look.sizeBy = order[(order.indexOf(s.look.sizeBy) + 1) % order.length] ?? 'degree';
			this.sizeByBtn?.setText(this.sizeByLabel());
			this.tracked(cb.onSizeBy);
		});
		const themeSel = lookSec.createEl('select', { cls: 'gx-theme-select' });
		const customOpt = themeSel.createEl('option', { text: t('look.theme.placeholder'), value: '' });
		customOpt.disabled = true;
		for (const th of COLOR_THEMES) themeSel.createEl('option', { text: th.name, value: th.id });
		themeSel.value = COLOR_THEMES.some((th) => th.id === s.colorTheme) ? s.colorTheme : '';
		if (!themeSel.value) customOpt.selected = true;
		themeSel.addEventListener('change', () => {
			const th = COLOR_THEMES.find((x) => x.id === themeSel.value);
			if (th) {
				cb.onColorTheme(th);
				this.refreshMarkers();
			}
		});
		const colorRow = lookSec.createDiv({ cls: 'galaxy-panel-row' });
		colorRow.createEl('button', { text: t('look.import') }).addEventListener('click', () => {
			cb.onImportColors();
			customOpt.selected = true;
		});
		colorRow.createEl('button', { text: t('look.shuffle') }).addEventListener('click', () => {
			cb.onShuffleColors();
			customOpt.selected = true;
		});

		// 深空背景（v0.4）：星点天幕开关 + 三个形态层滑杆（0=关），可自由叠加组合
		const spaceSec = section(SEC.space, 'panel.sec.space', 'space');
		const fmtOff = (v: number) => (v < 0.025 ? t('value.off') : v.toFixed(2));
		this.sliders.push(
			new Slider(spaceSec, { label: t('slider.space.nebula'), min: 0, max: 1, step: 0.05, defaultValue: d.space.nebula, get: () => s.space.nebula, set: (v) => (s.space.nebula = v), fmt: fmtOff, onInput: () => this.tracked(cb.onSpace) }),
			new Slider(spaceSec, { label: t('slider.space.fieldStars'), min: 0, max: 1, step: 0.05, defaultValue: d.space.fieldStars, get: () => s.space.fieldStars, set: (v) => (s.space.fieldStars = v), fmt: fmtOff, onInput: () => this.tracked(cb.onSpace) }),
			new Slider(spaceSec, { label: t('slider.space.clusterClouds'), min: 0, max: 1, step: 0.05, defaultValue: d.space.clusterClouds, get: () => s.space.clusterClouds, set: (v) => (s.space.clusterClouds = v), fmt: fmtOff, onInput: () => this.tracked(cb.onSpace) }),
		);
		const starRow = spaceSec.createDiv({ cls: 'galaxy-panel-row' });
		this.starfieldBtn = starRow.createEl('button', { text: this.starfieldLabel() });
		this.starfieldBtn.addEventListener('click', () => {
			s.showStarfield = !s.showStarfield;
			this.starfieldBtn?.setText(this.starfieldLabel());
			this.tracked(() => cb.onStarfield(s.showStarfield));
		});

		// 辉光
		const bloomSec = section(SEC.bloom, 'panel.sec.bloom', 'bloom');
		this.sliders.push(
			new Slider(bloomSec, { label: t('slider.bloom.strength'), min: 0, max: 2.5, step: 0.05, defaultValue: d.bloom.strength, get: () => s.bloom.strength, set: (v) => (s.bloom.strength = v), onInput: () => this.tracked(cb.onBloom) }),
			new Slider(bloomSec, { label: t('slider.bloom.radius'), min: 0, max: 1.2, step: 0.05, defaultValue: d.bloom.radius, get: () => s.bloom.radius, set: (v) => (s.bloom.radius = v), onInput: () => this.tracked(cb.onBloom) }),
			new Slider(bloomSec, { label: t('slider.bloom.threshold'), min: 0, max: 1, step: 0.05, defaultValue: d.bloom.threshold, get: () => s.bloom.threshold, set: (v) => (s.bloom.threshold = v), onInput: () => this.tracked(cb.onBloom) }),
		);

		// 力学（放在辉光之后：低频、更进阶）
		const phySec = section(SEC.physics, 'panel.sec.physics', 'physics');
		this.sliders.push(
			new Slider(phySec, { label: t('slider.phys.repel'), min: 20, max: 400, step: 5, defaultValue: d.physics.repel, get: () => s.physics.repel, set: (v) => (s.physics.repel = v), fmt: (v) => String(Math.round(v)), onInput: () => this.tracked(cb.onPhysics) }),
			new Slider(phySec, { label: t('slider.phys.linkDistance'), min: 20, max: 200, step: 5, defaultValue: d.physics.linkDistance, get: () => s.physics.linkDistance, set: (v) => (s.physics.linkDistance = v), fmt: (v) => String(Math.round(v)), onInput: () => this.tracked(cb.onPhysics) }),
			new Slider(phySec, { label: t('slider.phys.linkStrength'), min: 0.1, max: 2, step: 0.1, defaultValue: d.physics.linkStrength, get: () => s.physics.linkStrength, set: (v) => (s.physics.linkStrength = v), fmt: (v) => `${v.toFixed(1)}×`, onInput: () => this.tracked(cb.onPhysics) }),
			new Slider(phySec, { label: t('slider.phys.centerPull'), min: 0, max: 0.2, step: 0.005, defaultValue: d.physics.centerPull, get: () => s.physics.centerPull, set: (v) => (s.physics.centerPull = v), fmt: (v) => v.toFixed(3), onInput: () => this.tracked(cb.onPhysics) }),
			new Slider(phySec, { label: t('slider.phys.flatten'), min: 0, max: 0.8, step: 0.02, defaultValue: d.physics.flatten, get: () => s.physics.flatten, set: (v) => (s.physics.flatten = v), onInput: () => this.tracked(cb.onPhysics) }),
			new Slider(phySec, { label: t('slider.phys.coreGravity'), min: -0.1, max: 0.3, step: 0.005, defaultValue: d.physics.coreGravity, get: () => s.physics.coreGravity, set: (v) => (s.physics.coreGravity = v), fmt: (v) => v.toFixed(3), onInput: () => this.tracked(cb.onPhysics) }),
			new Slider(phySec, { label: t('slider.phys.spiral'), min: 0, max: 0.1, step: 0.005, defaultValue: d.physics.spiral, get: () => s.physics.spiral, set: (v) => (s.physics.spiral = v), fmt: (v) => v.toFixed(3), onInput: () => this.tracked(cb.onPhysics) }),
		);

		// —— 导航与动效区（可折叠；默认展开，记忆开合状态）——
		const navSec = body.createEl('details', { cls: 'gx-section gx-zone-section' });
		if (s.panelSections['nav'] !== false) navSec.setAttribute('open', '');
		const navSum = navSec.createEl('summary');
		navSum.createSpan({ cls: 'gx-caret', text: '▸' });
		navSum.createSpan({ text: t('zone.move') });
		navSec.addEventListener('toggle', () => cb.onSectionToggle('nav', navSec.open));
		const navBody = navSec.createDiv({ cls: 'gx-section-body' });
		// 自动环绕
		const ao = navBody.createDiv({ cls: 'gx-nav-block' });
		const aoh = ao.createDiv({ cls: 'gx-nav-head' });
		aoh.createSpan({ text: t('nav.autoOrbit') });
		this.cruiseBtn = aoh.createEl('button', { cls: 'gx-mini-toggle', text: s.cruise ? '●' : '○' });
		this.cruiseBtn.toggleClass('is-on', s.cruise);
		this.cruiseBtn.addEventListener('click', () => {
			s.cruise = !s.cruise;
			this.cruiseBtn?.setText(s.cruise ? '●' : '○');
			this.cruiseBtn?.toggleClass('is-on', s.cruise);
			cb.onCruise(s.cruise);
		});
		ao.createDiv({ cls: 'gx-nav-sub', text: t('nav.autoOrbitSub') });
		this.sliders.push(new Slider(ao, { label: t('slider.cruise.speed'), min: 0.2, max: 3, step: 0.1, defaultValue: d.cruiseSpeed, get: () => s.cruiseSpeed, set: (v) => (s.cruiseSpeed = v), fmt: (v) => `${v.toFixed(1)}×`, onInput: cb.onCruiseSpeed }));

		// 漫游：一键氛围自动巡游（移动档隐藏——飞掠较重）
		if (!Platform.isMobile) {
			const tb = navBody.createDiv({ cls: 'gx-nav-block' });
			const tbh = tb.createDiv({ cls: 'gx-nav-head' });
			tbh.createSpan({ text: t('nav.wander') });
			this.tourPlayBtn = tbh.createEl('button', { cls: 'gx-play', text: `▶ ${t('tour.play')}` });
			this.tourPlayBtn.addEventListener('click', () => cb.onTourToggle());
			tb.createDiv({ cls: 'gx-nav-sub', text: t('nav.wanderSub') });
			this.sliders.push(new Slider(tb, { label: t('slider.tour.speed'), min: 0.2, max: 3, step: 0.1, defaultValue: d.tour.speed, get: () => s.tour.speed, set: (v) => (s.tour.speed = v), fmt: (v) => `${v.toFixed(1)}×`, onInput: cb.onTourSpeed }));
		}
		// 连接两篇：寻路工具（选起点/终点 → 飞最短链接路径）
		const ct = navBody.createDiv({ cls: 'gx-nav-block' });
		const cth = ct.createDiv({ cls: 'gx-nav-head' });
		cth.createSpan({ text: t('nav.connect') });
		cth.createEl('button', { cls: 'gx-play', text: t('nav.connectGo') }).addEventListener('click', () => cb.onConnectTwo());
		ct.createDiv({ cls: 'gx-nav-sub', text: t('nav.connectSub') });

		const replay = navBody.createEl('button', { cls: 'gx-textlink', text: t('nav.replay') });
		replay.addEventListener('click', cb.onReveal);

		// —— 底栏 ——
		const footer = body.createDiv({ cls: 'gx-footer' });
		const fRow = footer.createDiv({ cls: 'galaxy-panel-row' });
		fRow.createEl('button', { cls: 'gx-textlike', text: t('adv.resetAll') }).addEventListener('click', () => {
			cb.onReset();
			this.refreshAll();
		});
		fRow.createEl('button', { text: t('preset.save') }).addEventListener('click', () => cb.onSavePreset());

		const advSec = footer.createEl('details', { cls: 'gx-section' });
		if (s.panelSections['advanced']) advSec.setAttribute('open', '');
		const advSum = advSec.createEl('summary');
		advSum.createSpan({ cls: 'gx-caret', text: '▸' });
		advSum.createSpan({ text: t('panel.sec.advanced') });
		advSec.addEventListener('toggle', () => cb.onSectionToggle('advanced', advSec.open));
		const advBody = advSec.createDiv({ cls: 'gx-section-body' });
		const qRow = advBody.createDiv({ cls: 'gx-seg' });
		const qOpts: { v: GalaxySettings['qualityOverride']; k: Parameters<typeof t>[0] }[] = [
			{ v: 'auto', k: 'q.auto' }, { v: 'high', k: 'q.high' }, { v: 'low', k: 'q.low' }, { v: 'mobile', k: 'q.mobile' },
		];
		for (const o of qOpts) {
			const b = qRow.createEl('button', { text: t(o.k) });
			b.toggleClass('is-on', s.qualityOverride === o.v);
			b.addEventListener('click', () => {
				s.qualityOverride = o.v;
				for (const c of Array.from(qRow.children)) c.removeClass('is-on');
				b.addClass('is-on');
				cb.onQuality();
			});
		}
		advBody.createDiv({ cls: 'gx-sub', text: t('quality.autoSub') });
		// 未解析/孤儿/标签三个开关已移至「过滤」分区（它们决定什么进图 = 过滤器，不是高级项）
		this.advStatsEl = advBody.createDiv({ cls: 'gx-adv-stats', text: '…' });
		if (__GALAXY_DEV__) {
			const devRow = advBody.createDiv({ cls: 'galaxy-panel-row' });
			for (const sc of ['S1', 'S2', 'S3'] as const) devRow.createEl('button', { text: sc }).addEventListener('click', () => cb.runScenario(sc));
		}

		this.refreshMarkers();
	}

	// ---------- 预设 ----------

	private buildPresets(): void {
		const host = this.presetHost;
		if (!host) return;
		host.empty();
		const grid = host.createDiv({ cls: 'gx-cards' });
		for (const p of STYLE_PRESETS) this.makePresetCard(grid, p, false, 0);
		const custom = this.settings.customPresets;
		if (custom.length > 0) {
			host.createDiv({ cls: 'gx-preset-label', text: t('preset.mine') });
			const cg = host.createDiv({ cls: 'gx-cards' });
			custom.forEach((p, i) => this.makePresetCard(cg, p, true, i));
		}
	}

	private makePresetCard(grid: HTMLElement, p: StylePreset, isMine: boolean, idx: number): void {
		// div（非 button）：Obsidian 的 button 默认 inline-flex 居中 + 固定高，会把卡片的多行内容压扁/裁掉。
		const card = grid.createDiv({ cls: 'gx-pcard', attr: { role: 'button', tabindex: '0' } });
		card.toggleClass('is-active', p.id === this.settings.activePreset);
		const nameRow = card.createDiv({ cls: 'gx-pcard-n' });
		const icon = nameRow.createSpan({ cls: 'gx-pcard-icon' });
		try {
			drawPresetIcon(icon, isMine ? 'custom' : p.id, themeColor(p.theme));
		} catch {
			/* 图标是装饰，画不出也不影响卡片 */
		}
		const nameSpan = nameRow.createSpan({ text: presetName(p) });
		// 内置预设的副标题=气质描述（有效区分信息）；自定义预设无副标题（避免每张都印同一句废话）
		if (!isMine) card.createDiv({ cls: 'gx-pcard-s', text: t(`preset.sub.${p.id}` as Parameters<typeof t>[0]) });
		if (isMine) {
			// 四个管理操作（改名/上移/下移/删除）收进一个 ⋯ 菜单：右上角只留一个点，不挤不遮名字
			const ops = card.createDiv({ cls: 'gx-mine-ops' });
			const more = ops.createEl('button', { cls: 'gx-more', text: '⋯' });
			more.setAttribute('aria-label', t('mine.more'));
			more.addEventListener('click', (e) => { e.stopPropagation(); this.openPresetMenu(e, idx, card, nameSpan, p); });
		}
		const commit = () => { this.cb.onStylePreset(p); this.refreshAll(); };
		card.addEventListener('mouseenter', () => { this.cb.onPresetHover(p); this.showPreviewMarkers(presetName(p)); });
		card.addEventListener('mouseleave', () => { this.cb.onPresetHoverEnd(); this.refreshMarkers(); });
		card.addEventListener('click', commit);
		card.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				commit();
			}
		});
	}

	/** 自定义预设的 ⋯ 菜单：改名 / 上移 / 下移 / 删除（管理操作低频，收进菜单避免卡片右上角挤按钮） */
	private openPresetMenu(e: MouseEvent, idx: number, card: HTMLElement, nameSpan: HTMLElement, p: StylePreset): void {
		const last = this.settings.customPresets.length - 1;
		const menu = new Menu();
		menu.addItem((i) => i.setTitle(t('mine.rename')).setIcon('pencil').onClick(() => this.beginRename(idx, card, nameSpan, p)));
		menu.addItem((i) => i.setTitle(t('mine.up')).setIcon('arrow-up').setDisabled(idx === 0).onClick(() => this.cb.onMovePreset(idx, -1)));
		menu.addItem((i) => i.setTitle(t('mine.down')).setIcon('arrow-down').setDisabled(idx === last).onClick(() => this.cb.onMovePreset(idx, 1)));
		menu.addSeparator();
		menu.addItem((i) => i.setTitle(t('mine.del')).setIcon('trash').onClick(() => this.cb.onDeletePreset(idx)));
		menu.showAtMouseEvent(e);
	}

	/** 内联重命名：把名字 span 原地换成输入框，Enter/失焦提交、Esc 取消；成功后由 refreshPresets 重建卡片 */
	private beginRename(idx: number, card: HTMLElement, nameSpan: HTMLElement, p: StylePreset): void {
		const input = nameSpan.parentElement?.createEl('input', { cls: 'gx-pcard-rename', value: presetName(p) });
		if (!input) return;
		card.addClass('is-renaming'); // 编辑态隐藏 ✎↑↓×，输入框独占整行
		nameSpan.replaceWith(input);
		input.focus();
		input.select();
		let done = false;
		const finish = (save: boolean) => {
			if (done) return;
			done = true;
			const v = input.value.trim();
			if (save && v) this.cb.onRenamePreset(idx, v); // → refreshPresets 重建
			else this.buildPresets(); // 取消或空值：重建还原原名
		};
		// 输入框内的按键/点击都不能冒泡到卡片（否则触发应用预设或空格键翻页）
		input.addEventListener('keydown', (e) => {
			e.stopPropagation();
			if (e.key === 'Enter') { e.preventDefault(); finish(true); }
			else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
		});
		input.addEventListener('click', (e) => e.stopPropagation());
		input.addEventListener('blur', () => finish(true));
	}

	/** GraphController 存/移/删预设后调用：重建卡片区 */
	refreshPresets(): void {
		this.buildPresets();
		this.refreshMarkers();
	}

	// ---------- 分区标记 ----------

	/** 参数改动经此包一层：回调 + 立刻刷新分区标记 */
	private tracked(fn: () => void): void {
		fn();
		this.refreshMarkers();
	}

	private activePresetObj(): StylePreset | undefined {
		return [...STYLE_PRESETS, ...this.settings.customPresets].find((p) => p.id === this.settings.activePreset);
	}
	private near(a: number, b: number): boolean {
		return Math.abs(a - b) < 1e-4;
	}
	/**
	 * 「过滤」分区（#11）：可点的文件夹图例（主）＋ 折叠的文本查询（逃生口）＋ 未解析/孤儿/标签三个开关。
	 *
	 * 为什么图例是主体：节点一直按顶层文件夹上色，但面板从来没暴露过图例——用户看见一团团彩色，
	 * 既不知道颜色什么意思、也没法对它做任何事。把图例做成可点的，一个东西同时回答
	 * 「这个颜色什么意思」和「只给我看这块」，且零语法。文本框只留给图例表达不了的横切模式。
	 *
	 * 文案克制：分区标题已说明用途，故 placeholder 不重复「过滤笔记…」而是给一个可用的真实查询把语法教掉；
	 * 面板头部已经在显示笔记数，所以不加「显示 N/M 篇」——只有零匹配才提示（整个视图空掉会像崩了）。
	 */
	private buildFilterSection(body: HTMLElement, cb: ControlPanelCallbacks): void {
		const s = this.settings;
		const det = body.createEl('details', { cls: 'gx-section gx-zone-section' });
		if (s.panelSections['filter'] !== false) det.setAttribute('open', ''); // 新分区默认展开（过滤是主功能）
		const sum = det.createEl('summary');
		sum.createSpan({ cls: 'gx-caret', text: '▸' });
		sum.createSpan({ text: t('panel.sec.filter') });
		sum.createSpan({ cls: 'gx-sec-head-spacer' });
		// 「全选」只在有点灭的文件夹时出现——没什么可还原时它是零信息量的
		this.filterAllBtn = sum.createSpan({ cls: 'gx-sec-restore', text: t('filter.all') });
		this.filterAllBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			s.hiddenFolders = [];
			cb.onHiddenFolders([]);
			this.refreshFolders();
		});
		det.addEventListener('toggle', () => cb.onSectionToggle('filter', det.open));
		const fBody = det.createDiv({ cls: 'gx-section-body' });

		// —— 主：文件夹图例 ——
		this.folderHost = fBody.createDiv({ cls: 'gx-folders' });
		this.refreshFolders();

		this.filterNoneEl = fBody.createDiv({ cls: 'gx-filter-none' });
		this.filterNoneEl.toggleClass('is-hidden', true);

		// —— 次：文本查询逃生口（默认折叠；图例表达不了的横切模式才用） ——
		const esc = fBody.createDiv({ cls: 'gx-filter-esc' });
		const escToggle = esc.createDiv({ cls: 'gx-filter-esc-t' });
		escToggle.createSpan({ text: '＋' });
		escToggle.createSpan({ text: t('filter.byName') });
		const escBody = esc.createDiv({ cls: 'gx-filter-esc-b' });
		// 存档里有查询就默认展开——否则用户看不见自己正被一个隐形条件过滤着
		const startOpen = s.filterQuery.length > 0;
		escBody.toggleClass('is-open', startOpen);
		escToggle.toggleClass('is-open', startOpen);
		escToggle.addEventListener('click', () => {
			const open = !escBody.hasClass('is-open');
			escBody.toggleClass('is-open', open);
			escToggle.toggleClass('is-open', open);
			if (open) this.filterInput?.focus();
		});

		const wrap = escBody.createDiv({ cls: 'gx-filter' });
		const input = wrap.createEl('input', { cls: 'gx-filter-input', type: 'text' });
		input.placeholder = t('filter.placeholder');
		input.spellcheck = false;
		input.value = s.filterQuery;
		input.setAttr('title', t('filter.syntax'));
		this.filterInput = input;

		const clear = wrap.createEl('button', { cls: 'gx-filter-clear', text: '✕' });
		clear.setAttr('aria-label', t('filter.clear'));
		clear.setAttr('title', t('filter.clear'));
		clear.toggleClass('is-hidden', s.filterQuery.length === 0);
		this.filterClearBtn = clear;

		const push = (v: string) => {
			s.filterQuery = v;
			clear.toggleClass('is-hidden', v.length === 0);
			cb.onFilter(v);
		};
		input.addEventListener('input', () => push(input.value));
		// Esc 清空（输入框内的 Esc 不该冒泡去取消节点选中）
		input.addEventListener('keydown', (e) => {
			if (e.key !== 'Escape') return;
			e.stopPropagation();
			if (input.value.length === 0) return;
			input.value = '';
			push('');
		});
		clear.addEventListener('click', () => {
			input.value = '';
			push('');
			input.focus();
		});

		const row = fBody.createDiv({ cls: 'galaxy-panel-row' });
		this.unresolvedBtn = row.createEl('button', { text: this.unresolvedLabel() });
		this.unresolvedBtn.addEventListener('click', () => {
			s.showUnresolved = !s.showUnresolved;
			this.unresolvedBtn?.setText(this.unresolvedLabel());
			cb.onShowUnresolved(s.showUnresolved);
		});
		this.orphanBtn = row.createEl('button', { text: this.orphanLabel() });
		this.orphanBtn.addEventListener('click', () => {
			s.showOrphans = !s.showOrphans;
			this.orphanBtn?.setText(this.orphanLabel());
			cb.onShowOrphans(s.showOrphans);
		});
		this.tagBtn = row.createEl('button', { text: this.tagLabel() });
		this.tagBtn.addEventListener('click', () => {
			s.showTags = !s.showTags;
			this.tagBtn?.setText(this.tagLabel());
			cb.onShowTags(s.showTags);
		});
	}

	/** 由 GraphController 在重建后调用：零匹配才出提示，其余留白（头部笔记数已在变） */
	setFilterEmpty(empty: boolean): void {
		if (!this.filterNoneEl) return;
		this.filterNoneEl.setText(empty ? t('filter.none') : '');
		this.filterNoneEl.toggleClass('is-hidden', !empty);
	}

	/** 重画文件夹图例。数据与颜色都走回调实时取——面板在构造函数里就 build，字段注入会晚一步 */
	refreshFolders(): void {
		const host = this.folderHost;
		if (!host) return;
		host.empty();
		const hidden = new Set(this.settings.hiddenFolders);
		const list = this.cb.getFolders();
		for (const { folder, count } of list) {
			const chip = host.createDiv({ cls: 'gx-folder' });
			chip.toggleClass('is-off', hidden.has(folder));
			const dot = chip.createSpan({ cls: 'gx-folder-dot' });
			dot.style.setProperty('--gx-folder-color', this.cb.folderColorHex(folder));
			chip.createSpan({ cls: 'gx-folder-name', text: folder === '' ? t('filter.rootFolder') : folder });
			chip.createSpan({ cls: 'gx-folder-count', text: String(count) });

			// 「只看」＝把其余全点灭。hover 才出，因为它是加速器不是主操作
			const solo = chip.createSpan({ cls: 'gx-folder-solo', text: t('filter.solo') });
			solo.setAttr('title', t('filter.soloTip'));
			solo.addEventListener('click', (e) => {
				e.stopPropagation();
				const others = list.map((f) => f.folder).filter((f) => f !== folder);
				// 已经是「只看它」了 → 再点还原，避免变成死胡同
				const isSolo = others.every((f) => hidden.has(f)) && !hidden.has(folder);
				this.applyHidden(isSolo ? [] : others);
			});

			chip.addEventListener('click', () => {
				const next = new Set(hidden);
				next.has(folder) ? next.delete(folder) : next.add(folder);
				this.applyHidden([...next]);
			});
		}
		this.filterAllBtn?.toggleClass('is-hidden', hidden.size === 0);
	}

	private applyHidden(next: string[]): void {
		this.settings.hiddenFolders = next;
		this.cb.onHiddenFolders(next);
		this.refreshFolders();
	}

	private sectionClean(group: 'look' | 'physics' | 'bloom' | 'space'): boolean {
		const p = this.activePresetObj();
		if (!p) return false;
		const s = this.settings;
		if (group === 'bloom') return this.near(s.bloom.strength, p.bloom.strength) && this.near(s.bloom.radius, p.bloom.radius) && this.near(s.bloom.threshold, p.bloom.threshold);
		if (group === 'physics') return (['repel', 'linkDistance', 'linkStrength', 'centerPull', 'flatten', 'coreGravity', 'spiral'] as const).every((k) => this.near(s.physics[k], p.physics[k]));
		if (group === 'space') return (['nebula', 'fieldStars', 'clusterClouds'] as const).every((k) => this.near(s.space[k], p.space[k])) && s.showStarfield === p.starfield;
		return this.near(s.look.nodeSize, p.look.nodeSize) && this.near(s.look.linkOpacity, p.look.linkOpacity) && this.near(s.look.linkCurve, p.look.linkCurve) && this.near(s.look.twinkle, p.look.twinkle) && s.look.sizeBy === p.look.sizeBy && s.colorTheme === p.theme;
	}

	private refreshMarkers(): void {
		const p = this.activePresetObj();
		for (const def of SECTION_DEFS) {
			const reg = this.secBadges[def.id];
			if (!reg) continue;
			if (!p) {
				reg.badge.setText('');
				reg.badge.className = 'gx-sec-badge';
				reg.restore.toggleClass('gx-hide', true);
				continue;
			}
			const clean = this.sectionClean(def.group);
			reg.badge.setText(clean ? t('sec.setBy', { n: presetName(p) }) : t('sec.customized'));
			reg.badge.className = 'gx-sec-badge' + (clean ? '' : ' is-dirty');
			reg.restore.toggleClass('gx-hide', clean);
		}
	}

	private showPreviewMarkers(name: string): void {
		for (const def of SECTION_DEFS) {
			const reg = this.secBadges[def.id];
			if (!reg) continue;
			reg.badge.setText(t('sec.preview', { n: name }));
			reg.badge.className = 'gx-sec-badge is-preview';
			reg.restore.toggleClass('gx-hide', true);
		}
	}

	// ---------- 帮助浮层 ----------

	private toggleHelp(anchor: HTMLElement): void {
		if (this.helpEl) {
			this.helpEl.remove();
			this.helpEl = null;
			return;
		}
		const pop = anchor.createDiv({ cls: 'gx-help-pop' });
		pop.createEl('h4', { text: t('help.title') });
		const lines = pop.createDiv({ cls: 'gx-help-lines' });
		for (const key of ['help.orbit', 'help.pan', 'help.ctrlClick', 'help.wasd', 'help.select', 'help.keys', 'help.dblclick'] as const) {
			lines.createDiv({ text: t(key) });
		}
		this.helpEl = pop;
	}

	// ---------- 标签 ----------

	private sizeByLabel(): string {
		const m = this.settings.look.sizeBy;
		return m === 'degree' ? t('sizeBy.degree') : m === 'fileSize' ? t('sizeBy.fileSize') : t('sizeBy.uniform');
	}
	private starfieldLabel(): string {
		return this.settings.showStarfield ? t('look.starfield.on') : t('look.starfield.off');
	}
	private unresolvedLabel(): string {
		return this.settings.showUnresolved ? t('adv.unresolved.on') : t('adv.unresolved.off');
	}
	private orphanLabel(): string {
		return this.settings.showOrphans ? t('adv.orphan.on') : t('adv.orphan.off');
	}
	private tagLabel(): string {
		return this.settings.showTags ? t('adv.tag.on') : t('adv.tag.off');
	}

	refreshAll(): void {
		for (const sl of this.sliders) sl.refresh();
		this.cruiseBtn?.setText(this.settings.cruise ? '●' : '○');
		this.cruiseBtn?.toggleClass('is-on', this.settings.cruise);
		this.unresolvedBtn?.setText(this.unresolvedLabel());
		this.orphanBtn?.setText(this.orphanLabel());
		this.tagBtn?.setText(this.tagLabel());
		this.sizeByBtn?.setText(this.sizeByLabel());
		this.starfieldBtn?.setText(this.starfieldLabel());
		this.buildPresets();
		this.refreshMarkers();
	}

	setTourRunning(on: boolean): void {
		this.tourPlayBtn?.setText(on ? `■ ${t('tour.stop')}` : `▶ ${t('tour.play')}`);
	}

	/** 右边缘拖拽调宽（240–480px），松手持久化 */
	private buildResizer(cb: ControlPanelCallbacks): void {
		const grip = this.root.createDiv({ cls: 'gx-resizer' });
		grip.addEventListener('pointerdown', (e) => {
			e.preventDefault();
			grip.setPointerCapture(e.pointerId);
			const startX = e.clientX;
			const startW = this.root.getBoundingClientRect().width;
			const move = (ev: PointerEvent) => {
				const w = Math.min(Math.max(startW + (ev.clientX - startX), 240), 480);
				this.root.style.width = `${w}px`;
			};
			const up = (ev: PointerEvent) => {
				grip.releasePointerCapture(ev.pointerId);
				grip.removeEventListener('pointermove', move);
				grip.removeEventListener('pointerup', up);
				cb.onPanelWidth(this.root.getBoundingClientRect().width);
			};
			grip.addEventListener('pointermove', move);
			grip.addEventListener('pointerup', up);
		});
	}

	/** 表头语言按钮的短标签：zh 用「中」，其余用大写码（EN/DE/IT/ES/PT） */
	private langLabel(l: Lang): string {
		return l === 'zh' ? '中' : l.toUpperCase();
	}

	/** 语言菜单：自动 + 六语，当前偏好项打勾 */
	private openLangMenu(e: MouseEvent, cb: ControlPanelCallbacks): void {
		const menu = new Menu();
		menu.addItem((i) => i.setTitle(t('set.language.auto')).setChecked(this.settings.language === 'auto').onClick(() => cb.onLanguage('auto')));
		for (const l of LANGS) {
			menu.addItem((i) => i.setTitle(l.name).setChecked(this.settings.language === l.code).onClick(() => cb.onLanguage(l.code)));
		}
		menu.showAtMouseEvent(e);
	}

	setPanelTheme(cls: 'gx-theme-dark' | 'gx-theme-light'): void {
		this.root.removeClass('gx-theme-dark');
		this.root.removeClass('gx-theme-light');
		this.root.addClass(cls);
	}

	dispose(): void {
		this.root.remove();
		this.sliders = [];
		this.secBadges = {};
	}
}
