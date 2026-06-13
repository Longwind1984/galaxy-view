import type { GalaxySettings } from '../settings';
import { DEFAULT_SETTINGS } from '../settings';
import type { StylePreset } from '../render/stylePresets';
import { STYLE_PRESETS } from '../render/stylePresets';
import type { ColorTheme } from '../render/colorThemes';
import { COLOR_THEMES } from '../render/colorThemes';
import { Slider } from './Slider';

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
		const searchBtn = row1.createEl('button', { text: '搜索' });
		searchBtn.addEventListener('click', cb.onSearch);
		const recenterBtn = row1.createEl('button', { text: '回中心' });
		recenterBtn.addEventListener('click', cb.onRecenter);
		const row1b = body.createDiv({ cls: 'galaxy-panel-row' });
		this.cruiseBtn = row1b.createEl('button', { text: s.cruise ? '巡航：开' : '巡航：关' });
		this.cruiseBtn.addEventListener('click', () => {
			s.cruise = !s.cruise;
			this.cruiseBtn?.setText(s.cruise ? '巡航：开' : '巡航：关');
			cb.onCruise(s.cruise);
		});
		const revealBtn = row1b.createEl('button', { text: '创世动画' });
		revealBtn.addEventListener('click', cb.onReveal);

		const chipRow = body.createDiv({ cls: 'gx-chips' });
		for (const preset of STYLE_PRESETS) {
			const chip = chipRow.createEl('button', { cls: 'gx-chip', text: preset.name });
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

		const bloomSec = section('辉光');
		this.sliders.push(
			new Slider(bloomSec, { label: '强度', min: 0, max: 2.5, step: 0.05, defaultValue: d.bloom.strength, get: () => s.bloom.strength, set: (v) => (s.bloom.strength = v), onInput: cb.onBloom }),
			new Slider(bloomSec, { label: '扩散', min: 0, max: 1.2, step: 0.05, defaultValue: d.bloom.radius, get: () => s.bloom.radius, set: (v) => (s.bloom.radius = v), onInput: cb.onBloom }),
			new Slider(bloomSec, { label: '阈值', min: 0, max: 1, step: 0.05, defaultValue: d.bloom.threshold, get: () => s.bloom.threshold, set: (v) => (s.bloom.threshold = v), onInput: cb.onBloom }),
		);

		const phySec = section('力学');
		this.sliders.push(
			new Slider(phySec, { label: '斥力', min: 20, max: 400, step: 5, defaultValue: d.physics.repel, get: () => s.physics.repel, set: (v) => (s.physics.repel = v), fmt: (v) => String(Math.round(v)), onInput: cb.onPhysics }),
			new Slider(phySec, { label: '链接距离', min: 20, max: 200, step: 5, defaultValue: d.physics.linkDistance, get: () => s.physics.linkDistance, set: (v) => (s.physics.linkDistance = v), fmt: (v) => String(Math.round(v)), onInput: cb.onPhysics }),
			new Slider(phySec, { label: '链接强度', min: 0.1, max: 2, step: 0.1, defaultValue: d.physics.linkStrength, get: () => s.physics.linkStrength, set: (v) => (s.physics.linkStrength = v), fmt: (v) => `${v.toFixed(1)}×`, onInput: cb.onPhysics }),
			new Slider(phySec, { label: '向心力', min: 0, max: 0.2, step: 0.005, defaultValue: d.physics.centerPull, get: () => s.physics.centerPull, set: (v) => (s.physics.centerPull = v), fmt: (v) => v.toFixed(3), onInput: cb.onPhysics }),
			new Slider(phySec, { label: '扁平度', min: 0, max: 0.8, step: 0.02, defaultValue: d.physics.flatten, get: () => s.physics.flatten, set: (v) => (s.physics.flatten = v), onInput: cb.onPhysics }),
		);

		const lookSec = section('外观与配色');
		this.sliders.push(
			new Slider(lookSec, { label: '节点大小', min: 0.3, max: 2.5, step: 0.05, defaultValue: d.look.nodeSize, get: () => s.look.nodeSize, set: (v) => (s.look.nodeSize = v), fmt: (v) => `${v.toFixed(2)}×`, onInput: cb.onLook }),
			new Slider(lookSec, { label: '链接透明度', min: 0, max: 0.6, step: 0.01, defaultValue: d.look.linkOpacity, get: () => s.look.linkOpacity, set: (v) => (s.look.linkOpacity = v), onInput: cb.onLook }),
			new Slider(lookSec, { label: '星星眨眼', min: 0, max: 2, step: 0.1, defaultValue: d.look.twinkle, get: () => s.look.twinkle, set: (v) => (s.look.twinkle = v), fmt: (v) => (v < 0.05 ? '关' : `${v.toFixed(1)}`), onInput: cb.onLook }),
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
		const customOpt = themeSel.createEl('option', { text: '配色主题…', value: '' });
		customOpt.disabled = true;
		for (const t of COLOR_THEMES) themeSel.createEl('option', { text: t.name, value: t.id });
		themeSel.value = COLOR_THEMES.some((t) => t.id === s.colorTheme) ? s.colorTheme : '';
		if (!themeSel.value) customOpt.selected = true;
		themeSel.addEventListener('change', () => {
			const t = COLOR_THEMES.find((x) => x.id === themeSel.value);
			if (t) cb.onColorTheme(t);
		});

		const colorRow = lookSec.createDiv({ cls: 'galaxy-panel-row' });
		const importBtn = colorRow.createEl('button', { text: '导入二维配色' });
		importBtn.addEventListener('click', () => {
			cb.onImportColors();
			customOpt.selected = true;
		});
		const shuffleBtn = colorRow.createEl('button', { text: '配色洗牌' });
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

		const cruiseSec = section('巡航');
		this.sliders.push(
			new Slider(cruiseSec, { label: '速度', min: 0.2, max: 3, step: 0.1, defaultValue: d.cruiseSpeed, get: () => s.cruiseSpeed, set: (v) => (s.cruiseSpeed = v), fmt: (v) => `${v.toFixed(1)}×`, onInput: cb.onCruiseSpeed }),
		);

		const advSec = section('高级');
		const advRow = advSec.createDiv({ cls: 'galaxy-panel-row' });
		this.unresolvedBtn = advRow.createEl('button', { text: s.showUnresolved ? '未解析：显示' : '未解析：隐藏' });
		this.unresolvedBtn.addEventListener('click', () => {
			s.showUnresolved = !s.showUnresolved;
			this.unresolvedBtn?.setText(s.showUnresolved ? '未解析：显示' : '未解析：隐藏');
			cb.onShowUnresolved(s.showUnresolved);
		});
		this.orphanBtn = advRow.createEl('button', { text: s.showOrphans ? '孤儿：显示' : '孤儿：隐藏' });
		this.orphanBtn.addEventListener('click', () => {
			s.showOrphans = !s.showOrphans;
			this.orphanBtn?.setText(s.showOrphans ? '孤儿：显示' : '孤儿：隐藏');
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
		const resetBtn = advRow2.createEl('button', { text: '重置默认' });
		resetBtn.addEventListener('click', () => {
			cb.onReset();
			this.refreshAll();
		});
		const helpBody = advSec.createDiv({ cls: 'galaxy-panel-help' });
		for (const line of [
			'左键拖 = 环绕 · 滚轮 = 缩放',
			'右键拖 / ⌘或⇧+左键拖 = 平移',
			'（macOS 的 Ctrl+点击被系统当右键）',
			'WASD = 平飞 · Q/E = 升降 · Shift = 加速',
			'点击节点 = 选中飞行并环绕 · ESC = 取消',
			'F = 飞向选中 · R = 回总览',
			'双击滑杆 = 回默认值',
		]) {
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
		return this.settings.preset === 'deep-space' ? '视觉：深空' : '视觉：随主题';
	}

	private sizeByLabel(): string {
		const m = this.settings.look.sizeBy;
		return m === 'degree' ? '大小：链接数' : m === 'fileSize' ? '大小：文档量' : '大小：一致';
	}

	private qualityLabel(): string {
		const q = this.settings.qualityOverride;
		return q === 'auto' ? '画质：自动' : q === 'high' ? '画质：高' : q === 'low' ? '画质：低' : '画质：移动模拟';
	}

	private markActiveChip(id: string): void {
		for (const chip of this.styleChips) chip.toggleClass('is-active', chip.dataset['presetId'] === id);
	}

	refreshAll(): void {
		for (const sl of this.sliders) sl.refresh();
		this.cruiseBtn?.setText(this.settings.cruise ? '巡航：开' : '巡航：关');
		this.presetBtn?.setText(this.presetLabel());
		this.unresolvedBtn?.setText(this.settings.showUnresolved ? '未解析：显示' : '未解析：隐藏');
		this.orphanBtn?.setText(this.settings.showOrphans ? '孤儿：显示' : '孤儿：隐藏');
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
