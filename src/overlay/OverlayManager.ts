import type { App } from 'obsidian';
import { TFile, getAllTags } from 'obsidian';
import type { GraphData, GraphNode } from '../types';
import type { AggregateRenderer } from '../render/AggregateRenderer';



export interface OverlayCallbacks {
	openNote: (id: string) => void;
	focusNode: (index: number) => void;
}

/**
 * DOM 浮层（NASA 模式：标签和卡片不进画布）。
 * 硬预算：枢纽 14 + hover 1 + 邻居 ≤20 + 卡片 1 —— 每帧 ≤36 次投影，可忽略。
 */
export class OverlayManager {
	private root: HTMLElement;
	private hubEls: { index: number; el: HTMLElement }[] = [];
	private neighborEls: { index: number; el: HTMLElement }[] = [];
	private hoverEl: HTMLElement;
	private hoverIndex = -1;
	private card: HTMLElement;
	private cardIndex = -1;
	private data: GraphData = { nodes: [], links: [] };
	private graphRadius = 200;
	private snippetToken = 0;
	private hubBudget = 14;
	private neighborBudget = 20;
	private mobileCard = false;

	constructor(
		parent: HTMLElement,
		private app: App,
		private renderer: AggregateRenderer,
		private cb: OverlayCallbacks,
	) {
		this.root = parent.createDiv({ cls: 'gx-overlay' });
		this.hoverEl = this.root.createDiv({ cls: 'gx-label gx-label-hover' });
		this.hoverEl.hide();
		this.card = this.root.createDiv({ cls: 'gx-card' });
		this.card.hide();
	}

	/** 质量档位预算；卡片切底部抽屉模式（移动端） */
	setBudgets(hub: number, neighbor: number, mobileCard: boolean): void {
		this.hubBudget = hub;
		this.neighborBudget = neighbor;
		this.mobileCard = mobileCard;
		this.setData(this.data, this.graphRadius);
	}

	setData(data: GraphData, graphRadius: number): void {
		this.data = data;
		this.graphRadius = graphRadius;
		for (const h of this.hubEls) h.el.remove();
		this.hubEls = [...data.nodes.entries()]
			.filter(([, n]) => !n.unresolved)
			.sort((a, b) => b[1].degree - a[1].degree)
			.slice(0, this.hubBudget)
			.map(([index, n]) => ({
				index,
				el: this.root.createDiv({ cls: 'gx-label gx-label-hub', text: n.name }),
			}));
		// 数据重建后旧索引失效，清掉依赖索引的状态
		this.setHover(-1);
		this.setSelection(-1, new Set());
	}

	setHover(index: number): void {
		this.hoverIndex = index;
		if (index < 0) {
			this.hoverEl.hide();
			return;
		}
		const node = this.data.nodes[index];
		if (!node) return;
		this.hoverEl.setText(node.name);
		this.hoverEl.show();
	}

	/**
	 * 自适应底部留白（M4.1）：实测 .mobile-navbar 与画布的重叠像素。
	 * 官方未暴露 navbar 高度变量，且平板/隐藏设置/安卓变体下可能不存在——
	 * 运行时测量在所有形态下自适应：无 navbar 时为 0，不会多出空白。
	 */
	private refreshBottomInset(): void {
		let inset = 0;
		const navbar = activeDocument.querySelector('.mobile-navbar');
		if (navbar) {
			const nb = navbar.getBoundingClientRect();
			const ce = this.root.getBoundingClientRect();
			inset = Math.max(0, Math.round(ce.bottom - nb.top));
		}
		this.root.setCssProps({ '--gx-bottom-inset': `${inset}px` });
	}

	/** 选中：邻居标签 + 卡片；index<0 清空 */
	setSelection(index: number, neighbors: Set<number>): void {
		for (const e of this.neighborEls) e.el.remove();
		this.neighborEls = [];
		this.cardIndex = index;
		if (index < 0) {
			this.card.hide();
			return;
		}
		const byDegree = [...neighbors]
			.filter((i) => i !== index)
			.sort((a, b) => (this.data.nodes[b]?.degree ?? 0) - (this.data.nodes[a]?.degree ?? 0))
			.slice(0, this.neighborBudget);
		this.neighborEls = byDegree.map((i) => ({
			index: i,
			el: this.root.createDiv({ cls: 'gx-label gx-label-neighbor', text: this.data.nodes[i]?.name ?? '' }),
		}));
		const node = this.data.nodes[index];
		if (node) {
			if (this.mobileCard) this.refreshBottomInset();
			this.buildCard(node, index);
		}
	}

	private buildCard(node: GraphNode, index: number): void {
		this.card.empty();
		this.card.show();

		this.card.createDiv({ cls: 'gx-card-title', text: node.name });
		const meta = this.card.createDiv({ cls: 'gx-card-meta' });
		const dot = meta.createSpan({ cls: 'gx-card-dot' });
		dot.style.background = this.renderer.nodeColorHex(index);
		meta.createSpan({
			text: node.unresolved ? '未解析链接（笔记尚不存在）' : node.id.includes('/') ? node.id.slice(0, node.id.lastIndexOf('/')) : '根目录',
		});

		const file = node.unresolved ? null : this.app.vault.getAbstractFileByPath(node.id);
		const tfile = file instanceof TFile ? file : null;

		if (tfile) {
			const cache = this.app.metadataCache.getFileCache(tfile);
			const tags = cache ? (getAllTags(cache) ?? []) : [];
			if (tags.length > 0) {
				const tagRow = this.card.createDiv({ cls: 'gx-card-tags' });
				for (const t of tags.slice(0, 5)) tagRow.createSpan({ cls: 'gx-card-tag', text: t });
			}
		}

		const stats = this.card.createDiv({ cls: 'gx-card-stats' });
		stats.setText(
			`↩ ${node.inDegree} 反链 · → ${node.outDegree} 出链` +
				(tfile ? ` · 改于 ${new Date(tfile.stat.mtime).toLocaleDateString('zh-CN')}` : ''),
		);

		if (tfile) {
			const snippetEl = this.card.createDiv({ cls: 'gx-card-snippet', text: '…' });
			const token = ++this.snippetToken;
			void this.app.vault.cachedRead(tfile).then((text) => {
				if (token !== this.snippetToken) return; // 已切换选中，丢弃过期结果
				snippetEl.setText(stripMarkdown(text).slice(0, 120) || '（空笔记）');
			});
		}

		const actions = this.card.createDiv({ cls: 'gx-card-actions' });
		if (!node.unresolved) {
			const openBtn = actions.createEl('button', { text: '打开笔记' });
			openBtn.addEventListener('click', () => this.cb.openNote(node.id));
		}
		const focusBtn = actions.createEl('button', { text: '聚焦' });
		focusBtn.addEventListener('click', () => this.cb.focusNode(index));
	}

	/** 每帧：投影所有被追踪节点，translate3d 定位（GPU 合成，无重排） */
	update(w: number, h: number): void {
		const far = this.graphRadius * 2.6;
		const near = this.graphRadius * 1.2;
		for (const { index, el } of this.hubEls) {
			const p = this.renderer.projectNode(index, w, h);
			if (p.behind || p.x < 0 || p.x > w || p.y < 0 || p.y > h) {
				el.setCssProps({ opacity: '0' });
				continue;
			}
			const dist = this.renderer.cameraDistanceTo(index);
			const a = Math.min(Math.max((far - dist) / (far - near), 0), 1);
			el.style.opacity = a.toFixed(2);
			el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${(p.y - 14).toFixed(1)}px, 0)`;
		}
		for (const { index, el } of this.neighborEls) {
			const p = this.renderer.projectNode(index, w, h);
			el.style.opacity = p.behind ? '0' : '0.85';
			if (!p.behind) el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${(p.y - 12).toFixed(1)}px, 0)`;
		}
		if (this.hoverIndex >= 0) {
			const p = this.renderer.projectNode(this.hoverIndex, w, h);
			if (!p.behind) this.hoverEl.style.transform = `translate3d(${p.x.toFixed(1)}px, ${(p.y - 18).toFixed(1)}px, 0)`;
		}
		if (this.cardIndex >= 0 && !this.mobileCard) {
			const p = this.renderer.projectNode(this.cardIndex, w, h);
			if (!p.behind) {
				const flip = p.x + 296 > w;
				const x = flip ? p.x - 296 : p.x + 16;
				const y = Math.min(Math.max(p.y - 40, 12), Math.max(h - this.card.clientHeight - 12, 12));
				this.card.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
			}
		}
	}

	dispose(): void {
		this.root.remove();
		this.hubEls = [];
		this.neighborEls = [];
	}
}

function stripMarkdown(text: string): string {
	return text
		.replace(/^---\n[\s\S]*?\n---\n?/, '') // frontmatter
		.replace(/!?\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, '$1')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/[#*`>~_]|---/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}
