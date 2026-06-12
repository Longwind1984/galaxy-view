import {
	ACESFilmicToneMapping,
	BufferAttribute,
	BufferGeometry,
	Color,
	Group,
	LineBasicMaterial,
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
import { BLOOM_DEFAULTS, NODE_BASE_RADIUS, NODE_MAX_RADIUS, STARFIELD_ROTATION_RAD_PER_S } from '../constants';
import { NODE_FRAGMENT_SHADER, NODE_VERTEX_SHADER } from './shaders';
import { linkColor, fallbackColorFn } from './palette';
import type { NodeColorFn } from './palette';
import { buildStarfield, disposeStarfield, Twinkler } from './starfield';
import type { VisualTokens } from './presets';
import { DEEP_SPACE } from './presets';

const FOCUS_DIM = 0.12;
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
	private selLinkIdx: number[] = [];
	private starfield: Group;
	private twinkler: Twinkler;
	twinkleFreq = 0.5;
	private motes: Points | null = null;
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
		const m = data.links.length;

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

		// —— 链接 ——
		this.linkGeometry = new BufferGeometry();
		this.linkGeometry.setAttribute('position', new BufferAttribute(new Float32Array(m * 2 * 3), 3));
		this.linkGeometry.setAttribute('color', new BufferAttribute(new Float32Array(m * 2 * 3), 3));
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

		this.recolor();
		this.updatePositions();
		this.setSelectedLinks(this.selLinkIdx); // 数据重建后恢复高亮层
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
		const arr = linkAttr.array as Float32Array;
		const links = this.data.links;
		for (let li = 0; li < links.length; li++) {
			const l = links[li];
			if (!l) continue;
			const sI = l.source * 3;
			const tI = l.target * 3;
			const o = li * 6;
			arr[o] = buf[sI] ?? 0;
			arr[o + 1] = buf[sI + 1] ?? 0;
			arr[o + 2] = buf[sI + 2] ?? 0;
			arr[o + 3] = buf[tI] ?? 0;
			arr[o + 4] = buf[tI + 1] ?? 0;
			arr[o + 5] = buf[tI + 2] ?? 0;
		}
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
		for (let li = 0; li < this.data.links.length; li++) {
			const l = this.data.links[li];
			if (!l) continue;
			const c = ink ?? linkColor(resolved[l.source] ?? fallback, resolved[l.target] ?? fallback);
			for (const v of [0, 1]) {
				linkCol[(li * 2 + v) * 3] = c.r;
				linkCol[(li * 2 + v) * 3 + 1] = c.g;
				linkCol[(li * 2 + v) * 3 + 2] = c.b;
			}
		}
		linkColAttr.needsUpdate = true;
	}

	/** 布局热时每帧调用：节点直拷，链接按索引 gather */
	updatePositions(): void {
		if (!this.nodeGeometry || !this.linkGeometry) return;
		const n = this.data.nodes.length;
		const nodeAttr = this.nodeGeometry.getAttribute('position') as BufferAttribute;
		(nodeAttr.array as Float32Array).set(this.positions.subarray(0, n * 3));
		nodeAttr.needsUpdate = true;

		const linkAttr = this.linkGeometry.getAttribute('position') as BufferAttribute;
		const arr = linkAttr.array as Float32Array;
		const pos = this.positions;
		const links = this.data.links;
		for (let li = 0; li < links.length; li++) {
			const l = links[li];
			if (!l) continue;
			const s = l.source * 3;
			const t = l.target * 3;
			const o = li * 6;
			arr[o] = pos[s] ?? 0;
			arr[o + 1] = pos[s + 1] ?? 0;
			arr[o + 2] = pos[s + 2] ?? 0;
			arr[o + 3] = pos[t] ?? 0;
			arr[o + 4] = pos[t + 1] ?? 0;
			arr[o + 5] = pos[t + 2] ?? 0;
		}
		linkAttr.needsUpdate = true;
		this.updateSelPositions();
	}

	// ---------- 聚焦与选中高亮 ----------

	/** 聚焦模式：非邻居淡出（280ms 缓动，CPU 插值 3k floats 可忽略） */
	setFocus(selected: number, neighbors: Set<number> | null): void {
		const n = this.data.nodes.length;
		this.focusActive = neighbors !== null;
		for (let i = 0; i < n; i++) {
			this.dimTarget[i] = !neighbors || neighbors.has(i) || i === selected ? 1 : FOCUS_DIM;
		}
		this.dimAnimating = true;
		if (this.linkMaterial) this.linkMaterial.opacity = this.effectiveLinkOpacity();
	}

	/** 选中节点自身的链接 → 独立高亮层（全饱和、盖在最上） */
	setSelectedLinks(linkIndices: number[]): void {
		this.selLinkIdx = linkIndices;
		if (this.selSegments) {
			this.scene.remove(this.selSegments);
			this.selGeometry?.dispose();
			this.selMaterial?.dispose();
			this.selSegments = null;
			this.selGeometry = null;
			this.selMaterial = null;
		}
		if (linkIndices.length === 0) return;
		const m = linkIndices.length;
		const pos = new Float32Array(m * 6);
		const col = new Float32Array(m * 6);
		const hsl = { h: 0, s: 0, l: 0 };
		for (let k = 0; k < m; k++) {
			const l = this.data.links[linkIndices[k] ?? -1];
			if (!l) continue;
			const sNode = this.data.nodes[l.source];
			const c = (sNode ? this.colorFn(sNode).clone() : new Color('#9aa4b2'));
			c.getHSL(hsl);
			c.setHSL(hsl.h, Math.min(hsl.s * 1.2, 1), this.tokens.lightMode ? 0.42 : 0.62);
			for (const v of [0, 1]) {
				col[k * 6 + v * 3] = c.r;
				col[k * 6 + v * 3 + 1] = c.g;
				col[k * 6 + v * 3 + 2] = c.b;
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
		if (!this.selGeometry || this.selLinkIdx.length === 0) return;
		const attr = this.selGeometry.getAttribute('position') as BufferAttribute;
		const arr = attr.array as Float32Array;
		const pos = this.positions;
		for (let k = 0; k < this.selLinkIdx.length; k++) {
			const l = this.data.links[this.selLinkIdx[k] ?? -1];
			if (!l) continue;
			const s = l.source * 3;
			const t = l.target * 3;
			arr[k * 6] = pos[s] ?? 0;
			arr[k * 6 + 1] = pos[s + 1] ?? 0;
			arr[k * 6 + 2] = pos[s + 2] ?? 0;
			arr[k * 6 + 3] = pos[t] ?? 0;
			arr[k * 6 + 4] = pos[t + 1] ?? 0;
			arr[k * 6 + 5] = pos[t + 2] ?? 0;
		}
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
		this.starfield.visible = tokens.starfield;
		this.renderer.toneMapping = tokens.lightMode ? NoToneMapping : ACESFilmicToneMapping;
		if (this.nodeMaterial) {
			this.nodeMaterial.uniforms['uLightMode']!.value = tokens.lightMode ? 1 : 0;
		}
		this.bloomPass.enabled = tokens.bloomEnabled && bloomStrengthFromSettings > 0.001;
		if (tokens.motes && !this.motes) this.buildMotes();
		if (this.motes) this.motes.visible = tokens.motes;
		if (this.linkMaterial) this.linkMaterial.opacity = this.effectiveLinkOpacity();
		this.recolor();
		this.setSelectedLinks(this.selLinkIdx);
	}

	get currentTokens(): VisualTokens {
		return this.tokens;
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
		this.bloomPass.enabled = this.tokens.bloomEnabled && p.strength > 0.001;
	}

	getBloomStrength(): number {
		return this.bloomPass.enabled ? this.bloomPass.strength : 0;
	}

	setBloomStrength(v: number): void {
		this.bloomPass.strength = v;
		this.bloomPass.enabled = this.tokens.bloomEnabled && v > 0.001;
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

	resize(w: number, h: number): void {
		if (w < 2 || h < 2) return;
		this.camera.aspect = w / h;
		this.camera.updateProjectionMatrix();
		this.renderer.setSize(w, h);
		this.composer.setSize(w, h);
		this.bloomPass.resolution.set(w, h);
		const physH = h * this.renderer.getPixelRatio();
		this.pixelScale = physH / (2 * Math.tan(((this.camera.fov / 2) * Math.PI) / 180));
		const u = this.nodeMaterial?.uniforms['uPixelScale'];
		if (u) u.value = this.pixelScale;
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
