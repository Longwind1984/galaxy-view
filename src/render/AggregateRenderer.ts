import {
	ACESFilmicToneMapping,
	BufferAttribute,
	BufferGeometry,
	Color,
	Group,
	LineBasicMaterial,
	LineSegments,
	PerspectiveCamera,
	Points,
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
import {
	BACKGROUND_COLOR,
	BLOOM_DEFAULTS,
	LINK_OPACITY,
	NODE_BASE_RADIUS,
	NODE_MAX_RADIUS,
	STARFIELD_ROTATION_RAD_PER_S,
} from '../constants';
import { NODE_FRAGMENT_SHADER, NODE_VERTEX_SHADER } from './shaders';
import { folderColor, linkColor } from './palette';
import { buildStarfield, disposeStarfield } from './starfield';

/**
 * 聚合渲染器：全部节点 1×Points、全部链接 1×LineSegments、星空 3×Points。
 * 整个场景 <10 draw call —— 这同时是 NASA 观感与性能答案（G0 红色的对策）。
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
	private starfield: Group;

	private data: GraphData = { nodes: [], links: [] };
	private positions: Float32Array = new Float32Array(0);
	private sizes: Float32Array = new Float32Array(0);

	private projVec = new Vector3();

	constructor(container: HTMLElement, graphRadiusEstimate: number) {
		this.renderer = new WebGLRenderer({ antialias: false, alpha: false });
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.renderer.toneMapping = ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 1.05;
		this.renderer.info.autoReset = false;
		container.appendChild(this.renderer.domElement);

		this.scene.background = new Color(BACKGROUND_COLOR);
		this.camera = new PerspectiveCamera(60, 1, 0.5, 50_000);

		this.starfield = buildStarfield(graphRadiusEstimate * 6.5);
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

	setData(data: GraphData, positions: Float32Array): void {
		this.data = data;
		this.positions = positions;
		this.disposeGraphObjects();

		const n = data.nodes.length;
		const m = data.links.length;

		// —— 节点 ——
		const nodePos = new Float32Array(n * 3);
		nodePos.set(positions.subarray(0, n * 3));
		const nodeCol = new Float32Array(n * 3);
		const ghost = new Float32Array(n);
		this.sizes = new Float32Array(n);
		for (let i = 0; i < n; i++) {
			const node = data.nodes[i];
			if (!node) continue;
			const c = folderColor(node.folderTop, node.unresolved);
			nodeCol[i * 3] = c.r;
			nodeCol[i * 3 + 1] = c.g;
			nodeCol[i * 3 + 2] = c.b;
			ghost[i] = node.unresolved ? 1 : 0;
			this.sizes[i] = Math.min(NODE_BASE_RADIUS * (1 + 0.5 * Math.sqrt(node.degree)), NODE_MAX_RADIUS);
		}
		this.nodeGeometry = new BufferGeometry();
		this.nodeGeometry.setAttribute('position', new BufferAttribute(nodePos, 3));
		this.nodeGeometry.setAttribute('color', new BufferAttribute(nodeCol, 3));
		this.nodeGeometry.setAttribute('aSize', new BufferAttribute(this.sizes, 1));
		this.nodeGeometry.setAttribute('aGhost', new BufferAttribute(ghost, 1));
		this.nodeMaterial = new ShaderMaterial({
			vertexShader: NODE_VERTEX_SHADER,
			fragmentShader: NODE_FRAGMENT_SHADER,
			vertexColors: true,
			transparent: true,
			depthWrite: false,
			uniforms: { uPixelScale: { value: 1 } },
		});
		this.nodePoints = new Points(this.nodeGeometry, this.nodeMaterial);
		this.nodePoints.renderOrder = 1; // 节点永远盖住链接网
		this.nodePoints.frustumCulled = false;
		this.scene.add(this.nodePoints);

		// —— 链接 ——
		const linkPos = new Float32Array(m * 2 * 3);
		const linkCol = new Float32Array(m * 2 * 3);
		for (let li = 0; li < m; li++) {
			const l = data.links[li];
			if (!l) continue;
			const sNode = data.nodes[l.source];
			const tNode = data.nodes[l.target];
			if (!sNode || !tNode) continue;
			const c = linkColor(
				folderColor(sNode.folderTop, sNode.unresolved),
				folderColor(tNode.folderTop, tNode.unresolved),
			);
			for (const v of [0, 1]) {
				linkCol[(li * 2 + v) * 3] = c.r;
				linkCol[(li * 2 + v) * 3 + 1] = c.g;
				linkCol[(li * 2 + v) * 3 + 2] = c.b;
			}
		}
		this.linkGeometry = new BufferGeometry();
		this.linkGeometry.setAttribute('position', new BufferAttribute(linkPos, 3));
		this.linkGeometry.setAttribute('color', new BufferAttribute(linkCol, 3));
		this.linkMaterial = new LineBasicMaterial({
			vertexColors: true,
			transparent: true,
			opacity: LINK_OPACITY,
			depthWrite: false,
		});
		this.linkSegments = new LineSegments(this.linkGeometry, this.linkMaterial);
		this.linkSegments.renderOrder = 0;
		this.linkSegments.frustumCulled = false;
		this.scene.add(this.linkSegments);

		this.updatePositions();
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
	}

	render(deltaS: number): void {
		this.starfield.rotation.y += STARFIELD_ROTATION_RAD_PER_S * deltaS;
		this.renderer.info.reset();
		this.composer.render();
	}

	get drawCalls(): number {
		return this.renderer.info.render.calls;
	}

	setBloomStrength(v: number): void {
		this.bloomPass.strength = v;
		this.bloomPass.enabled = v > 0.001;
	}

	getBloomStrength(): number {
		return this.bloomPass.enabled ? this.bloomPass.strength : 0;
	}

	resize(w: number, h: number): void {
		if (w < 2 || h < 2) return;
		this.camera.aspect = w / h;
		this.camera.updateProjectionMatrix();
		this.renderer.setSize(w, h);
		this.composer.setSize(w, h);
		this.bloomPass.resolution.set(w, h);
		const physH = h * this.renderer.getPixelRatio();
		const scale = physH / (2 * Math.tan(((this.camera.fov / 2) * Math.PI) / 180));
		if (this.nodeMaterial) this.nodeMaterial.uniforms['uPixelScale']!.value = scale;
	}

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

	/** 屏幕空间最近邻拾取（O(n) 仅在点击时跑一次） */
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

	private disposeGraphObjects(): void {
		if (this.nodePoints) this.scene.remove(this.nodePoints);
		if (this.linkSegments) this.scene.remove(this.linkSegments);
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
