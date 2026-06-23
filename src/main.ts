import { Notice, Plugin } from 'obsidian';
import { VIEW_TYPE_GALAXY } from './constants';
import type { GalaxySettings } from './settings';
import { DEFAULT_SETTINGS, mergeSettings } from './settings';
import { GalaxyView } from './view/GalaxyView';
import { heapUsed, sleep, writeBenchResult } from './bench/bench';
import { t } from './locales';

export default class GalaxyViewPlugin extends Plugin {
	settings: GalaxySettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		this.settings = mergeSettings(await this.loadData());
		this.registerView(VIEW_TYPE_GALAXY, (leaf) => new GalaxyView(leaf, this));

		this.addRibbonIcon('orbit', t('open_view'), () => {
			void this.activateView();
		});

		this.addCommand({
			id: 'open',
			name: t('open_view'),
			callback: () => void this.activateView(),
		});

		this.addCommand({
			id: 'search',
			name: t('search_nodes_fly'),
			callback: () => {
				void this.activateView().then((view) => view?.controller?.openSearch());
			},
		});

		if (!__GALAXY_DEV__) return; // 以下为开发期基准命令，商店构建剔除

		this.addCommand({
			id: 'bench-suite',
			name: t('bench_suite'),
			callback: () => void this.runBenchSuite(),
		});

		this.addCommand({
			id: 'bench-leak',
			name: t('bench_leak'),
			callback: () => void this.runLeakCanary(),
		});
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
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
			new Notice(t('open_failed'));
			return;
		}
		// 等控制器完成异步启动
		for (let i = 0; i < 100 && !view.controller; i++) await sleep(100);
		const c = view.controller;
		if (!c) {
			new Notice(t('init_timeout'));
			return;
		}
		await c.runScenario('S1');
		await c.runScenario('S2');
		await c.runScenario('S3');
		new Notice(t('bench_completed'));
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
		// 布局 tick 产生大量短命垃圾（d3 每 tick 重建八叉树），忙循环期间整堆回收
		// 不一定跑——等空闲回收收尾后再读数，否则把回收滞后误判成泄漏（2026-06-12 实测）
		new Notice(t('bench_waiting_reclamation'));
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
			note: t('webgl_warning_note'),
		};
		await writeBenchResult(this.app, result);
		new Notice(t('s4_completed', { delta: result.heapDeltaMB.toFixed(1) }));
	}
}
