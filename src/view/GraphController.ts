import type { App } from 'obsidian';
import { Notice, Platform, debounce } from 'obsidian';
import { Spherical, Vector3 } from 'three';
import type { BenchResult, GraphNode } from '../types';
import type { GalaxySettings } from '../settings';
import { DEFAULT_SETTINGS, toLayoutParams } from '../settings';
import { readGraphColorGroups } from '../settings/graphJsonImport';
import type { ColorTheme } from '../render/colorThemes';
import { COLOR_THEMES } from '../render/colorThemes';
import { GraphStore } from '../data/GraphStore';
import { neighborhood, shortestPath } from '../data/Adjacency';
import { seedRadius } from '../data/seed';
import type { LayoutEngine } from '../layout/LayoutEngine';
import { MainThreadForceLayout } from '../layout/MainThreadForceLayout';
import { WorkerForceLayout } from '../layout/WorkerForceLayout';
import { AggregateRenderer } from '../render/AggregateRenderer';
import { makeNodeColorFn, makeTagColorFn, fallbackColorFn, assignFolderHues, folderCoveredByGroups, type NodeColorFn } from '../render/palette';
import { DAYLIGHT, DEEP_SPACE } from '../render/presets';
import { CameraDirector } from '../interactions/CameraDirector';
import { TourDirector } from '../tour/TourDirector';
import { ControlPanel } from '../overlay/ControlPanel';
import type { StylePreset } from '../render/stylePresets';
import { STYLE_PRESETS } from '../render/stylePresets';
import { OverlayManager } from '../overlay/OverlayManager';
import { NodeSearchModal } from './SearchModal';
import { resolveLang, setLang, t } from '../i18n';
import type { LangPref } from '../i18n';
import { collectFrames, observeLongTasks, writeBenchResult, sleep } from '../bench/bench';
import type { QualityTier } from '../quality/tiers';
import { TIERS } from '../quality/tiers';
import { elapsedFrameSeconds, frameDeltaSeconds, progress01, safeFrameSeconds } from '../timing/frameClock';
import { WindowFrameLoop } from '../timing/windowFrameLoop';
import { WindowVisibilityBinding } from '../timing/windowVisibility';
import { selectGraphFiles } from '../data/graphFiles';
import { resolveTagLens, toggleTagLens as nextTagLens, topTags } from '../data/tagLens';
import type { TopTag } from '../data/tagLens';

const WARM_CACHE_MIN_COVERAGE = 0.8;
const ESTABLISHING_MS = 3200;
// 分级调暗（aDim 目标）：选中/一度=全亮，二度=外壳，其余=淡出。起点值，可眼调。
const SELECT_DIM = { self: 1, d1: 1, d2: 0.45, rest: 0.12 };

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
	private tour: TourDirector | null = null;

	private frameLoop: WindowFrameLoop | null = null;
	private paused = false;
	private benchMode = false;
	private benchRunning = false;
	private selected = -1;
	/** 数据重建时算一次；chip 点击只读这份 top 12，避免 Lens 激活时重复排序全部标签。 */
	private topTagList: TopTag[] = [];
	private graphRadius = 200;
	private wasSettled = false;
	private shot: { elapsedMs: number; durMs: number; fromBloom: number } | null = null;
	private maskEl: HTMLElement | null = null;

	private hudFrames: number[] = [];
	private boundWin: Window | null = null; // 视图当前所在窗口（可能被移动到弹出窗口，见 issue #4）
	private visibilityBinding: WindowVisibilityBinding | null = null;
	private disposeFns: (() => void)[] = [];
	private saveSoon: () => void;
	/** 结构性操作（存/删/移/改名预设）立即写盘，绕开 800ms 防抖——避免存完立刻退出丢失 */
	private saveNow: () => void;
	/** 过滤查询防抖（#11）：每次生效都要重建图 + 重热布局，逐键触发会把大库打死 */
	private filterSoon: (q: string) => void;
	/** hub 数量滑杆会连续发 input；只在停手后做一次 O(N+tags) 图重建。 */
	private tagHubsSoon: (() => void) & { cancel(): void };
	/** 当前生效的节点调色函数；面板图例要用它取真实颜色，故在此留一份而不只丢给 renderer */
	private colorFn: NodeColorFn = fallbackColorFn;
	private tier: QualityTier = TIERS.high;
	private autoLow = false; // auto 档当前是否降到 low（可双向）
	private lowFpsChecks = 0;
	private highFpsChecks = 0;
	private lastWatchdogAt = 0;
	private disposed = false;
	/** WebGL 上下文丢失时由视图重建（GalaxyView 注入） */
	onContextLost: (() => void) | null = null;

	constructor(
		private app: App,
		private contentEl: HTMLElement,
		private settings: GalaxySettings,
		saveSettings: () => void,
	) {
		this.store = new GraphStore(app);
		this.saveNow = saveSettings;
		this.saveSoon = debounce(saveSettings, 800, true);
		// 300ms：短到打完就出结果，长到连打不会每键重建（3.2k 笔记的库上一次重建+重热是几十 ms 起）
		this.filterSoon = debounce((q: string) => this.store.setFilterQuery(q), 300, false);
		this.tagHubsSoon = debounce(
			() => this.store.setTagHubs(this.settings.showTagHubs, this.settings.tagHubLimit),
			180,
			false,
		);
	}

	get counts(): { nodes: number; links: number } {
		return { nodes: this.store.data.nodes.length, links: this.store.data.links.length };
	}

	async start(): Promise<void> {
		this.store.init(
			this.settings.showUnresolved,
			this.settings.showOrphans,
			this.settings.showTags,
			this.settings.showTagHubs,
			this.settings.tagHubLimit,
			{ hiddenFolders: this.settings.hiddenFolders, query: this.settings.filterQuery },
			() => this.onDataChanged(),
		);
		await this.store.ensureCacheReady();
		if (this.disposed) return;
		this.store.rebuild(false);

		// 暖启动：用上次沉降坐标覆盖种子 → 重开即成形
		const coverage = this.applyPositionCache();
		const warm = coverage >= WARM_CACHE_MIN_COVERAGE;

		const container = this.contentEl.createDiv({ cls: 'galaxy-view-canvas' });
		this.graphRadius = seedRadius(this.store.data.nodes.length) * 1.6;
		const renderer = new AggregateRenderer(container, this.graphRadius);
		this.renderer = renderer;
		this.applyColorFn();
		renderer.setData(this.store.data, this.store.positions);
		renderer.setGhostLinks(this.settings.showGhostEdges ? this.store.ghostLinks : []);
		this.initLayout(warm ? 0.06 : 1);

		this.director = new CameraDirector(renderer.camera, renderer.renderer.domElement, {
			onFlyToSelected: () => this.flyToSelected(),
			onResetView: () => this.recenter(),
		});
		// 盘类默认取景仰角（银河重做默认俯视看盘）
		const galaxyElev = STYLE_PRESETS.find((p) => p.id === 'galaxy')?.frameElevDeg;
		if (galaxyElev !== undefined) this.director.setFramingElev(galaxyElev);

		this.overlay = new OverlayManager(this.contentEl, this.app, renderer, {
			openNote: (id) => void this.app.workspace.openLinkText(id, '', true),
			focusNode: (i) => this.selectNode(i, true),
			getSelectionDepth: () => this.settings.selectionDepth,
			onSelectionDepth: (depth) => {
				this.settings.selectionDepth = depth;
				this.saveSoon();
				if (this.selected >= 0) this.selectNode(this.selected, false);
			},
		});
		this.overlay.setData(this.store.data, this.graphRadius);

		this.tour = new TourDirector({
			nodeCount: () => this.store.data.nodes.length,
			degreeOf: (i) => (this.store.data.nodes[i]?.tag ? 0 : (this.store.data.nodes[i]?.degree ?? 0)),
			nodePosition: (i, out) => renderer.nodePosition(i, out),
			graphRadius: () => this.graphRadius,
			selectNode: (i, fly) => this.selectNode(i, fly),
			clearSelection: () => this.clearSelection(),
			recenter: () => this.recenter(),
			flyPath: (wp, dur, opts) => this.director?.flyPath(wp, dur, opts),
			beginIdleOrbit: () => this.director?.beginFocusOrbit(null),
			onPath: () => this.director?.onPath ?? false,
			onStateChange: (on) => {
				this.panel?.setTourRunning(on);
				if (this.director) this.director.tourActive = on; // 巡游期间强制环绕（即便巡航关）
			},
		});

		this.applySettings();
		this.applyPreset();
		this.applyTier();
		this.buildPanel();
		this.applyTagLens();
		this.bindPicking(renderer.renderer.domElement);
		this.bindContextLost(renderer.renderer.domElement);
		this.bindVisibility();
		this.resize();

		// 首次导入 2D 配色（仅当从未导入过）
		if (this.settings.colorGroups.length === 0) void this.importColors(false);

		// 开场：暖启动走「拉出式」开场镜头；冷启动直接看星系成形（本身就是剧场）
		if (warm) this.playEstablishing();
		else {
			const f = this.computeFraming();
			this.director.setInitialFraming(f.center, f.radius);
		}

		const loop = (now: number, previousNow: number | null) => {
			if (this.disposed) return;
			// 不同 Electron 窗口的 rAF timestamp 不保证同一 timeOrigin。窗口切换首帧取 0，
			// 动画使用不截短的安全 elapsed 保持真实时长；模拟/渲染仍限制长帧避免跳跃（#14）。
			const animationDeltaS = elapsedFrameSeconds(now, previousNow);
			const deltaS = frameDeltaSeconds(now, previousNow);
			if (!this.paused) {
				if (this.layout.step()) this.renderer?.updatePositions();
				this.checkSettled();
				if (!this.benchMode) {
					// tick + 相机 update 一起兜底：任一抛错都不能让异常冒泡冻结整个 rAF 循环
					// （曾因 flyby 的 CatmullRom 采样在 director.update 里抛错，整个视图卡死 = 「点了没反应」）
					try {
						this.tour?.tick(animationDeltaS); // 巡游先编排本帧运动，再由 director 执行；随 paused 冻结
						this.director?.update(now, animationDeltaS, deltaS);
					} catch (err) {
						this.tour?.abort();
						this.director?.cancelMotion(); // 清掉可能损坏的路径/补间，避免下一帧继续抛
						new Notice(t('notice.tourError', { msg: err instanceof Error ? err.message : String(err) }));
					}
				}
				this.stepShot(animationDeltaS);
				this.renderer?.render(deltaS);
				const { clientWidth: w, clientHeight: h } = this.contentEl;
				this.overlay?.update(w, h);
			}
			this.updateHud(now);
			this.watchdog(now);
		};
		this.frameLoop = new WindowFrameLoop(loop);
		this.frameLoop.setOwner(this.boundWin ?? this.contentEl.ownerDocument.defaultView ?? window);
	}

	/** Electron GPU 重置 → 遮罩 + 一键重建（前人插件的隐性死因之一） */
	private bindContextLost(canvas: HTMLElement): void {
		const onLost = (e: Event) => {
			e.preventDefault();
			const mask = this.contentEl.createDiv({ cls: 'gx-mask' });
			const btn = mask.createEl('button', { cls: 'gx-mask-btn', text: '渲染上下文丢失，点击重建' });
			btn.addEventListener('click', () => this.onContextLost?.());
		};
		canvas.addEventListener('webglcontextlost', onLost);
		this.disposeFns.push(() => canvas.removeEventListener('webglcontextlost', onLost));
	}

	resize(): void {
		// 视图可能被「移动到新窗口」——document 变了就重绑可见性（否则旧观察器误判不可见 → 黑屏，issue #4）
		if (this.contentEl.ownerDocument.defaultView !== this.boundWin) this.rebindVisibility();
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
			this.renderer?.refreshClusterClouds(); // 集群云雾按沉降后的坐标重算
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
			const f = this.computeFraming();
			const inner = f.radius * 0.5;
			const elev = (10 * Math.PI) / 180;
			// 开场从质心内部起飞，拉出到全局取景
			renderer.camera.position.set(f.center.x + inner * Math.cos(elev), f.center.y + inner * Math.sin(elev), f.center.z + inner * 0.2);
			director.target.copy(f.center);
			director.resetView(f.center, f.radius, () => director.beginFocusOrbit(null)); // 内部 → 总览 → 即时巡航
			renderer.playReveal(2600); // 创世动画：节点从中心波次绽放（G2.5 反馈）
			this.shot = { elapsedMs: 0, durMs: ESTABLISHING_MS, fromBloom: this.settings.bloom.strength * 1.8 };
		}, 450);
	}

	/** 开场期间辉光从 1.8× 回落到设置值（NASA「明亮诞生」） */
	private stepShot(deltaS: number): void {
		if (!this.shot || !this.renderer) return;
		this.shot.elapsedMs += safeFrameSeconds(deltaS) * 1000;
		const t = progress01(this.shot.elapsedMs, this.shot.durMs);
		const v = this.shot.fromBloom + (this.settings.bloom.strength - this.shot.fromBloom) * t;
		this.renderer.setBloomStrength(v);
		if (t >= 1) this.shot = null;
	}

	// ---------- 数据 ----------

	/**
	 * 唯一的调色入口：先按图例顺序发回退色相（修撞色），再落给 renderer，同时留一份给面板图例取色。
	 * 不传 fn 时按当前 colorGroups 自动选（有组走组，无组走文件夹回退）。
	 */
	private applyColorFn(fn?: NodeColorFn): void {
		const groups = this.settings.colorGroups;
		// 色相按笔记数排名发、且只发给没被配色组吃掉的文件夹——必须在 colorFn 生效前做完
		assignFolderHues(
			this.store.folders.map((f) => f.folder),
			(folder) => folderCoveredByGroups(folder, groups),
		);
		const base = fn ?? (groups.length > 0 ? makeNodeColorFn(groups) : fallbackColorFn);
		this.colorFn = this.settings.showTags && this.settings.colorByTag ? makeTagColorFn(base) : base;
		this.renderer?.setColorFn(this.colorFn);
		this.panel?.refreshFolders(); // 色相可能重发了，图例的点要跟着变
	}

	/** 顶层文件夹在图上的真实颜色，喂给面板图例——图例跟图对不上就不是图例而是装饰 */
	private folderHex(folder: string): string {
		if (folder === '') return '#9aa4b2'; // 根目录 = palette 的 NEUTRAL
		// 探针节点：配色组按 node.id 的 path: 前缀匹配，故 id 要带上文件夹前缀
		const probe: GraphNode = {
			id: `${folder}/`,
			name: folder,
			folderTop: folder,
			degree: 0,
			inDegree: 0,
			outDegree: 0,
			fileSize: 0,
			tags: [],
			unresolved: false,
			tag: false,
		};
		return `#${this.colorFn(probe).getHexString()}`;
	}

	private onDataChanged(): void {
		this.topTagList = topTags(this.store.data, 12, this.settings.tagLens);
		if (!this.renderer) return;
		this.tour?.abort(); // 索引即将重排，中止巡游以免飞错节点
		// 先清旧索引对应的选择层；新数据落下后再按持久化 tag id 重建 Lens。
		this.selected = -1;
		this.renderer.setFocus(null);
		this.renderer.setSelectedLinks([], []);
		this.overlay?.setSelection(-1, new Set());
		this.applyColorFn(); // 文件夹集合可能变了 → 重发色相 + 刷图例
		this.renderer.setData(this.store.data, this.store.positions);
		this.renderer.setGhostLinks(this.settings.showGhostEdges ? this.store.ghostLinks : []);
		this.overlay?.setData(this.store.data, this.graphRadius);
		this.applyTagLens();
		this.panel?.refreshTags();
		// 过滤到空图时给一句——整个 3D 视图空掉会像崩了，这个不是「一试就懂」的
		this.panel?.setFilterEmpty(this.store.isFiltered() && this.store.data.nodes.length === 0);
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
			new Notice(t('notice.workerFallback'));
		}
	}

	// ---------- 质量档位（M4） ----------

	/** Platform.isMobile 硬上限；手动覆盖绝对优先；auto=high+看门狗 */
	private pickTier(): QualityTier {
		if (Platform.isMobile) return TIERS.mobile;
		const o = this.settings.qualityOverride;
		if (o === 'high' || o === 'low' || o === 'mobile') return TIERS[o];
		return this.autoLow ? TIERS.low : TIERS.high;
	}

	applyTier(): void {
		const prev = this.tier.id;
		this.tier = this.pickTier();
		if (this.tier.id === 'mobile') this.tour?.abort(); // 移动档禁用巡游（面板分区也隐藏）
		this.renderer?.applyTier(this.tier, this.settings.bloom.strength);
		this.overlay?.setBudgets(this.tier.hubLabels, this.tier.neighborLabels, this.tier.id === 'mobile');
		this.contentEl.toggleClass('gx-mobile', this.tier.id === 'mobile');
		const total = selectGraphFiles(this.app.vault.getFiles()).length;
		this.store.setCaps(this.tier.nodeCap, this.tier.linkCap); // 变化时触发重建
		if (this.tier.nodeCap !== null && total > this.tier.nodeCap && prev !== this.tier.id) {
			new Notice(t('notice.mobileCap', { n: this.tier.nodeCap, total }));
		}
	}

	/**
	 * 沉降后 FPS 看门狗（v0.3 双向 + 迟滞）：auto 档从 high 起步，优先给最高画质。
	 * 在 high：连续 3×5s 采样 <30fps → 降到 low。在 low：连续 4×5s 采样 >55fps（有余量）→ 升回 high。
	 * 不同阈值 + 不同次数 = 迟滞，防止在临界点反复抖动。
	 */
	private watchdog(now: number): void {
		if (Platform.isMobile) return;
		if (this.settings.qualityOverride !== 'auto' || !this.layout.isSettled() || this.benchRunning || this.paused) return;
		if (now - this.lastWatchdogAt < 5000) return;
		this.lastWatchdogAt = now;
		const fps = this.hudFrames.length;
		if (fps <= 0) return;
		if (!this.autoLow) {
			if (fps < 30) {
				this.lowFpsChecks++;
				this.highFpsChecks = 0;
				if (this.lowFpsChecks >= 3) {
					this.autoLow = true;
					this.lowFpsChecks = 0;
					this.applyTier();
					new Notice(t('notice.watchdog'));
				}
			} else {
				this.lowFpsChecks = 0;
			}
		} else {
			if (fps > 55) {
				this.highFpsChecks++;
				this.lowFpsChecks = 0;
				if (this.highFpsChecks >= 4) {
					this.autoLow = false;
					this.highFpsChecks = 0;
					this.applyTier(); // 有余量 → 升回最高画质
				}
			} else {
				this.highFpsChecks = 0;
			}
		}
	}

	// ---------- 设置与视觉方向 ----------

	private applySettings(): void {
		const s = this.settings;
		this.renderer?.setBloomParams(s.bloom);
		this.renderer?.setNodeScale(s.look.nodeSize);
		this.renderer?.setLinkOpacity(s.look.linkOpacity);
		this.renderer?.setLinkCurve(s.look.linkCurve);
		this.renderer?.setSizeMode(s.look.sizeBy);
		this.renderer?.setStarfieldEnabled(s.showStarfield);
		this.syncNebulaTint();
		this.renderer?.setSpace(s.space);
		if (this.renderer) this.renderer.twinkleFreq = s.look.twinkle;
		if (this.director) {
			this.director.cruiseEnabled = s.cruise;
			this.director.cruiseSpeed = s.cruiseSpeed;
		}
	}

	/** 星云天幕染色 = 当前配色前两组（无导入色时回退哈勃青/紫）；换主题/洗牌/导入后调用 */
	private syncNebulaTint(): void {
		const g = this.settings.colorGroups;
		const a = g[0]?.color ?? '#46d4dc';
		const b = g[1]?.color ?? g[0]?.color ?? '#9a7fe0';
		this.renderer?.setNebulaTint(a, b);
	}

	/** 风格预设 = 辉光+力学+外观+星空+配色 成套切换（点击提交） */
	applyStylePreset(p: StylePreset): void {
		Object.assign(this.settings.bloom, p.bloom);
		Object.assign(this.settings.physics, p.physics);
		Object.assign(this.settings.look, p.look);
		Object.assign(this.settings.space, p.space);
		this.settings.showStarfield = p.starfield;
		this.settings.activePreset = p.id;
		this.applySettings(); // 含 setStarfieldEnabled
		const theme = COLOR_THEMES.find((t) => t.id === p.theme);
		if (theme) this.applyColorTheme(theme); // 套用并持久化配色
		this.layout.updateParams(toLayoutParams(this.settings.physics));
		this.wasSettled = false;
		if (p.frameElevDeg !== undefined) this.director?.setFramingElev(p.frameElevDeg);
		this.saveSoon();
	}

	/** 悬停预设：即时预览「视觉」参数（辉光/外观/星空/配色），不持久、不重热布局（物理只在点击时提交） */
	previewStylePreset(p: StylePreset): void {
		const r = this.renderer;
		if (!r) return;
		r.setBloomParams(p.bloom);
		r.setNodeScale(p.look.nodeSize);
		r.setLinkOpacity(p.look.linkOpacity);
		r.setLinkCurve(p.look.linkCurve);
		r.twinkleFreq = p.look.twinkle;
		r.setSizeMode(p.look.sizeBy);
		r.setStarfieldEnabled(p.starfield);
		r.setSpace(p.space); // 星云染色沿用已烘焙纹理（悬停不重烘焙，点击提交才换色）
		const theme = COLOR_THEMES.find((t) => t.id === p.theme);
		if (theme && this.settings.colorGroups.length > 0) {
			const temp = this.settings.colorGroups.map((g, i) => ({ ...g, color: theme.colors[i % theme.colors.length] ?? g.color }));
			this.applyColorFn(makeNodeColorFn(temp));
			r.recolor();
		}
	}

	/** 结束预览：把「视觉」参数还原到已提交的设置 */
	endStylePreview(): void {
		const r = this.renderer;
		if (!r) return;
		const s = this.settings;
		r.setBloomParams(s.bloom);
		r.setNodeScale(s.look.nodeSize);
		r.setLinkOpacity(s.look.linkOpacity);
		r.setLinkCurve(s.look.linkCurve);
		r.twinkleFreq = s.look.twinkle;
		r.setSizeMode(s.look.sizeBy);
		r.setStarfieldEnabled(s.showStarfield);
		r.setSpace(s.space);
		this.applyColorFn();
		r.recolor();
	}

	// ---------- 自定义预设 ----------

	/** 存当前参数为一个用户预设 */
	saveCurrentAsPreset(): void {
		const n = this.settings.customPresets.length + 1;
		const id = `custom-${Date.now().toString(36)}`;
		const p: StylePreset = {
			id,
			name: t('mine.name', { n }),
			nameEn: t('mine.name', { n }),
			starfield: this.settings.showStarfield,
			space: { ...this.settings.space },
			theme: this.settings.colorTheme,
			bloom: { ...this.settings.bloom },
			physics: { ...this.settings.physics },
			look: { ...this.settings.look },
		};
		this.settings.customPresets.push(p);
		this.settings.activePreset = id;
		this.saveNow();
		this.panel?.refreshPresets();
	}

	moveCustomPreset(i: number, dir: -1 | 1): void {
		const a = this.settings.customPresets;
		const j = i + dir;
		if (j < 0 || j >= a.length) return;
		const tmp = a[i]!;
		a[i] = a[j]!;
		a[j] = tmp;
		this.saveNow();
		this.panel?.refreshPresets();
	}

	deleteCustomPreset(i: number): void {
		const removed = this.settings.customPresets.splice(i, 1)[0];
		if (removed && this.settings.activePreset === removed.id) this.settings.activePreset = '';
		this.saveNow();
		this.panel?.refreshPresets();
	}

	/** 重命名自定义预设：名称同步写入 name/nameEn（两语言都用它，不再回退到「我的 N」）；立即写盘 */
	renameCustomPreset(i: number, name: string): void {
		const p = this.settings.customPresets[i];
		if (!p) return;
		const trimmed = name.trim();
		if (!trimmed) return;
		p.name = trimmed;
		p.nameEn = trimmed;
		this.saveNow();
		this.panel?.refreshPresets();
	}

	/** 分区级还原：把某分区参数复位到当前激活预设的值 */
	restorePresetSection(group: 'bloom' | 'physics' | 'look' | 'space'): void {
		const p = [...STYLE_PRESETS, ...this.settings.customPresets].find((x) => x.id === this.settings.activePreset);
		if (!p) return;
		if (group === 'bloom') Object.assign(this.settings.bloom, p.bloom);
		else if (group === 'physics') Object.assign(this.settings.physics, p.physics);
		else if (group === 'space') {
			Object.assign(this.settings.space, p.space);
			this.settings.showStarfield = p.starfield;
		} else {
			Object.assign(this.settings.look, p.look);
			const theme = COLOR_THEMES.find((t) => t.id === p.theme);
			if (theme) this.applyColorTheme(theme);
		}
		this.applySettings();
		if (group === 'physics') {
			this.layout.updateParams(toLayoutParams(this.settings.physics));
			this.wasSettled = false;
		}
		this.saveSoon();
		this.panel?.refreshAll();
	}

	/** 回中心：清选中 + 平滑回总览 + 到达即绕全局中心巡航 */
	recenter(): void {
		this.clearSelection();
		const f = this.computeFraming();
		this.director?.resetView(f.center, f.radius, () => this.director?.beginFocusOrbit(null));
	}

	/**
	 * 节点云实际取景参数：质心 + 到质心距离的 95 分位半径（避开个别离群孤儿把镜头拉太远/带偏中心）。
	 * 取景用它而非固定种子半径+原点 → 力学铺展多大、质心怎么漂都能框全且居中。无渲染器时回退。
	 */
	private computeFraming(): { center: Vector3; radius: number } {
		const r = this.renderer;
		const n = this.store.data.nodes.length;
		if (!r || n === 0) return { center: new Vector3(), radius: this.graphRadius };
		const tmp = new Vector3();
		const center = new Vector3();
		for (let i = 0; i < n; i++) center.add(r.nodePosition(i, tmp));
		center.divideScalar(n);
		const dists = new Float64Array(n);
		for (let i = 0; i < n; i++) dists[i] = r.nodePosition(i, tmp).distanceTo(center);
		dists.sort(); // 定型数组默认按数值升序
		const idx = Math.min(n - 1, Math.floor(n * 0.95));
		return { center, radius: Math.max(dists[idx] ?? this.graphRadius, this.graphRadius * 0.3) };
	}

	/** 应用配色主题：按序染给现有颜色组（无组则按节点数从顶层文件夹生成） */
	applyColorTheme(theme: ColorTheme): void {
		let groups = this.settings.colorGroups;
		if (groups.length === 0) {
			const byFolder = new Map<string, number>();
			for (const n of this.store.data.nodes) {
				if (n.folderTop && !n.unresolved && !n.tag) byFolder.set(n.folderTop, (byFolder.get(n.folderTop) ?? 0) + 1);
			}
			groups = [...byFolder.entries()]
				.sort((a, b) => b[1] - a[1])
				.slice(0, 9)
				.map(([folder]) => ({ query: `path:${folder}`, color: '#9aa4b2' }));
			this.settings.colorGroups = groups;
		}
		groups.forEach((g, i) => (g.color = theme.colors[i % theme.colors.length] ?? g.color));
		this.settings.colorTheme = theme.id;
		this.applyColorFn(makeNodeColorFn(groups));
		this.renderer?.recolor();
		this.syncNebulaTint();
		this.saveSoon();
	}

	/** 手动触发创世动画（坐标未沉降时给提示） */
	playRevealManually(): void {
		if (!this.layout.isSettled()) {
			new Notice(t('notice.notSettled'));
			return;
		}
		this.renderer?.playReveal();
	}

	/** 在已导入的颜色组之间洗牌（同组不变，颜色互换） */
	shuffleColors(): void {
		const groups = this.settings.colorGroups;
		if (groups.length < 2) {
			new Notice(t('notice.needImport'));
			return;
		}
		const colors = groups.map((g) => g.color);
		for (let i = colors.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[colors[i], colors[j]] = [colors[j]!, colors[i]!];
		}
		groups.forEach((g, i) => (g.color = colors[i] ?? g.color));
		this.settings.colorTheme = 'custom';
		this.applyColorFn(makeNodeColorFn(groups));
		this.renderer?.recolor();
		this.syncNebulaTint();
		this.saveSoon();
	}

	/** preset + app 主题 → tokens（adaptive 深色与深空共用场景） */
	applyPreset(): void {
		if (!this.renderer) return;
		const isDark = this.contentEl.ownerDocument.body.hasClass('theme-dark'); // 用视图自己窗口的主题（支持弹出窗口）
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
			if (notify) new Notice(t('notice.noColorGroups'));
			return;
		}
		this.settings.colorGroups = groups;
		this.applyColorFn(makeNodeColorFn(groups));
		this.renderer?.recolor();
		this.syncNebulaTint();
		this.saveSoon();
		if (notify) new Notice(t('notice.imported', { n: groups.length }));
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
		// CSR 邻域 BFS 到设定深度（取代旧 O(全边) 扫描）
		const { depthOf, linkTier1, linkTier2 } = neighborhood(this.store.adjacency, index, this.settings.selectionDepth);
		// 一度环：标签与环绕方向只用一度（二度会冲淡质心）
		const ring1: number[] = [];
		for (const [i, dd] of depthOf) if (dd === 1) ring1.push(i);
		renderer.setFocus((i) => {
			const dd = depthOf.get(i);
			return dd === undefined ? SELECT_DIM.rest : dd === 0 ? SELECT_DIM.self : dd === 1 ? SELECT_DIM.d1 : SELECT_DIM.d2;
		});
		renderer.setSelectedLinks(linkTier1, linkTier2);
		this.overlay?.setSelection(index, new Set(ring1));
		if (fly) {
			const pos = renderer.nodePosition(index, new Vector3());
			// 一度质心方向：到达后环绕优先扫过链接密集的一侧
			const density = new Vector3();
			let count = 0;
			const tmp = new Vector3();
			for (const ni of ring1) {
				density.add(renderer.nodePosition(ni, tmp));
				count++;
			}
			const densityDir = count > 0 ? density.divideScalar(count).sub(pos) : null;
			director.flyTo(pos, renderer.nodeRadius(index), () => director.beginFocusOrbit(densityDir));
		}
	}

	/** 关联深度切换（1↔2）：翻字段、持久化、若有选中则立即重算高亮（不移镜头） */
	cycleSelectionDepth(): void {
		this.settings.selectionDepth = this.settings.selectionDepth === 1 ? 2 : 1;
		this.saveSoon();
		if (this.selected >= 0) this.selectNode(this.selected, false);
	}

	clearSelection(): void {
		this.selected = -1;
		this.overlay?.setSelection(-1, new Set());
		this.applyTagLens();
	}

	/** Tag Lens 不建立第二套标签数据：直接读取笔记 tags；可选 hub 只补充视觉节点与边。 */
	private applyTagLens(): void {
		const resolved = resolveTagLens(this.store.data, this.store.adjacency, this.settings.showTags, this.settings.tagLens);
		if (this.settings.tagLens !== resolved.id) {
			// 关闭标签或过滤/重建后标签消失：持久化状态也必须同步清掉。
			this.settings.tagLens = resolved.id;
			this.saveSoon();
		}
		this.panel?.refreshTags();
		if (this.selected >= 0) return; // 普通节点选择临时覆盖 Lens；清选择时会再次调用本方法。
		if (!resolved.focus) {
			this.renderer?.setFocus(null);
			this.renderer?.setSelectedLinks([], []);
			return;
		}
		this.renderer?.setFocus((index) => (resolved.focus?.nodeIndices.has(index) ? SELECT_DIM.self : SELECT_DIM.rest));
		this.renderer?.setSelectedLinks(resolved.focus.linkIndices, []);
	}

	private toggleTagLens(tagId: string): void {
		if (!this.settings.showTags) return;
		this.settings.tagLens = nextTagLens(this.settings.tagLens, tagId);
		this.applyTagLens();
		this.saveSoon();
	}

	// ---------- 巡游 / 自动驾驶（v0.3；方向 C = 漫游 + 连接两篇） ----------

	/** 面板「漫游」按钮 / 命令：开始或停止氛围自动巡游 */
	toggleTour(): void {
		if (!this.tour) return;
		try {
			if (this.tour.isRunning) {
				this.tour.stop();
				return;
			}
			this.tour.startWander(this.settings.tour.speed);
			// 无论成功与否都给即时反馈——避免「点了没反应」：能起则「已开始」，否则说明原因（如尚无节点）
			new Notice(this.tour.isRunning ? t('notice.tourStart') : t('notice.tourEmpty'));
		} catch (err) {
			this.tour?.abort();
			new Notice(t('notice.tourError', { msg: err instanceof Error ? err.message : String(err) }));
		}
	}

	/** 连接两篇：选起点 → 选终点 → BFS 最短路 → 逐节点走 */
	startConnectTwo(): void {
		const nodes = this.store.data.nodes;
		if (nodes.length < 2) {
			new Notice(t('notice.tourEmpty'));
			return;
		}
		new Notice(t('notice.guidedPick')); // 即时反馈：引导巡游需先选两点，弹选择器
		new NodeSearchModal(
			this.app,
			nodes,
			(startIdx) => {
				new NodeSearchModal(
					this.app,
					nodes,
					(endIdx) => {
						const path = shortestPath(this.store.adjacency, startIdx, endIdx);
						if (path.length < 2) {
							new Notice(t('notice.noPath'));
							return;
						}
						this.tour?.startGuided(path, this.settings.tour.speed);
						if (this.tour?.isRunning) new Notice(t('notice.tourStart'));
					},
					t('search.pickEnd'),
				).open();
			},
			t('search.pickStart'),
		).open();
	}

	setTourSpeed(): void {
		this.tour?.setSpeed(this.settings.tour.speed);
		this.saveSoon();
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
			const throttle = this.tier.hoverThrottleMs;
			if (throttle === null || hoverPending) return; // 移动档：仅 tap，无 hover
			hoverPending = true;
			window.setTimeout(() => {
				hoverPending = false;
				const renderer = this.renderer;
				if (!renderer) return;
				const rect = dom.getBoundingClientRect();
				const i = renderer.pickNearest(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height, 10);
				this.overlay?.setHover(i);
				dom.style.cursor = i >= 0 ? 'pointer' : 'default';
			}, throttle);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				this.clearSelection();
				e.preventDefault();
			}
		};
		// 双击选中节点 → 打开笔记（公开用户最大 affordance）
		const onDblClick = (e: MouseEvent) => {
			if (e.button !== 0 || this.selected < 0) return;
			const node = this.store.data.nodes[this.selected];
			if (node && !node.unresolved && !node.tag) void this.app.workspace.openLinkText(node.id, '', true);
		};
		dom.addEventListener('pointerdown', onDown);
		dom.addEventListener('pointerup', onUp);
		dom.addEventListener('pointermove', onMove);
		dom.addEventListener('keydown', onKey);
		dom.addEventListener('dblclick', onDblClick);
		this.disposeFns.push(() => {
			dom.removeEventListener('pointerdown', onDown);
			dom.removeEventListener('pointerup', onUp);
			dom.removeEventListener('pointermove', onMove);
			dom.removeEventListener('keydown', onKey);
			dom.removeEventListener('dblclick', onDblClick);
		});
	}

	// ---------- 可见性暂停 ----------

	private bindVisibility(): void {
		this.visibilityBinding = new WindowVisibilityBinding(this.contentEl, (paused) => {
			this.paused = paused;
		});
		this.rebindVisibility();
	}

	/**
	 * 把可见性判断绑定到「视图当前所在窗口」，支持被移动到弹出窗口（issue #4）：
	 * 旧实现用全局 activeDocument + 主窗口的 IntersectionObserver——视图移到新窗口后，
	 * 观察器把已在新窗口里的元素当作不可见 → paused=true → 渲染循环跳过 → 黑屏。
	 * 这里改用视图自己 document 的可见性 + 新窗口的 IntersectionObserver（root 才是对的）。
	 */
	private rebindVisibility(): void {
		const doc = this.contentEl.ownerDocument;
		const win = doc.defaultView ?? window;
		if (this.boundWin !== win) {
			this.hudFrames = [];
			this.lastWatchdogAt = 0;
			this.lowFpsChecks = 0;
			this.highFpsChecks = 0;
		}
		this.boundWin = win;
		this.visibilityBinding?.bind(win, doc);
		// rAF ID 只能由创建它的 Window 取消；换窗时立即交接，不等旧窗口再跑一帧。
		this.frameLoop?.setOwner(win);
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
				this.renderer?.setLinkCurve(this.settings.look.linkCurve);
				if (this.renderer) this.renderer.twinkleFreq = this.settings.look.twinkle;
				this.saveSoon();
			},
			onSpace: () => {
				this.renderer?.setSpace(this.settings.space);
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
			onPresetHover: (p) => this.previewStylePreset(p),
			onPresetHoverEnd: () => this.endStylePreview(),
			onSavePreset: () => this.saveCurrentAsPreset(),
			onMovePreset: (i, dir) => this.moveCustomPreset(i, dir),
			onDeletePreset: (i) => this.deleteCustomPreset(i),
			onRenamePreset: (i, name) => this.renameCustomPreset(i, name),
			onRestoreSection: (g) => this.restorePresetSection(g),
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
			onShowTags: (on) => {
				if (!on) this.settings.tagLens = null;
				this.store.setIncludeTags(on);
				this.saveSoon();
			},
			onTagLens: (tagId) => this.toggleTagLens(tagId),
			getTopTags: () => this.topTagList,
			onTagColorMode: () => {
				this.applyColorFn();
				this.renderer?.recolor();
				this.saveSoon();
			},
			onTagHubs: () => {
				this.tagHubsSoon.cancel();
				this.store.setTagHubs(this.settings.showTagHubs, this.settings.tagHubLimit);
				this.saveSoon();
			},
			onTagHubLimit: () => {
				this.tagHubsSoon();
				this.saveSoon();
			},
			onResetTags: () => this.resetTags(),
			onHiddenFolders: (hidden) => {
				this.store.setHiddenFolders(hidden); // 点一下就重建，不防抖
				this.saveSoon();
			},
			onFilter: (q) => {
				this.filterSoon(q); // 逐键会重建图 + 重跑布局，必须防抖
				this.saveSoon();
			},
			onStarfield: (on) => {
				this.renderer?.setStarfieldEnabled(on);
				this.saveSoon();
			},
			onStylePreset: (p) => this.applyStylePreset(p),
			onCruiseSpeed: () => {
				if (this.director) this.director.cruiseSpeed = this.settings.cruiseSpeed;
				this.saveSoon();
			},
			onQuality: () => {
				this.autoLow = false;
				this.lowFpsChecks = 0;
				this.highFpsChecks = 0;
				this.applyTier();
				this.saveSoon();
			},
			onSearch: () => this.openSearch(),
			onTourToggle: () => this.toggleTour(),
			onConnectTwo: () => this.startConnectTwo(),
			onTourSpeed: () => this.setTourSpeed(),
			onSectionToggle: (id, open) => {
				this.settings.panelSections[id] = open;
				this.saveSoon();
			},
			getFolders: () => this.store.folders,
			folderColorHex: (f) => this.folderHex(f),
			onLanguage: (lang) => this.setLanguage(lang),
			onPanelWidth: (w) => {
				this.settings.panelWidth = w;
				this.saveSoon();
			},
			onReset: () => {
				// 全部重置 = 回到默认「银河」预设（一整套外观复位）
				const galaxy = STYLE_PRESETS.find((p) => p.id === 'galaxy');
				this.settings.cruise = DEFAULT_SETTINGS.cruise;
				this.settings.cruiseSpeed = DEFAULT_SETTINGS.cruiseSpeed;
				if (galaxy) this.applyStylePreset(galaxy);
				if (this.director) {
					this.director.cruiseEnabled = this.settings.cruise;
					this.director.cruiseSpeed = this.settings.cruiseSpeed;
				}
			},
			runScenario: (s) => void this.runScenario(s),
		});
	}

	/** 只复位标签可视化，不碰预设、文件夹配色、过滤或导航。 */
	private resetTags(): void {
		this.settings.tagLens = null;
		this.settings.colorByTag = DEFAULT_SETTINGS.colorByTag;
		this.settings.showTagHubs = DEFAULT_SETTINGS.showTagHubs;
		this.settings.tagHubLimit = DEFAULT_SETTINGS.tagHubLimit;
		this.tagHubsSoon.cancel();
		this.applyColorFn();
		this.renderer?.recolor();
		this.store.setTagHubs(this.settings.showTagHubs, this.settings.tagHubLimit);
		this.clearSelection();
		this.panel?.refreshAll();
		this.saveSoon();
	}

	/** 语言切换后：销毁旧面板、按当前语言重建 */
	rebuildPanel(): void {
		this.panel?.dispose();
		this.panel = null;
		this.buildPanel();
	}

	/** 面板顶栏语言切换（自动 + 六语） */
	setLanguage(pref: LangPref): void {
		this.settings.language = pref;
		setLang(resolveLang(pref));
		this.saveSoon();
		this.rebuildPanel();
		if (this.selected >= 0) this.selectNode(this.selected, false); // 卡片按新语言重建
	}

	/** 设置页改动耐久偏好后，把它们重新应用到本视图 */
	syncFromSettings(): void {
		this.applySettings();
		this.applyPreset();
		this.autoLow = false;
		this.lowFpsChecks = 0;
		this.highFpsChecks = 0;
		this.applyTier(); // 内部按 qualityOverride 重选档 + store.setCaps
		this.store.setIncludeOrphans(this.settings.showOrphans);
		this.store.setIncludeUnresolved(this.settings.showUnresolved);
		this.store.setTagHubs(this.settings.showTagHubs, this.settings.tagHubLimit);
		this.store.setIncludeTags(this.settings.showTags);
		this.store.setShowGhostEdges(this.settings.showGhostEdges);
		this.applyColorFn();
		this.renderer?.recolor();
		this.applyTagLens();
		this.panel?.refreshAll();
	}

	private updateHud(now: number): void {
		this.hudFrames.push(now); // 每帧都记（看门狗用），仅文本节流
		while (this.hudFrames.length > 0 && now - (this.hudFrames[0] ?? 0) > 1000) this.hudFrames.shift();
		if (now % 500 > 250) return;
		const c = this.counts;
		this.panel?.statsEl?.setText(t('hud.notes', { n: c.nodes })); // 头部：只留笔记数
		this.panel?.advStatsEl?.setText(
			`${this.hudFrames.length} fps · ${this.renderer?.drawCalls ?? 0} calls · ${c.nodes}n/${c.links}l · ` +
				`${this.layout.isSettled() ? t('hud.settled') : t('hud.layouting')}`,
		); // fps/技术指标下放到「高级」
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
		if (this.disposed) return;
		this.disposed = true;
		this.tagHubsSoon.cancel();
		this.store.unload();
		this.frameLoop?.dispose();
		this.frameLoop = null;
		this.visibilityBinding?.dispose();
		this.visibilityBinding = null;
		this.boundWin = null;
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
