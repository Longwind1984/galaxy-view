import type { App } from 'obsidian';
import { TFile, getAllTags } from 'obsidian';
import type { GraphData, GraphNode } from '../types';
import type { AggregateRenderer } from '../render/AggregateRenderer';
import { getLang, t } from '../i18n';



export interface OverlayCallbacks {
	openNote: (id: string) => void;
	focusNode: (index: number) => void;
	/** 卡片上的关联深度（默认一度，不起眼地切二度） */
	getSelectionDepth: () => 1 | 2;
	onSelectionDepth: (depth: 1 | 2) => void;
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
	private cardCollapsed = false;
	private cardPos: { x: number; y: number } | null = null; // 手动拖动后的位置（null=跟随节点）
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
		if (index !== this.cardIndex) this.cardPos = null; // 选了新节点 → 卡片重新跟随；同节点（改深度）保留拖动位置
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
			if (this.mobileCard) {
				this.refreshBottomInset();
				// 移除桌面定位残留的内联 transform → CSS 底部抽屉定位靠选择器特异性接管（免 !important）
				this.card.style.removeProperty('transform');
			}
			this.buildCard(node, index);
		}
	}

	private buildCard(node: GraphNode, index: number): void {
		this.card.empty();
		this.card.show();
		this.card.toggleClass('is-collapsed', this.cardCollapsed);

		// —— 头部：标题 + 收起（拖拽把手，可移动整张卡）——
		const head = this.card.createDiv({ cls: 'gx-card-head' });
		head.createDiv({ cls: 'gx-card-title', text: node.name });
		const collapseBtn = head.createEl('button', { cls: 'gx-card-collapse', text: this.cardCollapsed ? '+' : '–' });
		collapseBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.cardCollapsed = !this.cardCollapsed;
			this.card.toggleClass('is-collapsed', this.cardCollapsed);
			collapseBtn.setText(this.cardCollapsed ? '+' : '–');
		});
		if (!this.mobileCard) this.bindCardDrag(head);

		// —— 主体（可收起）——
		const body = this.card.createDiv({ cls: 'gx-card-body' });
		const meta = body.createDiv({ cls: 'gx-card-meta' });
		const dot = meta.createSpan({ cls: 'gx-card-dot' });
		dot.style.background = this.renderer.nodeColorHex(index);
		meta.createSpan({
			text: node.tag
				? t('card.tag')
				: node.unresolved
					? t('card.unresolved')
					: node.id.includes('/')
						? node.id.slice(0, node.id.lastIndexOf('/'))
						: t('card.root'),
		});

		const file = node.unresolved || node.tag ? null : this.app.vault.getAbstractFileByPath(node.id);
		const tfile = file instanceof TFile ? file : null;

		if (tfile) {
			const cache = this.app.metadataCache.getFileCache(tfile);
			const tags = cache ? (getAllTags(cache) ?? []) : [];
			if (tags.length > 0) {
				const tagRow = body.createDiv({ cls: 'gx-card-tags' });
				for (const t of tags.slice(0, 5)) tagRow.createSpan({ cls: 'gx-card-tag', text: t });
			}
		}

		const stats = body.createDiv({ cls: 'gx-card-stats' });
		// 用原生 Intl 而非 obsidian 的 moment（后者类型松散会触发 no-unsafe-* 告警）
		const mdate = tfile
			? ` · ${new Date(tfile.stat.mtime).toLocaleDateString(getLang() === 'zh' ? 'zh-CN' : 'en', { year: 'numeric', month: 'short', day: 'numeric' })}`
			: '';
		// 标签节点：显示「N 篇笔记」（= 带此 tag 的笔记数）而非反链/出链
		stats.setText(node.tag ? t('card.tagNotes', { n: node.degree }) : t('card.stats', { in: node.inDegree, out: node.outDegree }) + mdate);

		if (tfile) {
			const snippetEl = body.createDiv({ cls: 'gx-card-snippet', text: '…' });
			const token = ++this.snippetToken;
			void this.app.vault.cachedRead(tfile).then((text) => {
				if (token !== this.snippetToken) return; // 已切换选中，丢弃过期结果
				snippetEl.setText(stripMarkdown(text).slice(0, 120) || t('card.empty'));
			});
		}

		const actions = body.createDiv({ cls: 'gx-card-actions' });
		if (!node.unresolved && !node.tag) {
			const openBtn = actions.createEl('button', { text: t('card.open') });
			openBtn.addEventListener('click', () => this.cb.openNote(node.id));
		}
		const focusBtn = actions.createEl('button', { text: t('card.focus') });
		focusBtn.addEventListener('click', () => this.cb.focusNode(index));

		// 关联深度：低优先级，卡片底部一行不起眼的一度/二度切换
		const depthRow = body.createDiv({ cls: 'gx-card-depth' });
		depthRow.createSpan({ cls: 'gx-card-depth-label', text: t('card.links') });
		const mini = depthRow.createDiv({ cls: 'gx-card-depth-mini' });
		const cur = this.cb.getSelectionDepth();
		const mkDepth = (depth: 1 | 2, label: string) => {
			const b = mini.createEl('button', { text: label });
			b.toggleClass('is-on', cur === depth);
			b.addEventListener('click', () => this.cb.onSelectionDepth(depth));
		};
		mkDepth(1, t('card.d1'));
		mkDepth(2, t('card.d2'));
	}

	/** 卡片可拖动：拖头部把手，设手动位置；update() 不再自动跟随节点 */
	private bindCardDrag(handle: HTMLElement): void {
		handle.addEventListener('pointerdown', (e) => {
			if ((e.target as HTMLElement).closest('button')) return; // 收起按钮不触发拖动
			e.preventDefault();
			handle.setPointerCapture(e.pointerId);
			const rootRect = this.root.getBoundingClientRect();
			const cardRect = this.card.getBoundingClientRect();
			const baseX = cardRect.left - rootRect.left;
			const baseY = cardRect.top - rootRect.top;
			const startX = e.clientX;
			const startY = e.clientY;
			const move = (ev: PointerEvent) => {
				this.cardPos = { x: baseX + (ev.clientX - startX), y: baseY + (ev.clientY - startY) };
				this.card.style.transform = `translate3d(${this.cardPos.x}px, ${this.cardPos.y}px, 0)`;
			};
			const up = (ev: PointerEvent) => {
				handle.releasePointerCapture(ev.pointerId);
				handle.removeEventListener('pointermove', move);
				handle.removeEventListener('pointerup', up);
			};
			handle.addEventListener('pointermove', move);
			handle.addEventListener('pointerup', up);
		});
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
		if (this.cardIndex >= 0 && !this.mobileCard && !this.cardPos) {
			// 未手动拖动时才自动跟随节点投影
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
