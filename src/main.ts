import { Notice, Plugin } from 'obsidian';
import { VIEW_TYPE_GALAXY } from './constants';
import { GalaxyView } from './view/GalaxyView';
import { heapUsed, sleep, writeBenchResult } from './bench/bench';

export default class GalaxyViewPlugin extends Plugin {
	async onload(): Promise<void> {
		this.registerView(VIEW_TYPE_GALAXY, (leaf) => new GalaxyView(leaf));

		this.addRibbonIcon('orbit', '打开星系视图', () => {
			void this.activateView();
		});

		this.addCommand({
			id: 'open',
			name: '打开星系视图',
			callback: () => void this.activateView(),
		});

		this.addCommand({
			id: 'bench-suite',
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- M0 开发期命令，S1/S2/S3 是基准场景代号，发布前移除
			name: 'M0 基准：依次跑 S1 / S2 / S3',
			callback: () => void this.runBenchSuite(),
		});

		this.addCommand({
			id: 'bench-leak',
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- M0 开发期命令，发布前移除
			name: 'M0 基准：S4 泄漏金丝雀（开关视图×10）',
			callback: () => void this.runLeakCanary(),
		});
	}

	async activateView(): Promise<GalaxyView | null> {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(VIEW_TYPE_GALAXY)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getLeaf(true);
			await leaf.setViewState({ type: VIEW_TYPE_GALAXY, active: true });
		}
		if (leaf.isDeferred) await leaf.loadIfDeferred();
		await workspace.revealLeaf(leaf);
		return leaf.view instanceof GalaxyView ? leaf.view : null;
	}

	private async runBenchSuite(): Promise<void> {
		const view = await this.activateView();
		if (!view) {
			new Notice('星系视图打开失败');
			return;
		}
		// 等控制器完成异步启动
		for (let i = 0; i < 100 && !view.controller; i++) await sleep(100);
		const c = view.controller;
		if (!c) {
			new Notice('星系视图初始化超时');
			return;
		}
		await c.runScenario('S1');
		await c.runScenario('S2');
		await c.runScenario('S3');
		new Notice('基准完成，结果在 _galaxy_bench/ 目录');
	}

	/** S4：开关视图×10，看堆增量与 WebGL 上下文告警（后者看控制台） */
	private async runLeakCanary(): Promise<void> {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_GALAXY);
		await sleep(500);
		const before = heapUsed();
		let counts = { nodes: 0, links: 0 };
		const cycles = 10;
		for (let i = 0; i < cycles; i++) {
			const view = await this.activateView();
			await sleep(2000);
			if (view) counts = view.counts;
			this.app.workspace.detachLeavesOfType(VIEW_TYPE_GALAXY);
			await sleep(400);
			new Notice(`S4：${i + 1}/${cycles}`);
		}
		// 布局 tick 产生大量短命垃圾（d3 每 tick 重建八叉树），忙循环期间 major GC
		// 不一定跑——等空闲 GC 收尾后再读数，否则把 GC 滞后误判成泄漏（2026-06-12 实测）
		new Notice('S4：等待 20s 让 GC 收尾…');
		await sleep(20_000);
		const after = heapUsed();
		const result = {
			scenario: 'S4',
			timestamp: new Date().toISOString(),
			nodes: counts.nodes,
			links: counts.links,
			bloom: true,
			renderer: 'aggregate',
			cycles,
			heapBeforeMB: before / 1048576,
			heapAfterMB: after / 1048576,
			heapDeltaMB: (after - before) / 1048576,
			note: 'WebGL context 告警需看开发者控制台；真泄漏判据=连续两轮 before 持续抬升',
		};
		await writeBenchResult(this.app, result);
		new Notice(`S4 完成：堆增量 ${result.heapDeltaMB.toFixed(1)} MB（通过线 <20MB）`);
	}
}
