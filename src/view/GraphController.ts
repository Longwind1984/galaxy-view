import type { App } from 'obsidian';
import { Notice, debounce } from 'obsidian';
import { Spherical, Vector3 } from 'three';
import type { BenchResult } from '../types';
import type { GalaxySettings } from '../settings';
import { DEFAULT_SETTINGS, toLayoutParams } from '../settings';
import { readGraphColorGroups } from '../settings/graphJsonImport';
import type { ColorTheme } from '../render/colorThemes';
import { GraphStore } from '../data/GraphStore';
import { seedRadius } from '../data/seed';
import type { LayoutEngine } from '../layout/LayoutEngine';
import { MainThreadForceLayout } from '../layout/MainThreadForceLayout';
import { WorkerForceLayout } from '../layout/WorkerForceLayout';
import { AggregateRenderer } from '../render/AggregateRenderer';
import { makeNodeColorFn, fallbackColorFn } from '../render/palette';
import { DAYLIGHT, DEEP_SPACE } from '../render/presets';
import { CameraDirector } from '../interactions/CameraDirector';
import { ControlPanel } from '../overlay/ControlPanel';
import { OverlayManager } from '../overlay/OverlayManager';
import { NodeSearchModal } from './SearchModal';
import { collectFrames, observeLongTasks, writeBenchResult, sleep } from '../bench/bench';

const WARM_CACHE_MIN_COVERAGE = 0.8;
const ESTABLISHING_MS = 3200;

/**
 * 唯一的组装点：Store → Layout → Renderer → Director → Overlay → Panel。
 * 自有 rAF 循环：布局热时每帧 1 tick；沉降后零上传。
 */
export class GraphController {
	readonly store: GraphStore;
	private layout: LayoutEngine = new WorkerForceLayout();
	private renderer: AggregateRenderer | null = null;
	private director: CameraDirector | null = null;
	private overlay: OverlayManager | null = null;
	private panel: ControlPanel | null = null;

	private rafId = 0;
	private lastNow = 0;
	private paused = false;
	private visible = true;
	private benchMode = false;
	private benchRunning = false;
	private selected = -1;
	private graphRadius = 200;
	private wasSettled = false;
	private shot: { t0: number; durMs: number; fromBloom: number } | null = null;
	private maskEl: HTMLElement | null = null;

	private hudFrames: number[] = [];
	private intersection: IntersectionObserver | null = null;
	private disposeFns: (() => void)[] = [];
	private saveSoon: () => void;

	constructor(
		private app: App,
		private contentEl: HTMLElement,
		private settings: GalaxySettings,
		saveSettings: () => void,
	) {
		this.store = new GraphStore(app);
		this.saveSoon = debounce(saveSettings, 800, true);
	}

	get counts(): { nodes: number; links: number } {
		return { nodes: this.store.data.nodes.length, links: this.store.data.links.length };
	}

	async start(): Promise<void> {
		await this.store.ensureCacheReady();
		this.store.init(this.settings.showUnresolved, this.settings.showOrphans, () => this.onDataChanged());
		this.store.rebuild(false);

		// 暖启动：用上次沉降坐标覆盖种子 → 重开即成形
		const coverage = this.applyPositionCache();
		const warm = coverage >= WARM_CACHE_MIN_COVERAGE;

		const container = this.contentEl.createDiv({ cls: 'galaxy-view-canvas' });
		this.graphRadius = seedRadius(this.store.data.nodes.length) * 1.6;
		const renderer = new AggregateRenderer(container, this.graphRadius);
		this.renderer = renderer;
		renderer.setColorFn(
			this.settings.colorGroups.length > 0 ? makeNodeColorFn(this.settings.colorGroups) : fallbackColorFn,
		);
		renderer.setData(this.store.data, this.store.positions);
		this.initLayout(warm ? 0.06 : 1);

		this.director = new CameraDirector(renderer.camera, renderer.renderer.domElement, {
			onFlyToSelected: () => this.flyToSelected(),
			onResetView: () => this.recenter(),
		});

		this.overlay = new OverlayManager(this.contentEl, this.app, renderer, {
			openNote: (id) => void this.app.workspace.openLinkText(id, '', true),
			focusNode: (i) => this.selectNode(i, true),
		});
		this.overlay.setData(this.store.data, this.graphRadius);

		this.applySettings();
		this.applyPreset();
		this.buildPanel();
		this.bindPicking(renderer.renderer.domElement);
		this.bindVisibility();
		this.resize();

		// 首次导入 2D 配色（仅当从未导入过）
		if (this.settings.colorGroups.length === 0) void this.importColors(false);

		// 开场：暖启动走「拉出式」开场镜头；冷启动直接看星系成形（本身就是剧场）
		if (warm) this.playEstablishing();
		else this.director.setInitialFraming(this.graphRadius);

		this.lastNow = performance.now();
		const loop = (now: number) => {
			const deltaS = Math.min((now - this.lastNow) / 1000, 0.1);
			this.lastNow = now;
			if (!this.paused) {
				if (this.layout.step()) this.renderer?.updatePositions();
				this.checkSettled();
				if (!this.benchMode) this.director?.update(now, deltaS);
				this.stepShot(now);
				this.renderer?.render(deltaS);
				const { clientWidth: w, clientHeight: h } = this.contentEl;
				this.overlay?.update(w, h);
			}
			this.updateHud(now);
			this.rafId = window.requestAnimationFrame(loop);
		};
		this.rafId = window.requestAnimationFrame(loop);
	}

	resize(): void {
		const { clientWidth: w, clientHeight: h } = this.contentEl;
		this.renderer?.resize(w, h);
	}

	// ---------- 暖启动与开场镜头 ----------

	private applyPositionCache(): number {
		const cache = this.settings.positionCache;
		const nodes = this.store.data.nodes;
		if (nodes.length === 0) return 0;
		let hits = 0;
		nodes.forEach((n, i) => {
			const p = cache[n.id];
			if (!p) return;
			this.store.positions[i * 3] = p[0];
			this.store.positions[i * 3 + 1] = p[1];
			this.store.positions[i * 3 + 2] = p[2];
			hits++;
		});
		return hits / nodes.length;
	}

	private checkSettled(): void {
		const settled = this.layout.isSettled();
		if (settled && !this.wasSettled) {
			// 沉降时刻：写暖启动缓存（坐标取整 1 位小数，控制 data.json 体积）
			const cache: Record<string, [number, number, number]> = {};
			const pos = this.store.positions;
			this.store.data.nodes.forEach((n, i) => {
				cache[n.id] = [
					Math.round((pos[i * 3] ?? 0) * 10) / 10,
					Math.round((pos[i * 3 + 1] ?? 0) * 10) / 10,
					Math.round((pos[i * 3 + 2] ?? 0) * 10) / 10,
				];
			});
			this.settings.positionCache = cache;
			this.saveSoon();
		}
		this.wasSettled = settled;
	}

	private playEstablishing(): void {
		const renderer = this.renderer;
		const director = this.director;
		if (!renderer || !director) return;
		this.maskEl = this.contentEl.createDiv({ cls: 'gx-mask' });
		this.maskEl.createDiv({ cls: 'gx-mask-text', text: '构建星图…' });
		// 等几帧让首批渲染就绪，再揭幕拉出
		window.setTimeout(() => {
			if (!this.maskEl) return;
			this.maskEl.addClass('is-fading');
			window.setTimeout(() => {
				this.maskEl?.remove();
				this.maskEl = null;
			}, 650);
			const inner = this.graphRadius * 0.5;
			const elev = (10 * Math.PI) / 180;
			renderer.camera.position.set(inner * Math.cos(elev), inner * Math.sin(elev), inner * 0.2);
			director.target.set(0, 0, 0);
			director.resetView(this.graphRadius, () => director.beginFocusOrbit(null)); // 内部 → 总览 → 即时巡航
			renderer.playReveal(2600); // 创世动画：节点从中心波次绽放（G2.5 反馈）
			this.shot = { t0: performance.now(), durMs: ESTABLISHING_MS, fromBloom: this.settings.bloom.strength * 1.8 };
		}, 450);
	}

	/** 开场期间辉光从 1.8× 回落到设置值（NASA「明亮诞生」） */
	private stepShot(now: number): void {
		if (!this.shot || !this.renderer) return;
		const t = Math.min((now - this.shot.t0) / this.shot.durMs, 1);
		const v = this.shot.fromBloom + (this.settings.bloom.strength - this.shot.fromBloom) * t;
		this.renderer.setBloomStrength(v);
		if (t >= 1) this.shot = null;
	}

	// ---------- 数据 ----------

	private onDataChanged(): void {
		if (!this.renderer) return;
		this.clearSelection();
		this.renderer.setData(this.store.data, this.store.positions);
		this.overlay?.setData(this.store.data, this.graphRadius);
		// 身份保持合并已保住旧坐标，低温重热让新节点滑入而不是全图爆炸
		this.initLayout(0.3);
		this.wasSettled = false;
	}

	/** Worker 优先，创建失败（罕见环境）回退主线程实现 */
	private initLayout(initialAlpha: number): void {
		const params = toLayoutParams(this.settings.physics);
		try {
			this.layout.init(this.store.data, this.store.positions, params, initialAlpha);
		} catch {
			if (this.layout instanceof MainThreadForceLayout) throw new Error('layout init failed');
			this.layout.dispose();
			this.layout = new MainThreadForceLayout();
			this.layout.init(this.store.data, this.store.positions, params, initialAlpha);
			new Notice('星系视图：后台线程不可用，已回退主线程布局');
		}
	}

	// ---------- 设置与视觉方向 ----------

	private applySettings(): void {
		const s = this.settings;
		this.renderer?.setBloomParams(s.bloom);
		this.renderer?.setNodeScale(s.look.nodeSize);
		this.renderer?.setLinkOpacity(s.look.linkOpacity);
		this.renderer?.setSizeMode(s.look.sizeBy);
		if (this.renderer) this.renderer.twinkleFreq = s.look.twinkle;
		if (this.director) {
			this.director.cruiseEnabled = s.cruise;
			this.director.cruiseSpeed = s.cruiseSpeed;
		}
	}

	/** 风格预设 = 辉光+力学+外观 成套切换 */
	applyStylePreset(p: { bloom: typeof DEFAULT_SETTINGS.bloom; physics: typeof DEFAULT_SETTINGS.physics; look: typeof DEFAULT_SETTINGS.look }): void {
		Object.assign(this.settings.bloom, p.bloom);
		Object.assign(this.settings.physics, p.physics);
		Object.assign(this.settings.look, p.look);
		this.applySettings();
		this.layout.updateParams(toLayoutParams(this.settings.physics));
		this.wasSettled = false;
		this.saveSoon();
	}

	/** 回中心：清选中 + 平滑回总览 + 到达即绕全局中心巡航 */
	recenter(): void {
		this.clearSelection();
		this.director?.resetView(this.graphRadius, () => this.director?.beginFocusOrbit(null));
	}

	/** 应用配色主题：按序染给现有颜色组（无组则按节点数从顶层文件夹生成） */
	applyColorTheme(theme: ColorTheme): void {
		let groups = this.settings.colorGroups;
		if (groups.length === 0) {
			const byFolder = new Map<string, number>();
			for (const n of this.store.data.nodes) {
				if (n.folderTop && !n.unresolved) byFolder.set(n.folderTop, (byFolder.get(n.folderTop) ?? 0) + 1);
			}
			groups = [...byFolder.entries()]
				.sort((a, b) => b[1] - a[1])
				.slice(0, 9)
				.map(([folder]) => ({ query: `path:${folder}`, color: '#9aa4b2' }));
			this.settings.colorGroups = groups;
		}
		groups.forEach((g, i) => (g.color = theme.colors[i % theme.colors.length] ?? g.color));
		this.settings.colorTheme = theme.id;
		this.renderer?.setColorFn(makeNodeColorFn(groups));
		this.renderer?.recolor();
		this.saveSoon();
	}

	/** 手动触发创世动画（坐标未沉降时给提示） */
	playRevealManually(): void {
		if (!this.layout.isSettled()) {
			new Notice('星系还在成形中，沉降后再试');
			return;
		}
		this.renderer?.playReveal();
	}

	/** 在已导入的颜色组之间洗牌（同组不变，颜色互换） */
	shuffleColors(): void {
		const groups = this.settings.colorGroups;
		if (groups.length < 2) {
			new Notice('先导入二维图谱配色，才能洗牌');
			return;
		}
		const colors = groups.map((g) => g.color);
		for (let i = colors.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[colors[i], colors[j]] = [colors[j]!, colors[i]!];
		}
		groups.forEach((g, i) => (g.color = colors[i] ?? g.color));
		this.settings.colorTheme = 'custom';
		this.renderer?.setColorFn(makeNodeColorFn(groups));
		this.renderer?.recolor();
		this.saveSoon();
	}

	/** preset + app 主题 → tokens（adaptive 深色与深空共用场景） */
	applyPreset(): void {
		if (!this.renderer) return;
		const isDark = activeDocument.body.hasClass('theme-dark');
		const tokens = this.settings.preset === 'deep-space' || isDark ? DEEP_SPACE : DAYLIGHT;
		this.renderer.applyTokens(tokens, this.settings.bloom.strength);
		this.panel?.setPanelTheme(tokens.id === 'daylight' ? 'gx-theme-light' : 'gx-theme-dark');
		this.contentEl.toggleClass('gx-daylight', tokens.id === 'daylight');
	}

	/** workspace css-change（由视图转发） */
	onCssChange(): void {
		if (this.settings.preset === 'adaptive') this.applyPreset();
	}

	private async importColors(notify: boolean): Promise<void> {
		const groups = await readGraphColorGroups(this.app);
		if (!groups || groups.length === 0) {
			if (notify) new Notice('未找到自带图谱的颜色分组（graph.json）');
			return;
		}
		this.settings.colorGroups = groups;
		this.renderer?.setColorFn(makeNodeColorFn(groups));
		this.renderer?.recolor();
		this.saveSoon();
		if (notify) new Notice(`已导入 ${groups.length} 组 2D 图谱配色`);
	}

	// ---------- 选中 / 聚焦 / 搜索 ----------

	openSearch(): void {
		new NodeSearchModal(this.app, this.store.data.nodes, (i) => this.selectNode(i, true)).open();
	}

	selectNode(index: number, fly: boolean): void {
		const renderer = this.renderer;
		const director = this.director;
		if (!renderer || !director) return;
		this.selected = index;
		const neighbors = new Set<number>();
		const linkIdx: number[] = [];
		this.store.data.links.forEach((l, li) => {
			if (l.source === index || l.target === index) {
				neighbors.add(l.source);
				neighbors.add(l.target);
				linkIdx.push(li);
			}
		});
		renderer.setFocus(index, neighbors);
		renderer.setSelectedLinks(linkIdx);
		this.overlay?.setSelection(index, neighbors);
		if (fly) {
			const pos = renderer.nodePosition(index, new Vector3());
			// 邻居质心方向：到达后环绕优先扫过链接密集的一侧
			const density = new Vector3();
			let count = 0;
			const tmp = new Vector3();
			for (const ni of neighbors) {
				if (ni === index) continue;
				density.add(renderer.nodePosition(ni, tmp));
				count++;
			}
			const densityDir = count > 0 ? density.divideScalar(count).sub(pos) : null;
			director.flyTo(pos, renderer.nodeRadius(index), () => director.beginFocusOrbit(densityDir));
		}
	}

	clearSelection(): void {
		this.selected = -1;
		this.renderer?.setFocus(-1, null);
		this.renderer?.setSelectedLinks([]);
		this.overlay?.setSelection(-1, new Set());
	}

	private flyToSelected(): void {
		if (this.selected < 0 || !this.renderer || !this.director) return;
		const pos = this.renderer.nodePosition(this.selected, new Vector3());
		this.director.flyTo(pos, this.renderer.nodeRadius(this.selected));
	}

	// ---------- 拾取 ----------

	private bindPicking(dom: HTMLElement): void {
		let downX = 0;
		let downY = 0;
		const onDown = (e: PointerEvent) => {
			downX = e.clientX;
			downY = e.clientY;
		};
		const onUp = (e: PointerEvent) => {
			if (e.button !== 0 || e.ctrlKey || e.metaKey) return; // 平移手势不选中
			if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;
			const rect = dom.getBoundingClientRect();
			const i = this.renderer?.pickNearest(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height, 14) ?? -1;
			if (i >= 0) this.selectNode(i, true);
			else this.clearSelection();
		};
		let hoverPending = false;
		const onMove = (e: PointerEvent) => {
			if (hoverPending) return;
			hoverPending = true;
			window.setTimeout(() => {
				hoverPending = false;
				const renderer = this.renderer;
				if (!renderer) return;
				const rect = dom.getBoundingClientRect();
				const i = renderer.pickNearest(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height, 10);
				this.overlay?.setHover(i);
				dom.style.cursor = i >= 0 ? 'pointer' : 'default';
			}, 30);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				this.clearSelection();
				e.preventDefault();
			}
		};
		dom.addEventListener('pointerdown', onDown);
		dom.addEventListener('pointerup', onUp);
		dom.addEventListener('pointermove', onMove);
		dom.addEventListener('keydown', onKey);
		this.disposeFns.push(() => {
			dom.removeEventListener('pointerdown', onDown);
			dom.removeEventListener('pointerup', onUp);
			dom.removeEventListener('pointermove', onMove);
			dom.removeEventListener('keydown', onKey);
		});
	}

	// ---------- 可见性暂停 ----------

	private bindVisibility(): void {
		const onVis = () => {
			this.paused = activeDocument.hidden || !this.visible;
		};
		activeDocument.addEventListener('visibilitychange', onVis);
		this.disposeFns.push(() => activeDocument.removeEventListener('visibilitychange', onVis));
		this.intersection = new IntersectionObserver((entries) => {
			this.visible = entries[0]?.isIntersecting ?? true;
			onVis();
		});
		this.intersection.observe(this.contentEl);
	}

	// ---------- 控制面板 ----------

	private buildPanel(): void {
		this.panel = new ControlPanel(this.contentEl, this.settings, {
			onBloom: () => {
				this.renderer?.setBloomParams(this.settings.bloom);
				this.saveSoon();
			},
			onPhysics: () => {
				this.layout.updateParams(toLayoutParams(this.settings.physics));
				this.wasSettled = false;
				this.saveSoon();
			},
			onLook: () => {
				this.renderer?.setNodeScale(this.settings.look.nodeSize);
				this.renderer?.setLinkOpacity(this.settings.look.linkOpacity);
				if (this.renderer) this.renderer.twinkleFreq = this.settings.look.twinkle;
				this.saveSoon();
			},
			onSizeBy: () => {
				this.renderer?.setSizeMode(this.settings.look.sizeBy);
				this.saveSoon();
			},
			onCruise: (on) => {
				if (this.director) this.director.cruiseEnabled = on;
				this.saveSoon();
			},
			onPreset: () => {
				this.applyPreset();
				this.saveSoon();
			},
			onShowUnresolved: (on) => {
				this.store.setIncludeUnresolved(on);
				this.saveSoon();
			},
			onImportColors: () => void this.importColors(true),
			onShuffleColors: () => this.shuffleColors(),
			onColorTheme: (t) => this.applyColorTheme(t),
			onRecenter: () => this.recenter(),
			onReveal: () => this.playRevealManually(),
			onShowOrphans: (on) => {
				this.store.setIncludeOrphans(on);
				this.saveSoon();
			},
			onStylePreset: (p) => this.applyStylePreset(p),
			onCruiseSpeed: () => {
				if (this.director) this.director.cruiseSpeed = this.settings.cruiseSpeed;
				this.saveSoon();
			},
			onSearch: () => this.openSearch(),
			onReset: () => {
				Object.assign(this.settings.bloom, DEFAULT_SETTINGS.bloom);
				Object.assign(this.settings.physics, DEFAULT_SETTINGS.physics);
				Object.assign(this.settings.look, DEFAULT_SETTINGS.look);
				this.settings.cruise = DEFAULT_SETTINGS.cruise;
				this.settings.cruiseSpeed = DEFAULT_SETTINGS.cruiseSpeed;
				this.applySettings();
				this.layout.updateParams(toLayoutParams(this.settings.physics));
				this.wasSettled = false;
				this.saveSoon();
			},
			runScenario: (s) => void this.runScenario(s),
		});
	}

	private updateHud(now: number): void {
		this.hudFrames.push(now);
		while (this.hudFrames.length > 0 && now - (this.hudFrames[0] ?? 0) > 1000) this.hudFrames.shift();
		const el = this.panel?.statsEl;
		if (!el || now % 500 > 250) return;
		const c = this.counts;
		el.setText(
			`${this.hudFrames.length} fps · ${this.renderer?.drawCalls ?? 0} calls · ${c.nodes}n/${c.links}l · ` +
				`${this.layout.isSettled() ? '已沉降' : '布局中'}`,
		);
	}

	// ---------- 基准（与 M0/M1 同场景语义） ----------

	private waitSettle(timeoutMs = 120_000): Promise<void> {
		return new Promise((resolve) => {
			const t0 = performance.now();
			const check = () => {
				if (this.layout.isSettled() || performance.now() - t0 > timeoutMs) resolve();
				else window.setTimeout(check, 100);
			};
			check();
		});
	}

	async runScenario(scenario: 'S1' | 'S2' | 'S3'): Promise<BenchResult | null> {
		if (this.benchRunning || !this.renderer || !this.director) return null;
		this.benchRunning = true;
		try {
			if (scenario === 'S2') return await this.benchColdLayout();
			return await this.benchOrbit(scenario);
		} finally {
			this.benchRunning = false;
		}
	}

	private async benchOrbit(scenario: 'S1' | 'S3'): Promise<BenchResult> {
		const renderer = this.renderer;
		const director = this.director;
		if (!renderer || !director) throw new Error('not ready');

		const wantUnresolved = scenario === 'S3';
		if (this.store.getIncludeUnresolved() !== wantUnresolved) {
			this.store.setIncludeUnresolved(wantUnresolved);
		}
		new Notice(`${scenario}：等待布局沉降…`);
		await this.waitSettle();
		if (renderer.getBloomStrength() < 0.01) renderer.setBloomStrength(0.9);
		await sleep(300);

		this.benchMode = true;
		const target = director.target.clone();
		const sph = new Spherical().setFromVector3(renderer.camera.position.clone().sub(target));
		new Notice(`${scenario}：20s 环绕测帧率…`);
		const stats = await collectFrames(20_000, (elapsed) => {
			const angle = sph.theta + (elapsed / 20_000) * Math.PI * 2;
			renderer.camera.position.setFromSpherical(new Spherical(sph.radius, sph.phi, angle)).add(target);
			renderer.camera.lookAt(target);
		});
		this.benchMode = false;

		const result: BenchResult = {
			scenario,
			timestamp: new Date().toISOString(),
			nodes: this.counts.nodes,
			links: this.counts.links,
			bloom: renderer.getBloomStrength() > 0,
			drawCalls: renderer.drawCalls,
			renderer: 'aggregate',
			...stats,
		};
		await writeBenchResult(this.app, result);
		new Notice(`${scenario} 完成：avg ${stats.avgFps.toFixed(1)} fps · ${renderer.drawCalls} calls`);
		return result;
	}

	private async benchColdLayout(): Promise<BenchResult> {
		new Notice('S2：冷布局开始（预算化 tick，期间界面应保持可用）…');
		if (this.store.getIncludeUnresolved()) this.store.setIncludeUnresolved(false);
		await sleep(300);
		const longTasks = observeLongTasks();
		const t0 = performance.now();
		this.settings.positionCache = {}; // 冷布局必须无暖启动
		this.store.rebuild(false); // 触发 onDataChanged（alpha 0.3）……
		this.initLayout(1); // ……随即以完整冷布局语义重新点火（M2 起的语义偏差在此修正）
		this.wasSettled = false;
		await this.waitSettle();
		const settleMs = performance.now() - t0;
		const ticks = this.layout.ticks;
		const lt = longTasks.stop();

		const result: BenchResult = {
			scenario: 'S2',
			timestamp: new Date().toISOString(),
			nodes: this.counts.nodes,
			links: this.counts.links,
			bloom: (this.renderer?.getBloomStrength() ?? 0) > 0,
			renderer: 'aggregate',
			settleMs,
			ticks,
			avgTickMs: ticks > 0 ? settleMs / ticks : -1,
			longTaskCount: lt.count,
			longestTaskMs: lt.longestMs,
			longTaskTotalMs: lt.totalMs,
		};
		await writeBenchResult(this.app, result);
		new Notice(`S2 完成：沉降 ${(settleMs / 1000).toFixed(1)}s / ${ticks} ticks，最长阻塞 ${lt.longestMs.toFixed(0)}ms`);
		return result;
	}

	// ---------- 销毁合同 ----------

	dispose(): void {
		window.cancelAnimationFrame(this.rafId);
		this.intersection?.disconnect();
		this.intersection = null;
		for (const fn of this.disposeFns) fn();
		this.disposeFns = [];
		this.maskEl?.remove();
		this.maskEl = null;
		this.overlay?.dispose();
		this.overlay = null;
		this.director?.dispose();
		this.director = null;
		this.layout.dispose();
		this.renderer?.dispose();
		this.renderer = null;
		this.panel?.dispose();
		this.panel = null;
	}
}
