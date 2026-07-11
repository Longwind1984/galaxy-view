import {
	ACESFilmicToneMapping,
	BufferAttribute,
	BufferGeometry,
	Color,
	Group,
	LineBasicMaterial,
	LineDashedMaterial,
	LineSegments,
	NoToneMapping,
	PerspectiveCamera,
	Points,
	PointsMaterial,
	Scene,
	ShaderMaterial,
	Vector2,
	Vector3,
	WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { GraphData } from '../types';
import type { SpaceSettings } from '../settings';
import { BLOOM_DEFAULTS, NODE_BASE_RADIUS, NODE_MAX_RADIUS, STARFIELD_ROTATION_RAD_PER_S } from '../constants';
import { NODE_FRAGMENT_SHADER, NODE_VERTEX_SHADER } from './shaders';
import { linkColor, fallbackColorFn } from './palette';
import type { NodeColorFn } from './palette';
import { buildFieldStars, buildStarfield, disposeStarfield, Twinkler } from './starfield';
import { fillLinkPositions, segsFor } from './linkCurves';
import { ClusterClouds, NebulaDome } from './nebula';
import type { VisualTokens } from './presets';
import type { QualityTier } from '../quality/tiers';
import { DEEP_SPACE } from './presets';

const FOCUS_FADE_S = 0.28;

/**
 * 聚合渲染器：全部节点 1×Points、全部链接 1×LineSegments、星空 3×Points、
 * 选中高亮链接 1×LineSegments。整个场景 <10 draw call。
 * 视觉方向（深空/晨昼）通过 VisualTokens 切换，无需重建 WebGL。
 */
export class AggregateRenderer {
	readonly camera: PerspectiveCamera;
	readonly renderer: WebGLRenderer;

	private scene = new Scene();
	private composer: EffectComposer;
	private bloomPass: UnrealBloomPass;
	private outputPass: OutputPass;
	private renderPass: RenderPass;

	private nodePoints: Points | null = null;
	private nodeMaterial: ShaderMaterial | null = null;
	private nodeGeometry: BufferGeometry | null = null;
	private linkSegments: LineSegments | null = null;
	private linkGeometry: BufferGeometry | null = null;
	private linkMaterial: LineBasicMaterial | null = null;
	private selSegments: LineSegments | null = null;
	private selGeometry: BufferGeometry | null = null;
	private selMaterial: LineBasicMaterial | null = null;
	// —— 幽灵边（Constellation 待定建议，虚线暗层；不参与布局/邻接/拾取）——
	private ghostSegments: LineSegments | null = null;
	private ghostGeometry: BufferGeometry | null = null;
	private ghostMaterial: LineDashedMaterial | null = null;
	private ghostLinks: { source: number; target: number; score: number }[] = [];
	private selLinkIdx: number[] = []; // 合并 tier1+tier2，updateSelPositions 用
	private selLinks: ({ source: number; target: number } | undefined)[] = []; // 高亮边子集（曲线填充用）
	private selTier1: number[] = [];
	private selTier2: number[] = [];
	private starfield: Group;
	private twinkler: Twinkler;
	private starfieldEnabled = true;
	twinkleFreq = 0.5;
	private motes: Points | null = null;
	// —— 曲线连线（v0.4）——
	private linkCurvature = 0;
	private tierLinkSegs = 8;
	private linkK = 1; // 当前链接几何的每边段数（曲率 0 时恒 1 = 旧直线路径）
	// —— 深空背景形态层（v0.4）——
	private space: SpaceSettings = { nebula: 0, fieldStars: 0, clusterClouds: 0 };
	private nebula: NebulaDome | null = null;
	private clouds: ClusterClouds | null = null;
	private fieldStars: Points<BufferGeometry, PointsMaterial> | null = null;
	private fieldStarsDensity = 0; // 已构建的密度（含 tier 缩放触发的强制重建 -1）
	private nebulaTintA = '#46d4dc';
	private nebulaTintB = '#9a7fe0';
	private tierCloudsAllowed = true;
	private tierStarScale = 1;
	private reveal: { t0: number; durMs: number; maxR: number } | null = null;
	private revealBuf: Float32Array = new Float32Array(0);

	private data: GraphData = { nodes: [], links: [] };
	private positions: Float32Array = new Float32Array(0);
	private sizes: Float32Array = new Float32Array(0);
	private dimCurrent: Float32Array = new Float32Array(0);
	private dimTarget: Float32Array = new Float32Array(0);
	private dimAnimating = false;

	private colorFn: NodeColorFn = fallbackColorFn;
	private tokens: VisualTokens = DEEP_SPACE;
	private tierBloomAllowed = true;
	private lastW = 2;
	private lastH = 2;
	private baseLinkOpacity = 0.16;
	private focusActive = false;
	private graphRadiusEstimate: number;

	private projVec = new Vector3();
	private pixelScale = 1;
	private nodeScale = 1;

	constructor(container: HTMLElement, graphRadiusEstimate: number) {
		this.graphRadiusEstimate = graphRadiusEstimate;
		this.renderer = new WebGLRenderer({ antialias: false, alpha: false });
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.renderer.toneMapping = ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 1.05;
		this.renderer.info.autoReset = false;
		container.appendChild(this.renderer.domElement);

		this.scene.background = new Color(this.tokens.background);
		this.camera = new PerspectiveCamera(60, 1, 0.5, 50_000);

		const sf = buildStarfield(graphRadiusEstimate * 6.5);
		this.starfield = sf.group;
		this.twinkler = sf.twinkler;
		this.scene.add(this.starfield);

		this.composer = new EffectComposer(this.renderer);
		this.renderPass = new RenderPass(this.scene, this.camera);
		this.bloomPass = new UnrealBloomPass(
			new Vector2(2, 2),
			BLOOM_DEFAULTS.strength,
			BLOOM_DEFAULTS.radius,
			BLOOM_DEFAULTS.threshold,
		);
		this.outputPass = new OutputPass();
		this.composer.addPass(this.renderPass);
		this.composer.addPass(this.bloomPass);
		this.composer.addPass(this.outputPass);
	}

	// ---------- 数据与颜色 ----------

	setColorFn(fn: NodeColorFn): void {
		this.colorFn = fn;
	}

	setData(data: GraphData, positions: Float32Array): void {
		this.data = data;
		this.positions = positions;
		this.disposeGraphObjects();

		const n = data.nodes.length;

		// —— 节点 ——
		const nodePos = new Float32Array(n * 3);
		nodePos.set(positions.subarray(0, n * 3));
		const ghost = new Float32Array(n);
		this.sizes = new Float32Array(n);
		this.dimCurrent = new Float32Array(n).fill(1);
		this.dimTarget = new Float32Array(n).fill(1);
		for (let i = 0; i < n; i++) {
			const node = data.nodes[i];
			if (!node) continue;
			ghost[i] = node.unresolved ? 1 : 0;
			this.sizes[i] = this.computeSize(node);
		}
		this.nodeGeometry = new BufferGeometry();
		this.nodeGeometry.setAttribute('position', new BufferAttribute(nodePos, 3));
		this.nodeGeometry.setAttribute('color', new BufferAttribute(new Float32Array(n * 3), 3));
		this.nodeGeometry.setAttribute('aSize', new BufferAttribute(this.sizes, 1));
		this.nodeGeometry.setAttribute('aGhost', new BufferAttribute(ghost, 1));
		this.nodeGeometry.setAttribute('aDim', new BufferAttribute(this.dimCurrent, 1));
		this.nodeMaterial = new ShaderMaterial({
			vertexShader: NODE_VERTEX_SHADER,
			fragmentShader: NODE_FRAGMENT_SHADER,
			vertexColors: true,
			transparent: true,
			depthWrite: false,
			uniforms: {
				uPixelScale: { value: this.pixelScale },
				uSizeMul: { value: this.nodeScale },
				uLightMode: { value: this.tokens.lightMode ? 1 : 0 },
				uMaxPoint: { value: 110 * this.renderer.getPixelRatio() },
			},
		});
		this.nodePoints = new Points(this.nodeGeometry, this.nodeMaterial);
		this.nodePoints.renderOrder = 1; // 节点永远盖住链接网
		this.nodePoints.frustumCulled = false;
		this.scene.add(this.nodePoints);

		// —— 链接 ——（曲线：每边 K 段折线；K=1 = 与旧直线渲染完全等价）
		this.buildLinkLayer();
		this.clouds?.clear(); // 数据重建后簇成员索引失效，等下次沉降重算

		this.recolor();
		this.updatePositions();
		this.buildSelLayer(); // 数据重建后恢复高亮层
	}

	/** 链接层几何按当前 K（曲率/档位）分配；曲率 0↔>0 或档位变化时重建（毫秒级一次性） */
	private buildLinkLayer(): void {
		if (this.linkSegments) {
			this.scene.remove(this.linkSegments);
			this.linkGeometry?.dispose();
			this.linkMaterial?.dispose();
		}
		const m = this.data.links.length;
		this.linkK = segsFor(this.linkCurvature, this.tierLinkSegs);
		this.linkGeometry = new BufferGeometry();
		this.linkGeometry.setAttribute('position', new BufferAttribute(new Float32Array(m * this.linkK * 2 * 3), 3));
		this.linkGeometry.setAttribute('color', new BufferAttribute(new Float32Array(m * this.linkK * 2 * 3), 3));
		this.linkMaterial = new LineBasicMaterial({
			vertexColors: true,
			transparent: true,
			opacity: this.effectiveLinkOpacity(),
			depthWrite: false,
		});
		this.linkSegments = new LineSegments(this.linkGeometry, this.linkMaterial);
		this.linkSegments.renderOrder = 0;
		this.linkSegments.frustumCulled = false;
		this.scene.add(this.linkSegments);
	}

	/** 幽灵边数据（节点下标 + 强度 0..1）；空数组 = 移除该层 */
	setGhostLinks(links: { source: number; target: number; score: number }[]): void {
		this.ghostLinks = links;
		this.buildGhostLayer();
	}

	private buildGhostLayer(): void {
		if (this.ghostSegments) {
			this.scene.remove(this.ghostSegments);
			this.ghostGeometry?.dispose();
			this.ghostMaterial?.dispose();
			this.ghostSegments = null;
			this.ghostGeometry = null;
			this.ghostMaterial = null;
		}
		const m = this.ghostLinks.length;
		if (m === 0) return;
		this.ghostGeometry = new BufferGeometry();
		this.ghostGeometry.setAttribute('position', new BufferAttribute(new Float32Array(m * 2 * 3), 3));
		const colors = new Float32Array(m * 2 * 3);
		const base = this.tokens.lightMode ? 0.35 : 0.8; // 亮色主题用深灰，深空用亮灰
		for (let i = 0; i < m; i++) {
			const s = this.ghostLinks[i]?.score ?? 0.5;
			const v = base * (0.45 + 0.55 * s); // score 映射亮度（deferred 已在数据侧 ×0.6）
			for (let k = 0; k < 2; k++) {
				colors[(i * 2 + k) * 3] = v;
				colors[(i * 2 + k) * 3 + 1] = v;
				colors[(i * 2 + k) * 3 + 2] = v * 1.08; // 微偏蓝，与实线区分气质
			}
		}
		this.ghostGeometry.setAttribute('color', new BufferAttribute(colors, 3));
		this.ghostMaterial = new LineDashedMaterial({
			vertexColors: true,
			transparent: true,
			opacity: 0.22,
			depthWrite: false,
			dashSize: 2.6,
			gapSize: 3.4,
		});
		this.ghostSegments = new LineSegments(this.ghostGeometry, this.ghostMaterial);
		this.ghostSegments.renderOrder = 0;
		this.ghostSegments.frustumCulled = false;
		this.scene.add(this.ghostSegments);
		this.updateGhostPositions();
	}

	private updateGhostPositions(): void {
		if (!this.ghostGeometry || !this.ghostSegments) return;
		const attr = this.ghostGeometry.getAttribute('position') as BufferAttribute;
		const arr = attr.array as Float32Array;
		const pos = this.positions;
		for (let i = 0; i < this.ghostLinks.length; i++) {
			const l = this.ghostLinks[i];
			if (!l) continue;
			for (let k = 0; k < 3; k++) {
				arr[i * 6 + k] = pos[l.source * 3 + k] ?? 0;
				arr[i * 6 + 3 + k] = pos[l.target * 3 + k] ?? 0;
			}
		}
		attr.needsUpdate = true;
		this.ghostSegments.computeLineDistances(); // 虚线段距离随坐标更新（≤500 边，纳秒级）
	}

	/** 连线弯曲 0–1（滑杆）；跨 0↔>0 时段数变化需重建几何+重染色，其余仅重填顶点 */
	setLinkCurve(v: number): void {
		this.linkCurvature = v;
		if (segsFor(v, this.tierLinkSegs) !== this.linkK) {
			this.buildLinkLayer();
			this.recolor();
			this.buildSelLayer();
		}
		if (!this.reveal) this.updatePositions(); // 创世动画期间由 stepReveal 下一帧接管
	}

	private sizeMode: 'degree' | 'fileSize' | 'uniform' = 'degree';

	private computeSize(node: import('../types').GraphNode): number {
		switch (this.sizeMode) {
			case 'fileSize':
				// 中位笔记 ~2KB；立方根压缩长尾，巨型文档不吞画面
				return Math.min(Math.max(NODE_BASE_RADIUS * (0.7 + 1.1 * Math.cbrt(node.fileSize / 4096)), 1.6), NODE_MAX_RADIUS);
			case 'uniform':
				return NODE_BASE_RADIUS * 1.3;
			default:
				return Math.min(NODE_BASE_RADIUS * (1 + 0.5 * Math.sqrt(node.degree)), NODE_MAX_RADIUS);
		}
	}

	setSizeMode(mode: 'degree' | 'fileSize' | 'uniform'): void {
		this.sizeMode = mode;
		if (!this.nodeGeometry) return;
		for (let i = 0; i < this.data.nodes.length; i++) {
			const node = this.data.nodes[i];
			if (node) this.sizes[i] = this.computeSize(node);
		}
		(this.nodeGeometry.getAttribute('aSize') as BufferAttribute).needsUpdate = true;
	}

	/**
	 * 创世动画（G2.5 反馈）：节点从中心按半径波次绽放到沉降坐标。
	 * 仅在坐标已知（暖启动/已沉降）时调用；链接随节点坐标自然伸展 + 透明度渐入。
	 */
	playReveal(durMs = 2600): void {
		const n = this.data.nodes.length;
		if (n === 0) return;
		let maxR = 1;
		for (let i = 0; i < n; i++) {
			const r = Math.hypot(this.positions[i * 3] ?? 0, this.positions[i * 3 + 1] ?? 0, this.positions[i * 3 + 2] ?? 0);
			if (r > maxR) maxR = r;
		}
		if (this.revealBuf.length < n * 3) this.revealBuf = new Float32Array(n * 3);
		this.reveal = { t0: performance.now(), durMs, maxR };
	}

	private stepReveal(now: number): void {
		if (!this.reveal || !this.nodeGeometry || !this.linkGeometry) return;
		const { t0, durMs, maxR } = this.reveal;
		const p = (now - t0) / durMs;
		if (p >= 1) {
			this.reveal = null;
			this.updatePositions();
			if (this.linkMaterial) this.linkMaterial.opacity = this.effectiveLinkOpacity();
			return;
		}
		const n = this.data.nodes.length;
		const buf = this.revealBuf;
		const pos = this.positions;
		for (let i = 0; i < n; i++) {
			const x = pos[i * 3] ?? 0;
			const y = pos[i * 3 + 1] ?? 0;
			const z = pos[i * 3 + 2] ?? 0;
			const delay = (Math.hypot(x, y, z) / maxR) * 0.55; // 内圈先亮，波次向外
			const local = Math.min(Math.max((p - delay) / 0.45, 0), 1);
			const k = 1 - Math.pow(1 - local, 3); // easeOutCubic
			buf[i * 3] = x * k;
			buf[i * 3 + 1] = y * k;
			buf[i * 3 + 2] = z * k;
		}
		const nodeAttr = this.nodeGeometry.getAttribute('position') as BufferAttribute;
		(nodeAttr.array as Float32Array).set(buf.subarray(0, n * 3));
		nodeAttr.needsUpdate = true;
		const linkAttr = this.linkGeometry.getAttribute('position') as BufferAttribute;
		fillLinkPositions(linkAttr.array as Float32Array, buf, this.data.links, this.linkK, this.linkCurvature);
		linkAttr.needsUpdate = true;
		if (this.linkMaterial) this.linkMaterial.opacity = this.effectiveLinkOpacity() * Math.min(p * 1.6, 1);
	}

	get revealing(): boolean {
		return this.reveal !== null;
	}

	/** 配色/视觉方向变化时重算颜色（不动坐标） */
	recolor(): void {
		if (!this.nodeGeometry || !this.linkGeometry) return;
		const n = this.data.nodes.length;
		const nodeColAttr = this.nodeGeometry.getAttribute('color') as BufferAttribute;
		const nodeCol = nodeColAttr.array as Float32Array;
		const resolved: Color[] = new Array<Color>(n);
		const hsl = { h: 0, s: 0, l: 0 };
		for (let i = 0; i < n; i++) {
			const node = this.data.nodes[i];
			if (!node) continue;
			let c = this.colorFn(node).clone();
			if (this.tokens.nodeLightness !== null) {
				c.getHSL(hsl);
				c = c.setHSL(hsl.h, hsl.s * 0.95, this.tokens.nodeLightness);
			}
			resolved[i] = c;
			nodeCol[i * 3] = c.r;
			nodeCol[i * 3 + 1] = c.g;
			nodeCol[i * 3 + 2] = c.b;
		}
		nodeColAttr.needsUpdate = true;

		const linkColAttr = this.linkGeometry.getAttribute('color') as BufferAttribute;
		const linkCol = linkColAttr.array as Float32Array;
		const ink = this.tokens.linkInk ? new Color(this.tokens.linkInk) : null;
		const fallback = new Color('#7a87a8');
		const vertsPerLink = this.linkK * 2;
		for (let li = 0; li < this.data.links.length; li++) {
			const l = this.data.links[li];
			if (!l) continue;
			const c = ink ?? linkColor(resolved[l.source] ?? fallback, resolved[l.target] ?? fallback);
			for (let v = 0; v < vertsPerLink; v++) {
				linkCol[(li * vertsPerLink + v) * 3] = c.r;
				linkCol[(li * vertsPerLink + v) * 3 + 1] = c.g;
				linkCol[(li * vertsPerLink + v) * 3 + 2] = c.b;
			}
		}
		linkColAttr.needsUpdate = true;
		// 集群云雾跟随节点色（换主题/聚焦重染时同步）
		this.clouds?.recolor((i) => {
			const nd = this.data.nodes[i];
			return nd ? this.colorFn(nd) : fallback;
		});
	}

	/** 布局热时每帧调用：节点直拷，链接按索引 gather */
	updatePositions(): void {
		if (!this.nodeGeometry || !this.linkGeometry) return;
		const n = this.data.nodes.length;
		const nodeAttr = this.nodeGeometry.getAttribute('position') as BufferAttribute;
		(nodeAttr.array as Float32Array).set(this.positions.subarray(0, n * 3));
		nodeAttr.needsUpdate = true;

		const linkAttr = this.linkGeometry.getAttribute('position') as BufferAttribute;
		fillLinkPositions(linkAttr.array as Float32Array, this.positions, this.data.links, this.linkK, this.linkCurvature);
		linkAttr.needsUpdate = true;
		this.updateSelPositions();
		this.updateGhostPositions();
	}

	// ---------- 聚焦与选中高亮 ----------

	/**
	 * 聚焦模式：按每节点权重淡出/提亮。weightOf 返回 aDim 目标（1=全亮，0.12=淡出）；
	 * 分级选中（选中/一度/二度/其余）就是不同的权重值，单 float aDim 足矣。
	 */
	setFocus(weightOf: ((i: number) => number) | null): void {
		const n = this.data.nodes.length;
		this.focusActive = weightOf !== null;
		for (let i = 0; i < n; i++) {
			this.dimTarget[i] = weightOf ? weightOf(i) : 1;
		}
		this.dimAnimating = true;
		if (this.linkMaterial) this.linkMaterial.opacity = this.effectiveLinkOpacity();
	}

	/** 选中链接高亮：tier1=一度（全饱和），tier2=二度（降亮度）；复用同一层，零新增 draw call */
	setSelectedLinks(tier1: number[], tier2: number[]): void {
		this.selTier1 = tier1;
		this.selTier2 = tier2;
		this.buildSelLayer();
	}

	private buildSelLayer(): void {
		this.selLinkIdx = [...this.selTier1, ...this.selTier2];
		this.selLinks = this.selLinkIdx.map((i) => this.data.links[i]);
		if (this.selSegments) {
			this.scene.remove(this.selSegments);
			this.selGeometry?.dispose();
			this.selMaterial?.dispose();
			this.selSegments = null;
			this.selGeometry = null;
			this.selMaterial = null;
		}
		const m = this.selLinkIdx.length;
		if (m === 0) return;
		const t1 = this.selTier1.length;
		const K = this.linkK; // 高亮层与主链接层同曲率同段数：弧线严格重合
		const vertsPerLink = K * 2;
		const pos = new Float32Array(m * vertsPerLink * 3);
		const col = new Float32Array(m * vertsPerLink * 3);
		const hsl = { h: 0, s: 0, l: 0 };
		for (let k = 0; k < m; k++) {
			const l = this.data.links[this.selLinkIdx[k] ?? -1];
			if (!l) continue;
			const sNode = this.data.nodes[l.source];
			const c = sNode ? this.colorFn(sNode).clone() : new Color('#9aa4b2');
			c.getHSL(hsl);
			const isT2 = k >= t1;
			const light = this.tokens.lightMode ? (isT2 ? 0.34 : 0.42) : isT2 ? 0.46 : 0.62;
			const sat = isT2 ? hsl.s * 0.9 : Math.min(hsl.s * 1.2, 1);
			c.setHSL(hsl.h, sat, light);
			const dim = isT2 ? 0.55 : 1; // 二度进一步压暗，读作外层壳
			for (let v = 0; v < vertsPerLink; v++) {
				col[(k * vertsPerLink + v) * 3] = c.r * dim;
				col[(k * vertsPerLink + v) * 3 + 1] = c.g * dim;
				col[(k * vertsPerLink + v) * 3 + 2] = c.b * dim;
			}
		}
		this.selGeometry = new BufferGeometry();
		this.selGeometry.setAttribute('position', new BufferAttribute(pos, 3));
		this.selGeometry.setAttribute('color', new BufferAttribute(col, 3));
		this.selMaterial = new LineBasicMaterial({
			vertexColors: true,
			transparent: true,
			opacity: 0.85,
			depthWrite: false,
		});
		this.selSegments = new LineSegments(this.selGeometry, this.selMaterial);
		this.selSegments.renderOrder = 2;
		this.selSegments.frustumCulled = false;
		this.scene.add(this.selSegments);
		this.updateSelPositions();
	}

	private updateSelPositions(): void {
		if (!this.selGeometry || this.selLinks.length === 0) return;
		const attr = this.selGeometry.getAttribute('position') as BufferAttribute;
		fillLinkPositions(attr.array as Float32Array, this.positions, this.selLinks, this.linkK, this.linkCurvature);
		attr.needsUpdate = true;
	}

	private effectiveLinkOpacity(): number {
		const base = this.baseLinkOpacity * this.tokens.linkOpacityScale;
		return this.focusActive ? base * 0.25 : base;
	}

	// ---------- 视觉方向 ----------

	applyTokens(tokens: VisualTokens, bloomStrengthFromSettings: number): void {
		this.tokens = tokens;
		this.scene.background = new Color(tokens.background);
		this.starfield.visible = tokens.starfield && this.starfieldEnabled;
		this.syncSpace(); // 晨昼强制关背景形态层
		this.renderer.toneMapping = tokens.lightMode ? NoToneMapping : ACESFilmicToneMapping;
		if (this.nodeMaterial) {
			this.nodeMaterial.uniforms['uLightMode']!.value = tokens.lightMode ? 1 : 0;
		}
		this.bloomPass.enabled = tokens.bloomEnabled && this.tierBloomAllowed && bloomStrengthFromSettings > 0.001;
		if (tokens.motes && !this.motes) this.buildMotes();
		if (this.motes) this.motes.visible = tokens.motes;
		if (this.linkMaterial) this.linkMaterial.opacity = this.effectiveLinkOpacity();
		this.recolor();
		this.buildSelLayer();
	}

	get currentTokens(): VisualTokens {
		return this.tokens;
	}

	// ---------- 深空背景形态层（v0.4：星云天幕 / 空间浮星 / 集群云雾） ----------

	/** 三层各自独立开关（0=关）；实际可见性 = 滑杆 × tokens.space × 质量档 */
	setSpace(space: SpaceSettings): void {
		this.space = { ...space };
		this.syncSpace();
	}

	private syncSpace(): void {
		const allowed = this.tokens.space;
		// 星云天幕：首次开启才建+烘焙（几十 ms 一次性）；此后强度只调透明度
		const nebulaV = allowed ? this.space.nebula : 0;
		if (nebulaV > 0.005 && !this.nebula) {
			// 体积云半径 = 图半径 ×2.6：云团包裹住图、有近有远，而非贴在无穷远球壳
			this.nebula = new NebulaDome(this.graphRadiusEstimate * 2.6);
			this.nebula.setQuality(this.tierStarScale);
			this.nebula.setPixelScale(this.pixelScale, 1600 * this.renderer.getPixelRatio());
			this.nebula.bake(this.nebulaTintA, this.nebulaTintB);
			this.scene.add(this.nebula.object);
		}
		this.nebula?.setIntensity(nebulaV);
		// 空间浮星：密度/档位变化才重建（≤1200 点，毫秒级）
		const density = allowed ? this.space.fieldStars : 0;
		if (Math.abs(density - this.fieldStarsDensity) > 1e-3) {
			this.disposeFieldStars();
			if (density > 0.005) {
				this.fieldStars = buildFieldStars(this.graphRadiusEstimate * 2.4, density, this.tierStarScale);
				this.scene.add(this.fieldStars);
			}
			this.fieldStarsDensity = density;
		}
		// 集群云雾：mobile 档关（加色大精灵的填充率风险）
		const cloudsV = allowed && this.tierCloudsAllowed ? this.space.clusterClouds : 0;
		if (cloudsV > 0.005 && !this.clouds) {
			this.clouds = new ClusterClouds();
			this.clouds.setPixelScale(this.pixelScale, 300 * this.renderer.getPixelRatio());
			this.scene.add(this.clouds.points);
			this.refreshClusterClouds(); // 暖启动坐标已就位时立即出云；否则等沉降
		}
		this.clouds?.setIntensity(cloudsV);
	}

	/** 星云染色跟配色主题（前两组色）；换主题才重烘焙 */
	setNebulaTint(hexA: string, hexB: string): void {
		if (hexA === this.nebulaTintA && hexB === this.nebulaTintB) return;
		this.nebulaTintA = hexA;
		this.nebulaTintB = hexB;
		this.nebula?.bake(hexA, hexB);
	}

	/** 布局沉降时刻由 GraphController 调用：重算簇质心/散布并重染 */
	refreshClusterClouds(): void {
		if (!this.clouds || this.data.nodes.length === 0) return;
		this.clouds.rebuild(this.data, this.positions, this.graphRadiusEstimate);
		const fallback = new Color('#7a87a8');
		this.clouds.recolor((i) => {
			const nd = this.data.nodes[i];
			return nd ? this.colorFn(nd) : fallback;
		});
		this.clouds.setIntensity(this.tokens.space && this.tierCloudsAllowed ? this.space.clusterClouds : 0);
	}

	private disposeFieldStars(): void {
		if (!this.fieldStars) return;
		this.fieldStars.geometry.dispose();
		this.fieldStars.material.dispose();
		this.scene.remove(this.fieldStars);
		this.fieldStars = null;
	}

	/** 晨昼模式的尘埃微粒：600 点、近大远小、缓慢漂移 */
	private buildMotes(): void {
		const count = 600;
		const pos = new Float32Array(count * 3);
		const R = this.graphRadiusEstimate * 2.2;
		for (let i = 0; i < count; i++) {
			pos[i * 3] = (Math.random() * 2 - 1) * R;
			pos[i * 3 + 1] = (Math.random() * 2 - 1) * R;
			pos[i * 3 + 2] = (Math.random() * 2 - 1) * R;
		}
		const geo = new BufferGeometry();
		geo.setAttribute('position', new BufferAttribute(pos, 3));
		const mat = new PointsMaterial({
			color: new Color('#d8d4cb'),
			size: 1.6,
			sizeAttenuation: true,
			transparent: true,
			opacity: 0.5,
			depthWrite: false,
		});
		this.motes = new Points(geo, mat);
		this.motes.renderOrder = -1;
		this.scene.add(this.motes);
	}

	// ---------- 渲染循环 ----------

	render(deltaS: number): void {
		this.starfield.rotation.y += STARFIELD_ROTATION_RAD_PER_S * deltaS;
		if (this.starfield.visible) this.twinkler.update(deltaS, this.twinkleFreq);
		if (this.nebula?.visible) this.nebula.update(deltaS);
		if (this.fieldStars) this.fieldStars.rotation.y -= STARFIELD_ROTATION_RAD_PER_S * 0.6 * deltaS; // 反向慢转 = 视差
		if (this.motes?.visible) this.motes.rotation.y -= STARFIELD_ROTATION_RAD_PER_S * 2 * deltaS;
		if (this.dimAnimating) this.stepDim(deltaS);
		if (this.reveal) this.stepReveal(performance.now());
		this.renderer.info.reset();
		this.composer.render();
	}

	private stepDim(deltaS: number): void {
		const k = Math.min(deltaS / FOCUS_FADE_S, 1);
		let active = false;
		for (let i = 0; i < this.dimCurrent.length; i++) {
			const cur = this.dimCurrent[i] ?? 1;
			const tgt = this.dimTarget[i] ?? 1;
			const next = cur + (tgt - cur) * k;
			this.dimCurrent[i] = Math.abs(next - tgt) < 0.005 ? tgt : next;
			if (this.dimCurrent[i] !== tgt) active = true;
		}
		this.dimAnimating = active;
		if (this.nodeGeometry) {
			(this.nodeGeometry.getAttribute('aDim') as BufferAttribute).needsUpdate = true;
		}
	}

	get drawCalls(): number {
		return this.renderer.info.render.calls;
	}

	// ---------- 参数 ----------

	setBloomParams(p: { strength: number; radius: number; threshold: number }): void {
		this.bloomPass.strength = p.strength;
		this.bloomPass.radius = p.radius;
		this.bloomPass.threshold = p.threshold;
		this.bloomPass.enabled = this.tokens.bloomEnabled && this.tierBloomAllowed && p.strength > 0.001;
	}

	getBloomStrength(): number {
		return this.bloomPass.enabled ? this.bloomPass.strength : 0;
	}

	setBloomStrength(v: number): void {
		this.bloomPass.strength = v;
		this.bloomPass.enabled = this.tokens.bloomEnabled && this.tierBloomAllowed && v > 0.001;
	}

	/** 质量档位（M4）：pixelRatio / bloom 门控 / 星空密度 / 曲线段数 / 背景层预算 */
	applyTier(tier: QualityTier, bloomStrengthFromSettings: number): void {
		this.tierBloomAllowed = tier.bloomAllowed;
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier.pixelRatioCap));
		this.bloomPass.enabled = this.tokens.bloomEnabled && this.tierBloomAllowed && bloomStrengthFromSettings > 0.001;
		// 星空按档位密度重建（一次性，毫秒级）
		const visible = this.starfield.visible;
		const rotation = this.starfield.rotation.y;
		disposeStarfield(this.starfield);
		this.scene.remove(this.starfield);
		const sf = buildStarfield(this.graphRadiusEstimate * 6.5, tier.starScale);
		this.starfield = sf.group;
		this.twinkler = sf.twinkler;
		this.starfield.visible = visible;
		this.starfield.rotation.y = rotation;
		this.scene.add(this.starfield);
		// 曲线段数换档：几何重建 + 重染 + 高亮层重建（一次性）
		this.tierLinkSegs = tier.linkSegments;
		if (this.linkGeometry && segsFor(this.linkCurvature, this.tierLinkSegs) !== this.linkK) {
			this.buildLinkLayer();
			this.recolor();
			this.buildSelLayer();
			this.updatePositions();
		}
		// 背景层预算：星云 sprite 密度 / 浮星密度缩放 / 云雾开关
		this.tierCloudsAllowed = tier.clusterCloudsAllowed;
		if (this.tierStarScale !== tier.starScale) {
			this.tierStarScale = tier.starScale;
			if (this.nebula) {
				this.nebula.setQuality(tier.starScale);
				this.nebula.bake(this.nebulaTintA, this.nebulaTintB); // 按新密度重生成云团
			}
		}
		this.fieldStarsDensity = -1; // 强制按新档位缩放重建浮星
		this.syncSpace();
		this.resize(this.lastW, this.lastH); // pixelRatio 变化 → 重算 uPixelScale/uMaxPoint 与缓冲尺寸
		const u = this.nodeMaterial?.uniforms['uMaxPoint'];
		if (u) u.value = 110 * this.renderer.getPixelRatio();
	}

	setLinkOpacity(v: number): void {
		this.baseLinkOpacity = v;
		if (this.linkMaterial) this.linkMaterial.opacity = this.effectiveLinkOpacity();
	}

	setNodeScale(v: number): void {
		this.nodeScale = v;
		const u = this.nodeMaterial?.uniforms['uSizeMul'];
		if (u) u.value = v;
	}

	/** 星空背景开关（用户选项）；深空模式下由它最终决定星空可见性 */
	setStarfieldEnabled(on: boolean): void {
		this.starfieldEnabled = on;
		this.starfield.visible = on && this.tokens.starfield;
	}

	resize(w: number, h: number): void {
		if (w < 2 || h < 2) return;
		this.lastW = w;
		this.lastH = h;
		this.camera.aspect = w / h;
		this.camera.updateProjectionMatrix();
		this.renderer.setSize(w, h);
		this.composer.setSize(w, h);
		this.bloomPass.resolution.set(w, h);
		const physH = h * this.renderer.getPixelRatio();
		this.pixelScale = physH / (2 * Math.tan(((this.camera.fov / 2) * Math.PI) / 180));
		const u = this.nodeMaterial?.uniforms['uPixelScale'];
		if (u) u.value = this.pixelScale;
		this.clouds?.setPixelScale(this.pixelScale, 300 * this.renderer.getPixelRatio());
		this.nebula?.setPixelScale(this.pixelScale, 1600 * this.renderer.getPixelRatio());
	}

	// ---------- 拾取与投影 ----------

	/** 投影到屏幕逻辑像素；z>1 = 在镜头后 */
	projectNode(i: number, w: number, h: number): { x: number; y: number; behind: boolean } {
		this.projVec.set(this.positions[i * 3] ?? 0, this.positions[i * 3 + 1] ?? 0, this.positions[i * 3 + 2] ?? 0);
		this.projVec.project(this.camera);
		return {
			x: ((this.projVec.x + 1) / 2) * w,
			y: ((1 - this.projVec.y) / 2) * h,
			behind: this.projVec.z > 1,
		};
	}

	/** 屏幕空间最近邻拾取（O(n) 仅在点击/节流 hover 时跑） */
	pickNearest(px: number, py: number, w: number, h: number, maxPx: number): number {
		let best = -1;
		let bestDist = maxPx;
		for (let i = 0; i < this.data.nodes.length; i++) {
			const p = this.projectNode(i, w, h);
			if (p.behind) continue;
			const d = Math.hypot(p.x - px, p.y - py);
			if (d < bestDist) {
				bestDist = d;
				best = i;
			}
		}
		return best;
	}

	nodeRadius(i: number): number {
		return this.sizes[i] ?? NODE_BASE_RADIUS;
	}

	nodePosition(i: number, out: Vector3): Vector3 {
		return out.set(this.positions[i * 3] ?? 0, this.positions[i * 3 + 1] ?? 0, this.positions[i * 3 + 2] ?? 0);
	}

	nodeColorHex(i: number): string {
		const node = this.data.nodes[i];
		return node ? `#${this.colorFn(node).getHexString()}` : '#9aa4b2';
	}

	cameraDistanceTo(i: number): number {
		this.projVec.set(this.positions[i * 3] ?? 0, this.positions[i * 3 + 1] ?? 0, this.positions[i * 3 + 2] ?? 0);
		return this.camera.position.distanceTo(this.projVec);
	}

	// ---------- 销毁合同 ----------

	private disposeGraphObjects(): void {
		if (this.nodePoints) this.scene.remove(this.nodePoints);
		if (this.linkSegments) this.scene.remove(this.linkSegments);
		if (this.selSegments) {
			this.scene.remove(this.selSegments);
			this.selGeometry?.dispose();
			this.selMaterial?.dispose();
			this.selSegments = null;
			this.selGeometry = null;
			this.selMaterial = null;
		}
		if (this.ghostSegments) {
			this.scene.remove(this.ghostSegments);
			this.ghostGeometry?.dispose();
			this.ghostMaterial?.dispose();
			this.ghostSegments = null;
			this.ghostGeometry = null;
			this.ghostMaterial = null;
		}
		this.nodeGeometry?.dispose();
		this.nodeMaterial?.dispose();
		this.linkGeometry?.dispose();
		this.linkMaterial?.dispose();
		this.nodePoints = null;
		this.linkSegments = null;
		this.nodeGeometry = null;
		this.linkGeometry = null;
		this.nodeMaterial = null;
		this.linkMaterial = null;
	}

	/** 销毁合同：composer 目标 → 场景资源 → renderer → 强制丢上下文 */
	dispose(): void {
		this.disposeGraphObjects();
		disposeStarfield(this.starfield);
		this.scene.remove(this.starfield);
		this.disposeFieldStars();
		if (this.nebula) {
			this.nebula.dispose();
			this.scene.remove(this.nebula.object);
			this.nebula = null;
		}
		if (this.clouds) {
			this.clouds.dispose();
			this.scene.remove(this.clouds.points);
			this.clouds = null;
		}
		if (this.motes) {
			this.motes.geometry.dispose();
			(this.motes.material as PointsMaterial).dispose();
			this.scene.remove(this.motes);
			this.motes = null;
		}
		this.bloomPass.dispose();
		this.outputPass.dispose();
		this.renderPass.dispose();
		this.composer.dispose();
		this.renderer.dispose();
		try {
			this.renderer.forceContextLoss();
		} catch {
			// 上下文可能已丢失
		}
		this.renderer.domElement.remove();
	}
}
