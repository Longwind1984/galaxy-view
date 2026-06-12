import type { App } from 'obsidian';
import { Notice } from 'obsidian';
import { Spherical, Vector3 } from 'three';
import type { BenchResult } from '../types';
import { DEFAULT_LAYOUT_PARAMS } from '../constants';
import { GraphStore } from '../data/GraphStore';
import { seedRadius } from '../data/seed';
import { MainThreadForceLayout } from '../layout/MainThreadForceLayout';
import { AggregateRenderer } from '../render/AggregateRenderer';
import { CameraDirector } from '../interactions/CameraDirector';
import { collectFrames, observeLongTasks, writeBenchResult, sleep } from '../bench/bench';

/**
 * 唯一的组装点：Store → Layout → Renderer → CameraDirector → HUD。
 * 自有 rAF 循环：布局热时每帧 1 tick（成形过程即动画），沉降后零上传。
 */
export class GraphController {
	readonly store: GraphStore;
	private layout = new MainThreadForceLayout();
	private renderer: AggregateRenderer | null = null;
	private director: CameraDirector | null = null;

	private rafId = 0;
	private lastNow = 0;
	private paused = false;
	private benchMode = false;
	private benchRunning = false;
	private selected = -1;

	private hudStatsEl: HTMLElement | null = null;
	private hudFrames: number[] = [];
	private intersection: IntersectionObserver | null = null;
	private disposeFns: (() => void)[] = [];

	constructor(
		private app: App,
		private contentEl: HTMLElement,
	) {
		this.store = new GraphStore(app);
	}

	get counts(): { nodes: number; links: number } {
		return { nodes: this.store.data.nodes.length, links: this.store.data.links.length };
	}

	async start(): Promise<void> {
		await this.store.ensureCacheReady();
		this.store.init(false, () => this.onDataChanged());
		this.store.rebuild(false);

		const container = this.contentEl.createDiv({ cls: 'galaxy-view-canvas' });
		const radius = seedRadius(this.store.data.nodes.length);
		const renderer = new AggregateRenderer(container, radius);
		this.renderer = renderer;
		renderer.setData(this.store.data, this.store.positions);
		this.layout.init(this.store.data, this.store.positions, DEFAULT_LAYOUT_PARAMS);

		this.director = new CameraDirector(renderer.camera, renderer.renderer.domElement);
		this.director.setInitialFraming(radius * 1.6);

		this.buildHud();
		this.bindPicking(renderer.renderer.domElement);
		this.bindVisibility();
		this.resize();

		this.lastNow = performance.now();
		const loop = (now: number) => {
			const deltaS = Math.min((now - this.lastNow) / 1000, 0.1);
			this.lastNow = now;
			if (!this.paused) {
				if (this.layout.step()) this.renderer?.updatePositions();
				if (!this.benchMode) this.director?.update(now, deltaS);
				this.renderer?.render(deltaS);
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

	private onDataChanged(): void {
		if (!this.renderer) return;
		this.renderer.setData(this.store.data, this.store.positions);
		// 身份保持合并已保住旧坐标，低温重热让新节点滑入而不是全图爆炸
		this.layout.init(this.store.data, this.store.positions, DEFAULT_LAYOUT_PARAMS);
		this.layout.reheat(0.3);
	}

	// ---------- 拾取（屏幕空间最近邻，仅点击时 O(n)） ----------

	private bindPicking(dom: HTMLElement): void {
		let downX = 0;
		let downY = 0;
		const onDown = (e: PointerEvent) => {
			downX = e.clientX;
			downY = e.clientY;
		};
		const onUp = (e: PointerEvent) => {
			if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return; // 拖拽不算点击
			const rect = dom.getBoundingClientRect();
			const renderer = this.renderer;
			const director = this.director;
			if (!renderer || !director) return;
			const i = renderer.pickNearest(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height, 14);
			if (i >= 0) {
				this.selected = i;
				const pos = renderer.nodePosition(i, new Vector3());
				director.flyTo(pos, renderer.nodeRadius(i));
			}
		};
		dom.addEventListener('pointerdown', onDown);
		dom.addEventListener('pointerup', onUp);
		this.disposeFns.push(() => {
			dom.removeEventListener('pointerdown', onDown);
			dom.removeEventListener('pointerup', onUp);
		});
	}

	// ---------- 可见性暂停（电池友好；隐藏 tab 不烧 GPU） ----------

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

	private visible = true;

	// ---------- HUD ----------

	private buildHud(): void {
		const hud = this.contentEl.createDiv({ cls: 'galaxy-hud' });
		this.hudStatsEl = hud.createDiv({ cls: 'galaxy-hud-stats', text: '…' });
		const row = hud.createDiv({ cls: 'galaxy-hud-row' });
		const mkBtn = (label: string, fn: () => void) => {
			const b = row.createEl('button', { text: label });
			b.addEventListener('click', fn);
		};
		mkBtn('S1 环绕', () => void this.runScenario('S1'));
		mkBtn('S2 冷布局', () => void this.runScenario('S2'));
		mkBtn('S3 含未解析', () => void this.runScenario('S3'));
		mkBtn('巡航', () => {
			if (this.director) this.director.cruiseEnabled = !this.director.cruiseEnabled;
		});

		const sliderRow = hud.createDiv({ cls: 'galaxy-hud-row' });
		sliderRow.createSpan({ text: '辉光' });
		const slider = sliderRow.createEl('input', { type: 'range' });
		slider.min = '0';
		slider.max = '2.5';
		slider.step = '0.05';
		slider.value = String(this.renderer?.getBloomStrength() ?? 0.9);
		slider.addEventListener('input', () => {
			this.renderer?.setBloomStrength(Number(slider.value));
		});
	}

	private updateHud(now: number): void {
		this.hudFrames.push(now);
		while (this.hudFrames.length > 0 && now - (this.hudFrames[0] ?? 0) > 1000) this.hudFrames.shift();
		const el = this.hudStatsEl;
		if (!el || now % 500 > 250) return;
		const c = this.counts;
		el.setText(
			`${this.hudFrames.length} fps · ${this.renderer?.drawCalls ?? 0} calls · ${c.nodes}n/${c.links}l · ` +
				`${this.layout.isSettled() ? '已沉降' : '布局中'}${this.selected >= 0 ? ` · #${this.selected}` : ''}`,
		);
	}

	// ---------- 基准（与 M0 同场景语义，可出 before/after 表） ----------

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
			this.store.setIncludeUnresolved(wantUnresolved); // 触发重建+重热
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
			renderer.camera.position
				.setFromSpherical(new Spherical(sph.radius, sph.phi, angle))
				.add(target);
			renderer.camera.lookAt(target);
		});
		this.benchMode = false;

		const result: BenchResult = {
			scenario,
			timestamp: new Date().toISOString(),
			nodes: this.counts.nodes,
			links: this.counts.links,
			bloom: true,
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
		let ticks = 0;
		// 全新确定性种子 → 完整冷布局；tick 计数挂在 step 外侧统计
		this.store.rebuild(false);
		const origStep = this.layout.step.bind(this.layout);
		const counting = () => {
			const hot = origStep();
			if (hot) ticks++;
			return hot;
		};
		this.layout.step = counting;
		await this.waitSettle();
		this.layout.step = origStep;
		const settleMs = performance.now() - t0;
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
		new Notice(
			`S2 完成：沉降 ${(settleMs / 1000).toFixed(1)}s / ${ticks} ticks，最长阻塞 ${lt.longestMs.toFixed(0)}ms`,
		);
		return result;
	}

	// ---------- 销毁合同 ----------

	dispose(): void {
		window.cancelAnimationFrame(this.rafId);
		this.intersection?.disconnect();
		this.intersection = null;
		for (const fn of this.disposeFns) fn();
		this.disposeFns = [];
		this.director?.dispose();
		this.director = null;
		this.layout.dispose();
		this.renderer?.dispose();
		this.renderer = null;
		this.hudStatsEl = null;
	}
}
