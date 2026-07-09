import type { App } from 'obsidian';
import { Component, debounce, getAllTags } from 'obsidian';
import type { GraphData } from '../types';
import { buildGraph } from './buildGraph';
import { buildAdjacency } from './Adjacency';
import type { Adjacency } from './Adjacency';
import { seedPosition, seedRadius } from './seed';

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
	private showTagHubs = false;
	private tagHubLimit = 20;
	private nodeCap: number | null = null;
	private linkCap: number | null = null;
	private onChanged: (() => void) | null = null;

	constructor(private app: App) {
		super();
	}

	/** dataChanged 在防抖重建完成后触发（调用方负责 reheat + 重建渲染缓冲） */
	init(includeUnresolved: boolean, includeOrphans: boolean, showTagHubs: boolean, tagHubLimit: number, onChanged: () => void): void {
		this.includeUnresolved = includeUnresolved;
		this.includeOrphans = includeOrphans;
		this.showTagHubs = showTagHubs;
		this.tagHubLimit = tagHubLimit;
		this.onChanged = onChanged;
		const rebuildSoon = debounce(() => this.rebuild(true), 800, true);
		this.registerEvent(this.app.metadataCache.on('resolved', rebuildSoon));
		this.registerEvent(this.app.vault.on('rename', rebuildSoon));
		this.registerEvent(this.app.vault.on('delete', rebuildSoon));
	}

	async ensureCacheReady(): Promise<void> {
		if (Object.keys(this.app.metadataCache.resolvedLinks).length > 0) return;
		await new Promise<void>((resolve) => {
			this.registerEvent(this.app.metadataCache.on('resolved', () => resolve()));
		});
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

	setTagHubs(show: boolean, limit: number): void {
		if (show === this.showTagHubs && limit === this.tagHubLimit) return;
		this.showTagHubs = show;
		this.tagHubLimit = limit;
		this.rebuild(true);
	}

	/** preservePositions=false 用于基准（全新确定性种子 → 完整冷布局） */
	rebuild(preservePositions: boolean): void {
		const files = this.app.vault.getMarkdownFiles().map((f) => ({
			path: f.path,
			basename: f.basename,
			size: f.stat.size,
			tags: getAllTags(this.app.metadataCache.getFileCache(f) ?? {}) ?? [],
		}));
		const next = buildGraph(files, this.app.metadataCache.resolvedLinks, this.app.metadataCache.unresolvedLinks, {
			includeUnresolved: this.includeUnresolved,
			includeOrphans: this.includeOrphans,
			nodeCap: this.nodeCap,
			linkCap: this.linkCap,
			tagHubLimit: this.showTagHubs ? this.tagHubLimit : null,
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
		this.onChanged?.();
	}
}
