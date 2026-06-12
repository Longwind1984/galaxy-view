import type { GalaxySettings } from '../settings';
import { DEFAULT_SETTINGS } from '../settings';
import { Slider } from './Slider';

export interface ControlPanelCallbacks {
	onBloom: () => void;
	onPhysics: () => void;
	onLook: () => void;
	onCruise: (on: boolean) => void;
	onPreset: () => void;
	onShowUnresolved: (on: boolean) => void;
	onImportColors: () => void;
	onSearch: () => void;
	onReset: () => void;
	runScenario: (s: 'S1' | 'S2' | 'S3') => void;
}

/** 画布左上角的参数面板。滑杆为 Lightroom 式（默认值居中 + 限位可视化 + 双击回默认）。 */
export class ControlPanel {
	readonly statsEl: HTMLElement;
	private root: HTMLElement;
	private sliders: Slider[] = [];
	private cruiseBtn: HTMLButtonElement | null = null;
	private presetBtn: HTMLButtonElement | null = null;
	private unresolvedBtn: HTMLButtonElement | null = null;

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
		const addSection = (title: string) => {
			const sec = body.createDiv({ cls: 'galaxy-panel-section' });
			sec.createDiv({ cls: 'galaxy-panel-section-title', text: title });
			return sec;
		};

		const bloomSec = addSection('辉光');
		this.sliders.push(
			new Slider(bloomSec, { label: '强度', min: 0, max: 2.5, step: 0.05, defaultValue: d.bloom.strength, get: () => s.bloom.strength, set: (v) => (s.bloom.strength = v), onInput: cb.onBloom }),
			new Slider(bloomSec, { label: '扩散', min: 0, max: 1.2, step: 0.05, defaultValue: d.bloom.radius, get: () => s.bloom.radius, set: (v) => (s.bloom.radius = v), onInput: cb.onBloom }),
			new Slider(bloomSec, { label: '阈值', min: 0, max: 1, step: 0.05, defaultValue: d.bloom.threshold, get: () => s.bloom.threshold, set: (v) => (s.bloom.threshold = v), onInput: cb.onBloom }),
		);

		const phySec = addSection('力学');
		this.sliders.push(
			new Slider(phySec, { label: '斥力', min: 20, max: 400, step: 5, defaultValue: d.physics.repel, get: () => s.physics.repel, set: (v) => (s.physics.repel = v), fmt: (v) => String(Math.round(v)), onInput: cb.onPhysics }),
			new Slider(phySec, { label: '链接距离', min: 20, max: 200, step: 5, defaultValue: d.physics.linkDistance, get: () => s.physics.linkDistance, set: (v) => (s.physics.linkDistance = v), fmt: (v) => String(Math.round(v)), onInput: cb.onPhysics }),
			new Slider(phySec, { label: '链接强度', min: 0.1, max: 2, step: 0.1, defaultValue: d.physics.linkStrength, get: () => s.physics.linkStrength, set: (v) => (s.physics.linkStrength = v), fmt: (v) => `${v.toFixed(1)}×`, onInput: cb.onPhysics }),
			new Slider(phySec, { label: '向心力', min: 0, max: 0.2, step: 0.005, defaultValue: d.physics.centerPull, get: () => s.physics.centerPull, set: (v) => (s.physics.centerPull = v), fmt: (v) => v.toFixed(3), onInput: cb.onPhysics }),
		);

		const lookSec = addSection('外观');
		this.sliders.push(
			new Slider(lookSec, { label: '节点大小', min: 0.3, max: 2.5, step: 0.05, defaultValue: d.look.nodeSize, get: () => s.look.nodeSize, set: (v) => (s.look.nodeSize = v), fmt: (v) => `${v.toFixed(2)}×`, onInput: cb.onLook }),
			new Slider(lookSec, { label: '链接透明度', min: 0.02, max: 0.6, step: 0.01, defaultValue: d.look.linkOpacity, get: () => s.look.linkOpacity, set: (v) => (s.look.linkOpacity = v), onInput: cb.onLook }),
		);

		const row1 = body.createDiv({ cls: 'galaxy-panel-row' });
		const searchBtn = row1.createEl('button', { text: '搜索' });
		searchBtn.addEventListener('click', cb.onSearch);
		this.cruiseBtn = row1.createEl('button', { text: s.cruise ? '巡航：开' : '巡航：关' });
		this.cruiseBtn.addEventListener('click', () => {
			s.cruise = !s.cruise;
			this.cruiseBtn?.setText(s.cruise ? '巡航：开' : '巡航：关');
			cb.onCruise(s.cruise);
		});

		const row2 = body.createDiv({ cls: 'galaxy-panel-row' });
		this.presetBtn = row2.createEl('button', { text: this.presetLabel() });
		this.presetBtn.addEventListener('click', () => {
			s.preset = s.preset === 'deep-space' ? 'adaptive' : 'deep-space';
			this.presetBtn?.setText(this.presetLabel());
			cb.onPreset();
		});
		const resetBtn = row2.createEl('button', { text: '重置默认' });
		resetBtn.addEventListener('click', () => {
			cb.onReset();
			this.refreshAll();
		});

		const row3 = body.createDiv({ cls: 'galaxy-panel-row' });
		this.unresolvedBtn = row3.createEl('button', { text: s.showUnresolved ? '未解析：显示' : '未解析：隐藏' });
		this.unresolvedBtn.addEventListener('click', () => {
			s.showUnresolved = !s.showUnresolved;
			this.unresolvedBtn?.setText(s.showUnresolved ? '未解析：显示' : '未解析：隐藏');
			cb.onShowUnresolved(s.showUnresolved);
		});
		const importBtn = row3.createEl('button', { text: '导入二维图谱配色' });
		importBtn.addEventListener('click', cb.onImportColors);

		const help = body.createEl('details', { cls: 'galaxy-panel-dev' });
		help.createEl('summary', { text: '操作说明' });
		const helpBody = help.createDiv({ cls: 'galaxy-panel-help' });
		for (const line of [
			'左键拖拽 = 环绕 · 滚轮 = 缩放',
			'右键拖 / Ctrl(⌘)+左键拖 = 平移',
			'WASD = 平飞 · Q/E = 升降 · Shift = 加速',
			'点击节点 = 选中并飞过去 · ESC = 取消',
			'F = 飞向选中 · R = 回总览',
			'双击滑杆 = 回默认值',
		]) {
			helpBody.createDiv({ text: line });
		}

		const dev = body.createEl('details', { cls: 'galaxy-panel-dev' });
		dev.createEl('summary', { text: '基准（开发）' });
		const devRow = dev.createDiv({ cls: 'galaxy-panel-row' });
		for (const sc of ['S1', 'S2', 'S3'] as const) {
			const b = devRow.createEl('button', { text: sc });
			b.addEventListener('click', () => cb.runScenario(sc));
		}
	}

	private presetLabel(): string {
		return this.settings.preset === 'deep-space' ? '视觉：深空' : '视觉：随主题';
	}

	refreshAll(): void {
		for (const sl of this.sliders) sl.refresh();
		this.cruiseBtn?.setText(this.settings.cruise ? '巡航：开' : '巡航：关');
		this.presetBtn?.setText(this.presetLabel());
		this.unresolvedBtn?.setText(this.settings.showUnresolved ? '未解析：显示' : '未解析：隐藏');
	}

	setPanelTheme(cls: 'gx-theme-dark' | 'gx-theme-light'): void {
		this.root.removeClass('gx-theme-dark');
		this.root.removeClass('gx-theme-light');
		this.root.addClass(cls);
	}

	dispose(): void {
		this.root.remove();
		this.sliders = [];
	}
}
