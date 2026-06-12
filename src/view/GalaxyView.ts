import { ItemView, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_GALAXY } from '../constants';
import { GraphController } from './GraphController';

export class GalaxyView extends ItemView {
	navigation = true;
	controller: GraphController | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_GALAXY;
	}

	getDisplayText(): string {
		return 'Galaxy view';
	}

	getIcon(): string {
		return 'orbit';
	}

	get counts(): { nodes: number; links: number } {
		return this.controller?.counts ?? { nodes: 0, links: 0 };
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass('galaxy-view-content');
		// WebGL 初始化推迟到首个非零尺寸（deferred/恢复布局下 onOpen 时可能 0×0）
		this.tryInit();
	}

	onResize(): void {
		if (!this.controller) {
			this.tryInit();
			return;
		}
		this.controller.resize();
	}

	private tryInit(): void {
		if (this.controller) return;
		const { clientWidth: w, clientHeight: h } = this.contentEl;
		if (w < 10 || h < 10) return;
		const controller = new GraphController(this.app, this.contentEl);
		this.controller = controller;
		this.addChild(controller.store); // Component 生命周期：registerEvent 自动清理
		void controller.start();
	}

	async onClose(): Promise<void> {
		this.controller?.dispose();
		this.controller = null;
		this.contentEl.empty();
	}
}
