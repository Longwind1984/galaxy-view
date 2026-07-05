import type { GalaxySettings } from '../settings';
import { DEFAULT_SETTINGS } from '../settings';
import type { StylePreset } from '../render/stylePresets';
import { STYLE_PRESETS } from '../render/stylePresets';
import type { ColorTheme } from '../render/colorThemes';
import { COLOR_THEMES } from '../render/colorThemes';
import { Slider } from './Slider';
import { t } from '../i18n';

export interface ControlPanelCallbacks {
	onBloom: () => void;
	onPhysics: () => void;
	onLook: () => void;
	onCruise: (on: boolean) => void;
	onCruiseSpeed: () => void;
	onPreset: () => void;
	onStylePreset: (p: StylePreset) => void;
	onShowUnresolved: (on: boolean) => void;
	onImportColors: () => void;
	onShuffleColors: () => void;
	onColorTheme: (t: ColorTheme) => void;
	onRecenter: () => void;
	onReveal: () => void;
	onShowOrphans: (on: boolean) => void;
	onSizeBy: () => void;
	onQuality: () => void;
	onSearch: () => void;
	onReset: () => void;
	runScenario: (s: 'S1' | 'S2' | 'S3') => void;
}

/**
 * 控制面板 v3（G2 反馈：参数多了之后的信息架构）：
 * 常用置顶（搜索/巡航/风格 chips），细调参数收进折叠分区，默认全收 → 面板首屏极简。
 */
export class ControlPanel {
	readonly statsEl: HTMLElement;
	private root: HTMLElement;
	private sliders: Slider[] = [];
	private cruiseBtn: HTMLButtonElement | null = null;
	private presetBtn: HTMLButtonElement | null = null;
	private unresolvedBtn: HTMLButtonElement | null = null;
	private orphanBtn: HTMLButtonElement | null = null;
	private sizeByBtn: HTMLButtonElement | null = null;
	private qualityBtn: HTMLButtonElement | null = null;
	private styleChips: HTMLButtonElement[] = [];

	constructor(
		parent: HTMLElement,
		private settings: GalaxySettings,
		cb: ControlPanelCallbacks,
	) {
		this.root = parent.createDiv({ cls: 'galaxy-panel gx-theme-dark' });

		const header = this.root.createDiv({ cls: 'galaxy-panel-header' });
		this.statsEl = header.createDiv({ cls: 'galaxy-panel-stats', text: '…' });
		const collapseBtn = header.createEl('button', { cls: 'galaxy-panel-collapse', text: '−' });
		const body = this.root.createDiv({ cls: 'galaxy-panel-body' });
		collapseBtn.addEventListener('click', () => {
			const hidden = body.hasClass('is-hidden');
			body.toggleClass('is-hidden', !hidden);
			collapseBtn.setText(hidden ? '−' : '+');
		});

		const s = this.settings;
		const d = DEFAULT_SETTINGS;

		// —— 常用区 ——
		const row1 = body.createDiv({ cls: 'galaxy-panel-row' });
		const searchBtn = row1.createEl('button', { text: t.panel.search });
		searchBtn.addEventListener('click', cb.onSearch);
		const recenterBtn = row1.createEl('button', { text: t.panel.recenter });
		recenterBtn.addEventListener('click', cb.onRecenter);
		const row1b = body.createDiv({ cls: 'galaxy-panel-row' });
		this.cruiseBtn = row1b.createEl('button', { text: s.cruise ? t.panel.cruiseOn : t.panel.cruiseOff });
		this.cruiseBtn.addEventListener('click', () => {
			s.cruise = !s.cruise;
			this.cruiseBtn?.setText(s.cruise ? t.panel.cruiseOn : t.panel.cruiseOff);
			cb.onCruise(s.cruise);
		});
		const revealBtn = row1b.createEl('button', { text: t.panel.reveal });
		revealBtn.addEventListener('click', cb.onReveal);

		const chipRow = body.createDiv({ cls: 'gx-chips' });
		for (const preset of STYLE_PRESETS) {
			const chip = chipRow.createEl('button', { cls: 'gx-chip', text: t.presets[preset.id] ?? preset.name });
			chip.addEventListener('click', () => {
				cb.onStylePreset(preset);
				this.refreshAll();
				this.markActiveChip(preset.id);
			});
			chip.dataset['presetId'] = preset.id;
			this.styleChips.push(chip);
		}

		// —— 折叠分区 ——
		const section = (title: string, open = false) => {
			const det = body.createEl('details', { cls: 'gx-section' });
			if (open) det.setAttribute('open', '');
			det.createEl('summary', { text: title });
			return det.createDiv({ cls: 'gx-section-body' });
		};

		const bloomSec = section(t.panel.secBloom);
		this.sliders.push(
			new Slider(bloomSec, { label: t.panel.strength, min: 0, max: 2.5, step: 0.05, defaultValue: d.bloom.strength, get: () => s.bloom.strength, set: (v) => (s.bloom.strength = v), onInput: cb.onBloom }),
			new Slider(bloomSec, { label: t.panel.spread, min: 0, max: 1.2, step: 0.05, defaultValue: d.bloom.radius, get: () => s.bloom.radius, set: (v) => (s.bloom.radius = v), onInput: cb.onBloom }),
			new Slider(bloomSec, { label: t.panel.threshold, min: 0, max: 1, step: 0.05, defaultValue: d.bloom.threshold, get: () => s.bloom.threshold, set: (v) => (s.bloom.threshold = v), onInput: cb.onBloom }),
		);

		const phySec = section(t.panel.secPhysics);
		this.sliders.push(
			new Slider(phySec, { label: t.panel.repel, min: 20, max: 400, step: 5, defaultValue: d.physics.repel, get: () => s.physics.repel, set: (v) => (s.physics.repel = v), fmt: (v) => String(Math.round(v)), onInput: cb.onPhysics }),
			new Slider(phySec, { label: t.panel.linkDistance, min: 20, max: 200, step: 5, defaultValue: d.physics.linkDistance, get: () => s.physics.linkDistance, set: (v) => (s.physics.linkDistance = v), fmt: (v) => String(Math.round(v)), onInput: cb.onPhysics }),
			new Slider(phySec, { label: t.panel.linkStrength, min: 0.1, max: 2, step: 0.1, defaultValue: d.physics.linkStrength, get: () => s.physics.linkStrength, set: (v) => (s.physics.linkStrength = v), fmt: (v) => `${v.toFixed(1)}×`, onInput: cb.onPhysics }),
			new Slider(phySec, { label: t.panel.centerPull, min: 0, max: 0.2, step: 0.005, defaultValue: d.physics.centerPull, get: () => s.physics.centerPull, set: (v) => (s.physics.centerPull = v), fmt: (v) => v.toFixed(3), onInput: cb.onPhysics }),
			new Slider(phySec, { label: t.panel.flatten, min: 0, max: 0.8, step: 0.02, defaultValue: d.physics.flatten, get: () => s.physics.flatten, set: (v) => (s.physics.flatten = v), onInput: cb.onPhysics }),
		);

		const lookSec = section(t.panel.secLook);
		this.sliders.push(
			new Slider(lookSec, { label: t.panel.nodeSize, min: 0.3, max: 2.5, step: 0.05, defaultValue: d.look.nodeSize, get: () => s.look.nodeSize, set: (v) => (s.look.nodeSize = v), fmt: (v) => `${v.toFixed(2)}×`, onInput: cb.onLook }),
			new Slider(lookSec, { label: t.panel.linkOpacity, min: 0, max: 0.6, step: 0.01, defaultValue: d.look.linkOpacity, get: () => s.look.linkOpacity, set: (v) => (s.look.linkOpacity = v), onInput: cb.onLook }),
			new Slider(lookSec, { label: t.panel.twinkle, min: 0, max: 2, step: 0.1, defaultValue: d.look.twinkle, get: () => s.look.twinkle, set: (v) => (s.look.twinkle = v), fmt: (v) => (v < 0.05 ? t.panel.twinkleOff : `${v.toFixed(1)}`), onInput: cb.onLook }),
		);
		const sizeRow = lookSec.createDiv({ cls: 'galaxy-panel-row' });
		this.sizeByBtn = sizeRow.createEl('button', { text: this.sizeByLabel() });
		this.sizeByBtn.addEventListener('click', () => {
			const order: typeof s.look.sizeBy[] = ['degree', 'fileSize', 'uniform'];
			s.look.sizeBy = order[(order.indexOf(s.look.sizeBy) + 1) % order.length] ?? 'degree';
			this.sizeByBtn?.setText(this.sizeByLabel());
			cb.onSizeBy();
		});

		const themeSel = lookSec.createEl('select', { cls: 'gx-theme-select' });
		const customOpt = themeSel.createEl('option', { text: t.panel.themePlaceholder, value: '' });
		customOpt.disabled = true;
		for (const theme of COLOR_THEMES) themeSel.createEl('option', { text: t.themes[theme.id] ?? theme.name, value: theme.id });
		themeSel.value = COLOR_THEMES.some((t) => t.id === s.colorTheme) ? s.colorTheme : '';
		if (!themeSel.value) customOpt.selected = true;
		themeSel.addEventListener('change', () => {
			const t = COLOR_THEMES.find((x) => x.id === themeSel.value);
			if (t) cb.onColorTheme(t);
		});

		const colorRow = lookSec.createDiv({ cls: 'galaxy-panel-row' });
		const importBtn = colorRow.createEl('button', { text: t.panel.importColors });
		importBtn.addEventListener('click', () => {
			cb.onImportColors();
			customOpt.selected = true;
		});
		const shuffleBtn = colorRow.createEl('button', { text: t.panel.shuffleColors });
		shuffleBtn.addEventListener('click', () => {
			cb.onShuffleColors();
			customOpt.selected = true;
		});
		const presetRow = lookSec.createDiv({ cls: 'galaxy-panel-row' });
		this.presetBtn = presetRow.createEl('button', { text: this.presetLabel() });
		this.presetBtn.addEventListener('click', () => {
			s.preset = s.preset === 'deep-space' ? 'adaptive' : 'deep-space';
			this.presetBtn?.setText(this.presetLabel());
			cb.onPreset();
		});

		const cruiseSec = section(t.panel.secCruise);
		this.sliders.push(
			new Slider(cruiseSec, { label: t.panel.speed, min: 0.2, max: 3, step: 0.1, defaultValue: d.cruiseSpeed, get: () => s.cruiseSpeed, set: (v) => (s.cruiseSpeed = v), fmt: (v) => `${v.toFixed(1)}×`, onInput: cb.onCruiseSpeed }),
		);

		const advSec = section(t.panel.secAdvanced);
		const advRow = advSec.createDiv({ cls: 'galaxy-panel-row' });
		this.unresolvedBtn = advRow.createEl('button', { text: s.showUnresolved ? t.panel.unresolvedShow : t.panel.unresolvedHide });
		this.unresolvedBtn.addEventListener('click', () => {
			s.showUnresolved = !s.showUnresolved;
			this.unresolvedBtn?.setText(s.showUnresolved ? t.panel.unresolvedShow : t.panel.unresolvedHide);
			cb.onShowUnresolved(s.showUnresolved);
		});
		this.orphanBtn = advRow.createEl('button', { text: s.showOrphans ? t.panel.orphansShow : t.panel.orphansHide });
		this.orphanBtn.addEventListener('click', () => {
			s.showOrphans = !s.showOrphans;
			this.orphanBtn?.setText(s.showOrphans ? t.panel.orphansShow : t.panel.orphansHide);
			cb.onShowOrphans(s.showOrphans);
		});
		const advRow2 = advSec.createDiv({ cls: 'galaxy-panel-row' });
		this.qualityBtn = advRow2.createEl('button', { text: this.qualityLabel() });
		this.qualityBtn.addEventListener('click', () => {
			const order: typeof s.qualityOverride[] = ['auto', 'high', 'low', 'mobile'];
			s.qualityOverride = order[(order.indexOf(s.qualityOverride) + 1) % order.length] ?? 'auto';
			this.qualityBtn?.setText(this.qualityLabel());
			cb.onQuality();
		});
		const resetBtn = advRow2.createEl('button', { text: t.panel.reset });
		resetBtn.addEventListener('click', () => {
			cb.onReset();
			this.refreshAll();
		});
		const helpBody = advSec.createDiv({ cls: 'galaxy-panel-help' });
		for (const line of t.panel.help) {
			helpBody.createDiv({ text: line });
		}
		if (__GALAXY_DEV__) {
			const devRow = advSec.createDiv({ cls: 'galaxy-panel-row' });
			for (const sc of ['S1', 'S2', 'S3'] as const) {
				const b = devRow.createEl('button', { text: sc });
				b.addEventListener('click', () => cb.runScenario(sc));
			}
		}
	}

	private presetLabel(): string {
		return this.settings.preset === 'deep-space' ? t.panel.presetDeepSpace : t.panel.presetAdaptive;
	}

	private sizeByLabel(): string {
		const m = this.settings.look.sizeBy;
		return m === 'degree' ? t.panel.sizeByDegree : m === 'fileSize' ? t.panel.sizeByFileSize : t.panel.sizeByUniform;
	}

	private qualityLabel(): string {
		const q = this.settings.qualityOverride;
		return q === 'auto' ? t.panel.qualityAuto : q === 'high' ? t.panel.qualityHigh : q === 'low' ? t.panel.qualityLow : t.panel.qualityMobile;
	}

	private markActiveChip(id: string): void {
		for (const chip of this.styleChips) chip.toggleClass('is-active', chip.dataset['presetId'] === id);
	}

	refreshAll(): void {
		for (const sl of this.sliders) sl.refresh();
		this.cruiseBtn?.setText(this.settings.cruise ? t.panel.cruiseOn : t.panel.cruiseOff);
		this.presetBtn?.setText(this.presetLabel());
		this.unresolvedBtn?.setText(this.settings.showUnresolved ? t.panel.unresolvedShow : t.panel.unresolvedHide);
		this.orphanBtn?.setText(this.settings.showOrphans ? t.panel.orphansShow : t.panel.orphansHide);
		this.sizeByBtn?.setText(this.sizeByLabel());
		this.qualityBtn?.setText(this.qualityLabel());
	}

	setPanelTheme(cls: 'gx-theme-dark' | 'gx-theme-light'): void {
		this.root.removeClass('gx-theme-dark');
		this.root.removeClass('gx-theme-light');
		this.root.addClass(cls);
	}

	dispose(): void {
		this.root.remove();
		this.sliders = [];
		this.styleChips = [];
	}
}
