import { Platform } from 'obsidian';
import type { GalaxySettings } from '../settings';
import { DEFAULT_SETTINGS } from '../settings';
import type { StylePreset } from '../render/stylePresets';
import { STYLE_PRESETS } from '../render/stylePresets';
import type { ColorTheme } from '../render/colorThemes';
import { COLOR_THEMES } from '../render/colorThemes';
import { getLang, t } from '../i18n';
import { drawPresetIcon } from './presetIcons';
import { Slider } from './Slider';

export interface ControlPanelCallbacks {
	onBloom: () => void;
	onPhysics: () => void;
	onLook: () => void;
	onCruise: (on: boolean) => void;
	onCruiseSpeed: () => void;
	onStylePreset: (p: StylePreset) => void;
	onPresetHover: (p: StylePreset) => void;
	onPresetHoverEnd: () => void;
	onSavePreset: () => void;
	onMovePreset: (i: number, dir: -1 | 1) => void;
	onDeletePreset: (i: number) => void;
	onRestoreSection: (group: 'bloom' | 'physics' | 'look') => void;
	onShowUnresolved: (on: boolean) => void;
	onImportColors: () => void;
	onShuffleColors: () => void;
	onColorTheme: (t: ColorTheme) => void;
	onStarfield: (on: boolean) => void;
	onRecenter: () => void;
	onReveal: () => void;
	onShowOrphans: (on: boolean) => void;
	onSizeBy: () => void;
	onQuality: () => void;
	onSearch: () => void;
	onTourToggle: () => void;
	onConnectTwo: () => void;
	onTourSpeed: () => void;
	onSectionToggle: (id: string, open: boolean) => void;
	onLanguage: (lang: 'en' | 'zh') => void;
	onPanelWidth: (w: number) => void;
	onReset: () => void;
	runScenario: (s: 'S1' | 'S2' | 'S3') => void;
}

const SEC = { look: 'look', physics: 'physics', bloom: 'bloom' } as const;
const SECTION_DEFS: { id: string; group: 'look' | 'physics' | 'bloom'; key: Parameters<typeof t>[0] }[] = [
	{ id: SEC.look, group: 'look', key: 'panel.sec.look' },
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
	private sizeByBtn: HTMLButtonElement | null = null;
	private starfieldBtn: HTMLButtonElement | null = null;
	private tourPlayBtn: HTMLButtonElement | null = null;
	private presetHost: HTMLElement | null = null;
	private secBadges: Record<string, { badge: HTMLElement; restore: HTMLElement }> = {};
	private confirmDelId: string | null = null;
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
		const langPill = header.createDiv({ cls: 'gx-lang' });
		const curLang = getLang();
		const zhBtn = langPill.createEl('button', { text: '中' });
		zhBtn.toggleClass('is-on', curLang === 'zh');
		zhBtn.addEventListener('click', () => cb.onLanguage('zh'));
		const enBtn = langPill.createEl('button', { text: 'EN' });
		enBtn.toggleClass('is-on', curLang === 'en');
		enBtn.addEventListener('click', () => cb.onLanguage('en'));
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

		const section = (id: string, key: Parameters<typeof t>[0], withMarker: 'look' | 'physics' | 'bloom' | null) => {
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

		// 外观与配色
		const lookSec = section(SEC.look, 'panel.sec.look', 'look');
		this.sliders.push(
			new Slider(lookSec, { label: t('slider.look.nodeSize'), min: 0.3, max: 2.5, step: 0.05, defaultValue: d.look.nodeSize, get: () => s.look.nodeSize, set: (v) => (s.look.nodeSize = v), fmt: (v) => `${v.toFixed(2)}×`, onInput: () => this.tracked(cb.onLook) }),
			new Slider(lookSec, { label: t('slider.look.linkOpacity'), min: 0, max: 0.6, step: 0.01, defaultValue: d.look.linkOpacity, get: () => s.look.linkOpacity, set: (v) => (s.look.linkOpacity = v), onInput: () => this.tracked(cb.onLook) }),
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
		this.starfieldBtn = sizeRow.createEl('button', { text: this.starfieldLabel() });
		this.starfieldBtn.addEventListener('click', () => {
			s.showStarfield = !s.showStarfield;
			this.starfieldBtn?.setText(this.starfieldLabel());
			this.tracked(() => cb.onStarfield(s.showStarfield));
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
		const advRow = advBody.createDiv({ cls: 'galaxy-panel-row' });
		this.unresolvedBtn = advRow.createEl('button', { text: this.unresolvedLabel() });
		this.unresolvedBtn.addEventListener('click', () => {
			s.showUnresolved = !s.showUnresolved;
			this.unresolvedBtn?.setText(this.unresolvedLabel());
			cb.onShowUnresolved(s.showUnresolved);
		});
		this.orphanBtn = advRow.createEl('button', { text: this.orphanLabel() });
		this.orphanBtn.addEventListener('click', () => {
			s.showOrphans = !s.showOrphans;
			this.orphanBtn?.setText(this.orphanLabel());
			cb.onShowOrphans(s.showOrphans);
		});
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
		const confirming = isMine && this.confirmDelId === p.id;
		// div（非 button）：Obsidian 的 button 默认 inline-flex 居中 + 固定高，会把卡片的多行内容压扁/裁掉；
		// 且自定义卡里嵌 button（排序/删除）在 button 内是非法嵌套。
		const card = grid.createDiv({ cls: 'gx-pcard', attr: { role: 'button', tabindex: '0' } });
		card.toggleClass('is-active', p.id === this.settings.activePreset);
		card.toggleClass('is-confirming', confirming);
		const nameRow = card.createDiv({ cls: 'gx-pcard-n' });
		const icon = nameRow.createSpan({ cls: 'gx-pcard-icon' });
		try {
			drawPresetIcon(icon, isMine ? 'custom' : p.id, themeColor(p.theme));
		} catch {
			/* 图标是装饰，画不出也不影响卡片 */
		}
		nameRow.createSpan({ text: presetName(p) });
		card.createDiv({ cls: 'gx-pcard-s', text: t((isMine ? 'preset.sub.custom' : `preset.sub.${p.id}`) as Parameters<typeof t>[0]) });
		if (isMine) {
			const ops = card.createDiv({ cls: 'gx-mine-ops' });
			if (confirming) {
				ops.createSpan({ cls: 'gx-cd-label', text: t('mine.confirmDel') });
				const ok = ops.createEl('button', { cls: 'gx-ok', text: '✓' });
				ok.addEventListener('click', (e) => {
					e.stopPropagation();
					this.confirmDelId = null;
					this.cb.onDeletePreset(idx);
				});
				const no = ops.createEl('button', { cls: 'gx-no', text: '✕' });
				no.addEventListener('click', (e) => {
					e.stopPropagation();
					this.confirmDelId = null;
					this.buildPresets();
				});
			} else {
				const up = ops.createEl('button', { text: '↑' });
				up.addEventListener('click', (e) => { e.stopPropagation(); this.cb.onMovePreset(idx, -1); });
				const dn = ops.createEl('button', { text: '↓' });
				dn.addEventListener('click', (e) => { e.stopPropagation(); this.cb.onMovePreset(idx, 1); });
				const del = ops.createEl('button', { text: '×' });
				del.addEventListener('click', (e) => { e.stopPropagation(); this.confirmDelId = p.id; this.buildPresets(); });
			}
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
	private sectionClean(group: 'look' | 'physics' | 'bloom'): boolean {
		const p = this.activePresetObj();
		if (!p) return false;
		const s = this.settings;
		if (group === 'bloom') return this.near(s.bloom.strength, p.bloom.strength) && this.near(s.bloom.radius, p.bloom.radius) && this.near(s.bloom.threshold, p.bloom.threshold);
		if (group === 'physics') return (['repel', 'linkDistance', 'linkStrength', 'centerPull', 'flatten', 'coreGravity', 'spiral'] as const).every((k) => this.near(s.physics[k], p.physics[k]));
		return this.near(s.look.nodeSize, p.look.nodeSize) && this.near(s.look.linkOpacity, p.look.linkOpacity) && this.near(s.look.twinkle, p.look.twinkle) && s.look.sizeBy === p.look.sizeBy && s.showStarfield === p.starfield && s.colorTheme === p.theme;
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

	refreshAll(): void {
		for (const sl of this.sliders) sl.refresh();
		this.cruiseBtn?.setText(this.settings.cruise ? '●' : '○');
		this.cruiseBtn?.toggleClass('is-on', this.settings.cruise);
		this.unresolvedBtn?.setText(this.unresolvedLabel());
		this.orphanBtn?.setText(this.orphanLabel());
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
