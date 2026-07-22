import type { App, TAbstractFile } from 'obsidian';
import { Component, TFile, TFolder, debounce, getAllTags } from 'obsidian';
import type { GraphData } from '../types';
import { buildGraph } from './buildGraph';
import { applyFilter, folderStats, isFilterActive, parseFilterQuery, type FilterQuery, type NoteFilter } from './noteFilter';
import { buildAdjacency } from './Adjacency';
import type { Adjacency } from './Adjacency';
import { seedPosition, seedRadius } from './seed';
import { readGhostEdges } from '../settings/ghostEdgeImport';
import type { GhostEdgeRecord } from '../settings/ghostEdgeImport';
import { isMarkdownFile, selectGraphFiles } from './graphFiles';
import { CanvasLinkCache, mergeResolvedLinks, parseCanvasFileLinks } from './canvasLinks';
import { boundedTagHubLimit } from './tagLens';

/** 幽灵边（Constellation 待定建议）：节点下标 + 强度。不计 degree、不进邻接、不参与布局力。 */
export interface GhostLink {
	source: number;
	target: number;
	score: number;
}

/**
 * 唯一读 metadataCache 的模块。
 * 持有 GraphData + 坐标数组；重建时按 id 保留旧坐标（身份保持合并），
 * 布局只需低温重热，星系不爆炸。
 */
export class GraphStore extends Component {
	data: GraphData = { nodes: [], links: [] };
	/** x,y,z × nodes.length，布局引擎原地写，渲染器只读 */
	positions = new Float32Array(0);
	/** CSR 邻接：选中/巡游按邻域 O(邻域) 而非 O(全边)；随数据每次重建 */
	adjacency: Adjacency = { offset: new Int32Array(1), neighbor: new Int32Array(0), linkOf: new Int32Array(0) };

	private includeUnresolved = false;
	private includeOrphans = true;
	private includeTags = false;
	private showTagHubs = false;
	private tagHubLimit = 20;
	/** 笔记过滤（#11）：文件夹显隐（图例，主）＋ 文本查询（逃生口，次） */
	private filter: NoteFilter = { hiddenFolders: new Set(), query: [] };
	/**
	 * 图例数据：顶层文件夹 → 笔记数，按数量降序。**由未过滤的全量文件算**——
	 * 否则点灭一个文件夹会让其他 chip 的数字跟着跳。也是配色色相的分配依据。
	 */
	folders: { folder: string; count: number }[] = [];
	private nodeCap: number | null = null;
	private linkCap: number | null = null;
	private onChanged: (() => void) | null = null;

	/** 幽灵边：未确认数据不移动星系——虚线浮在既有结构之上本身就是「这里缺一条链接」的视觉论证 */
	ghostLinks: GhostLink[] = [];
	private showGhostEdges = true;
	private ghostRaw: GhostEdgeRecord[] = [];
	private ghostKey = '';
	/** Core Obsidian 1.13 does not index Canvas metadata; cache file-card links separately. */
	private readonly canvasLinks = new CanvasLinkCache();
	private dirtyCanvasPaths = new Set<string>();
	private structuralCanvasPaths = new Set<string>();
	private active = false;

	constructor(private app: App) {
		super();
	}

	/** dataChanged 在防抖重建完成后触发（调用方负责 reheat + 重建渲染缓冲） */
	init(
		includeUnresolved: boolean,
		includeOrphans: boolean,
		includeTags: boolean,
		showTagHubs: boolean,
		tagHubLimit: number,
		filter: { hiddenFolders: string[]; query: string },
		onChanged: () => void,
	): void {
		this.includeUnresolved = includeUnresolved;
		this.includeOrphans = includeOrphans;
		this.includeTags = includeTags;
		this.showTagHubs = showTagHubs;
		this.tagHubLimit = boundedTagHubLimit(tagHubLimit);
		// 走字段而非 setter：后者会自己触发一次重建，而调用方紧接着就要 rebuild(false)
		this.filter = { hiddenFolders: new Set(filter.hiddenFolders), query: parseFilterQuery(filter.query) };
		this.onChanged = onChanged;
		this.active = true;
		const rebuildSoon = debounce(() => this.rebuild(true), 800, true);
		const refreshCanvasSoon = debounce(() => {
			const paths = [...this.dirtyCanvasPaths];
			const structuralPaths = new Set(this.structuralCanvasPaths);
			this.dirtyCanvasPaths.clear();
			this.structuralCanvasPaths.clear();
			void this.refreshCanvasFiles(paths, structuralPaths);
		}, 800, true);
		const markCanvasDirty = (path: string, structural = false) => {
			this.canvasLinks.mark(path);
			this.dirtyCanvasPaths.add(path);
			if (structural) this.structuralCanvasPaths.add(path);
			refreshCanvasSoon();
		};
		this.register(() => {
			this.active = false;
			rebuildSoon.cancel();
			refreshCanvasSoon.cancel();
			this.dirtyCanvasPaths.clear();
			this.structuralCanvasPaths.clear();
		});
		this.registerEvent(this.app.metadataCache.on('resolved', rebuildSoon));
		this.registerEvent(this.app.vault.on('create', (file) => {
			if (isCanvasFile(file)) markCanvasDirty(file.path, true);
			else if (file instanceof TFile && isMarkdownFile(file)) rebuildSoon();
		}));
		this.registerEvent(this.app.vault.on('modify', (file) => {
			if (isCanvasFile(file)) markCanvasDirty(file.path);
		}));
		this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
			if (file instanceof TFolder) {
				this.canvasLinks.renameTree(oldPath, file.path);
				const canvases = this.app.vault.getFiles().filter((child) => isCanvasFile(child) && isPathInside(child.path, file.path));
				if (canvases.length === 0) rebuildSoon();
				else canvases.forEach((child) => markCanvasDirty(child.path, true));
				return;
			}
			const wasCanvas = isCanvasPath(oldPath);
			const isCanvas = isCanvasFile(file);
			if (wasCanvas && isCanvas) {
				this.canvasLinks.renameFile(oldPath, file.path, true);
				markCanvasDirty(file.path, true);
			} else if (wasCanvas) {
				this.canvasLinks.remove(oldPath);
				rebuildSoon();
			} else if (isCanvas) {
				this.canvasLinks.renameFile(oldPath, file.path, false);
				markCanvasDirty(file.path, true);
			} else if (isMarkdownPath(oldPath) || (file instanceof TFile && isMarkdownFile(file))) {
				this.canvasLinks.renameFile(oldPath, file.path, false);
				rebuildSoon();
			}
		}));
		this.registerEvent(this.app.vault.on('delete', (file) => {
			if (file instanceof TFolder) this.canvasLinks.removeTree(file.path);
			else if (isCanvasFile(file) || isCanvasPath(file.path)) this.canvasLinks.remove(file.path);
			if (file instanceof TFolder || isCanvasPath(file.path) || isMarkdownPath(file.path)) rebuildSoon();
		}));
	}

	async ensureCacheReady(): Promise<void> {
		await this.loadCanvasLinks();
	}

	/** Initial O(total Canvas bytes) read, once before the first graph build. */
	private async loadCanvasLinks(): Promise<void> {
		const canvases = this.app.vault.getFiles().filter(isCanvasFile);
		for (let offset = 0; offset < canvases.length; offset += 8) {
			await Promise.all(canvases.slice(offset, offset + 8).map(async (file) => {
				const path = file.path;
				const revision = this.canvasLinks.capture(path);
				try {
					const parsed = parseCanvasFileLinks(await this.app.vault.cachedRead(file));
					if (this.active && parsed !== null) this.canvasLinks.apply(path, revision, parsed);
				} catch {
					// A later modify event retries; an initial failure simply contributes no Canvas edges.
				}
			}));
			if (!this.active) return;
		}
	}

	/** Debounced incremental refresh: reread only changed Canvas files, then rebuild once. */
	private async refreshCanvasFiles(paths: readonly string[], structuralPaths: ReadonlySet<string>): Promise<void> {
		if (paths.length === 0) return;
		let shouldRebuild = paths.some((path) => structuralPaths.has(path));
		for (const path of new Set(paths)) {
			const revision = this.canvasLinks.capture(path);
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile) || !isCanvasFile(file)) {
				shouldRebuild = this.canvasLinks.remove(path) || shouldRebuild;
				continue;
			}
			try {
				const parsed = parseCanvasFileLinks(await this.app.vault.cachedRead(file));
				if (!this.active) return;
				if (parsed === null) continue; // Obsidian may emit modify while JSON is mid-write.
				const applied = this.canvasLinks.apply(path, revision, parsed);
				// Even unchanged links need one rebuild so file size/date-derived data stays current.
				shouldRebuild = applied.accepted || shouldRebuild;
			} catch {
				// Preserve the last good cache on transient read errors.
			}
		}
		if (shouldRebuild && this.active) this.rebuild(true);
	}

	setIncludeUnresolved(v: boolean): void {
		if (v === this.includeUnresolved) return;
		this.includeUnresolved = v;
		this.rebuild(true);
	}

	getIncludeUnresolved(): boolean {
		return this.includeUnresolved;
	}

	/** 质量档位的节点/链接帽；变化时重建（保坐标） */
	setCaps(nodeCap: number | null, linkCap: number | null): void {
		if (nodeCap === this.nodeCap && linkCap === this.linkCap) return;
		this.nodeCap = nodeCap;
		this.linkCap = linkCap;
		this.rebuild(true);
	}

	setIncludeOrphans(v: boolean): void {
		if (v === this.includeOrphans) return;
		this.includeOrphans = v;
		this.rebuild(true);
	}

	setIncludeTags(v: boolean): void {
		if (v === this.includeTags) return;
		this.includeTags = v;
		this.rebuild(true);
	}

	/** showTags 是数据总闸；总闸关闭时只记设置，不为无效 hubs 白重建。 */
	setTagHubs(show: boolean, limit: number): void {
		const bounded = boundedTagHubLimit(limit);
		if (show === this.showTagHubs && bounded === this.tagHubLimit) return;
		this.showTagHubs = show;
		this.tagHubLimit = bounded;
		if (this.includeTags) this.rebuild(true);
	}

	/**
	 * 文本查询（#11 的逃生口）。调用方负责防抖——每次重建都要重跑布局，不能逐键触发。
	 * 解析后比较词表而非原串：`file:a` 与 `file:  a` 语义相同就不该白重建一次。
	 */
	setFilterQuery(raw: string): void {
		const next = parseFilterQuery(raw);
		if (sameQuery(next, this.filter.query)) return;
		this.filter = { hiddenFolders: this.filter.hiddenFolders, query: next };
		this.rebuild(true);
	}

	/** 文件夹显隐（#11 的主交互：可点图例）。点一下就重建，无需防抖 */
	setHiddenFolders(hidden: readonly string[]): void {
		const next = new Set(hidden);
		const cur = this.filter.hiddenFolders;
		if (next.size === cur.size && [...next].every((f) => cur.has(f))) return;
		this.filter = { hiddenFolders: next, query: this.filter.query };
		this.rebuild(true);
	}

	isFiltered(): boolean {
		return isFilterActive(this.filter);
	}

	setShowGhostEdges(v: boolean): void {
		if (v === this.showGhostEdges) return;
		this.showGhostEdges = v;
		this.resolveGhost();
		this.onChanged?.();
	}

	/** 路径 → 当前节点下标；任一端不在图中的边丢弃 */
	private resolveGhost(): void {
		if (!this.showGhostEdges || this.ghostRaw.length === 0) {
			this.ghostLinks = [];
			return;
		}
		const idxById = new Map<string, number>();
		this.data.nodes.forEach((n, i) => idxById.set(n.id, i));
		const out: GhostLink[] = [];
		for (const r of this.ghostRaw) {
			const s = idxById.get(r.source);
			const t = idxById.get(r.target);
			if (s === undefined || t === undefined || s === t) continue;
			out.push({ source: s, target: t, score: r.state === 'deferred' ? r.score * 0.6 : r.score });
		}
		this.ghostLinks = out;
	}

	/** 异步重读协议文件；内容未变不惊动渲染（防 rebuild→refresh 循环） */
	async refreshGhost(): Promise<void> {
		const raw = (await readGhostEdges(this.app)) ?? [];
		const key = JSON.stringify(raw);
		if (key === this.ghostKey) return;
		this.ghostKey = key;
		this.ghostRaw = raw;
		this.resolveGhost();
		this.onChanged?.();
	}

	/** preservePositions=false 用于基准（全新确定性种子 → 完整冷布局） */
	rebuild(preservePositions: boolean): void {
		const withTags = this.includeTags; // 总闸关闭时不取 cache，chips/颜色/hubs 都无隐藏成本
		const all = selectGraphFiles(this.app.vault.getFiles());
		this.folders = folderStats(all); // 图例：全量算，不受过滤影响（否则 chip 数字会互相跳）
		// TFile 自带 path/basename，结构上就满足 FilterableRecord —— 先过滤再 map，
		// 被滤掉的笔记既不付 getFileCache 的钱，也不进对象分配
		const files = applyFilter(all, this.filter).map((f) => {
			const rec: { path: string; basename: string; size: number; tags?: string[] } = {
				path: f.path,
				basename: f.basename,
				size: f.stat.size,
			};
			if (withTags && isMarkdownFile(f)) {
				const cache = this.app.metadataCache.getFileCache(f);
				rec.tags = cache ? (getAllTags(cache) ?? []) : [];
			}
			return rec;
		});
		const resolvedLinks = mergeResolvedLinks(this.app.metadataCache.resolvedLinks, this.canvasLinks.asLinkTable());
		const next = buildGraph(files, resolvedLinks, this.app.metadataCache.unresolvedLinks, {
			includeUnresolved: this.includeUnresolved,
			includeOrphans: this.includeOrphans,
			includeTags: this.includeTags,
			includeTagHubs: this.includeTags && this.showTagHubs,
			tagHubLimit: this.tagHubLimit,
			nodeCap: this.nodeCap,
			linkCap: this.linkCap,
		});

		const oldIndexById = new Map<string, number>();
		if (preservePositions) {
			this.data.nodes.forEach((n, i) => oldIndexById.set(n.id, i));
		}
		const oldPositions = this.positions;

		const radius = seedRadius(next.nodes.length);
		const positions = new Float32Array(next.nodes.length * 3);
		next.nodes.forEach((n, i) => {
			const oi = oldIndexById.get(n.id);
			if (oi !== undefined && oi * 3 + 2 < oldPositions.length) {
				positions[i * 3] = oldPositions[oi * 3] ?? 0;
				positions[i * 3 + 1] = oldPositions[oi * 3 + 1] ?? 0;
				positions[i * 3 + 2] = oldPositions[oi * 3 + 2] ?? 0;
			} else {
				const [x, y, z] = seedPosition(n.id, radius);
				positions[i * 3] = x;
				positions[i * 3 + 1] = y;
				positions[i * 3 + 2] = z;
			}
		});

		this.data = next;
		this.positions = positions;
		this.adjacency = buildAdjacency(next); // 派生数据，键于新（可能重排）索引
		this.resolveGhost(); // 幽灵边随索引重排重新解析（用缓存的 ghostRaw，同步）
		this.onChanged?.();
		void this.refreshGhost(); // 顺带异步重读文件：接受建议→真实链接落盘→重建时虚线自然消失
	}
}

function isCanvasPath(path: string): boolean {
	return path.toLowerCase().endsWith('.canvas');
}

function isMarkdownPath(path: string): boolean {
	return path.toLowerCase().endsWith('.md');
}

function isCanvasFile(file: TAbstractFile): file is TFile {
	return file instanceof TFile && file.extension.toLowerCase() === 'canvas';
}

function isPathInside(path: string, folderPath: string): boolean {
	const prefix = folderPath.endsWith('/') ? folderPath : `${folderPath}/`;
	return path.startsWith(prefix);
}

/** 词表等价判断：语义相同的两次输入（`file:a` / `file:  a`）不该白触发一次重建 */
function sameQuery(a: FilterQuery, b: FilterQuery): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		const x = a[i];
		const y = b[i];
		if (!x || !y || x.field !== y.field || x.value !== y.value || x.negate !== y.negate) return false;
	}
	return true;
}
