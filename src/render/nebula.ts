import {
	AdditiveBlending,
	BufferAttribute,
	BufferGeometry,
	Color,
	Points,
	ShaderMaterial,
} from 'three';
import type { GraphData } from '../types';

// ---------- 共用：确定性噪声 / 随机 ----------

function hash2(ix: number, iy: number, seed: number): number {
	let h = (ix * 374761393 + iy * 668265263 + seed * 1442695) | 0;
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** mulberry32：确定性 PRNG，固定 seed → 每次分布一致（换主题只重染色不搬云） */
function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const NEBULA_ROTATION_RAD_PER_S = 0.0004; // 极慢自转 = 云团整体的呼吸漂移

// 体积云：面向相机的软高斯大精灵，sizeAttenuation 近大远小 → 真实纵深，加色叠加成浓淡。
const NEBULA_VERTEX = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
varying vec3 vColor;
uniform float uPixelScale;
uniform float uMaxPoint;

void main() {
	vColor = aColor;
	vec4 mv = modelViewMatrix * vec4(position, 1.0);
	gl_PointSize = min(aSize * uPixelScale / max(-mv.z, 1.0), uMaxPoint);
	gl_Position = projectionMatrix * mv;
}
`;

const NEBULA_FRAGMENT = /* glsl */ `
varying vec3 vColor;
uniform float uIntensity;

void main() {
	// r: 0=中心 → 1=精灵半径；很软的高斯，让相邻云片无缝融合成雾（不是一颗颗圆斑）
	float r = length(gl_PointCoord - 0.5) * 2.0;
	float a = exp(-r * r * 2.6) - 0.0743; // r=1 处精确归零；系数偏大=中心不实、边缘更飘
	if (a < 0.003) discard;
	// 系数压到「薄如雾」：颜色 0.30 / 透明度 0.22——加色叠加下浓处仍成色，但不再有实体块感
	gl_FragColor = vec4(vColor * uIntensity * 0.30, a * uIntensity * 0.22);
}
`;

const NEBULA_CENTERS = 6; // 云核数：图周围不同深度的几团
const SPRITES_PER_CENTER = 24;
const NEBULA_MAX = NEBULA_CENTERS * SPRITES_PER_CENTER;

/**
 * 星云（体积版，v0.4.1）：放弃 BackSide 球壳天幕（Rick 反馈「像球面裹在半空」），
 * 改为散布在图周围体积里的软 billboard 云片。云核成团、各在不同深度，加色叠加自然成浓淡，
 * sizeAttenuation 带来巡航视差。永远面向相机 = 不露球面轮廓。
 * 分布用固定 seed（换主题只重染色不搬云）；强度滑杆只调 uniform（零重建）。
 */
export class NebulaDome {
	readonly object: Points<BufferGeometry, ShaderMaterial>;
	private radius: number;
	private scale = 1; // 质量档密度缩放（sprite 数）
	private count = 0;

	constructor(radius: number) {
		this.radius = radius;
		const geo = new BufferGeometry();
		geo.setAttribute('position', new BufferAttribute(new Float32Array(NEBULA_MAX * 3), 3));
		geo.setAttribute('aColor', new BufferAttribute(new Float32Array(NEBULA_MAX * 3), 3));
		geo.setAttribute('aSize', new BufferAttribute(new Float32Array(NEBULA_MAX), 1));
		geo.setDrawRange(0, 0);
		const mat = new ShaderMaterial({
			vertexShader: NEBULA_VERTEX,
			fragmentShader: NEBULA_FRAGMENT,
			transparent: true,
			depthWrite: false,
			blending: AdditiveBlending,
			uniforms: {
				uPixelScale: { value: 1 },
				uMaxPoint: { value: 1600 },
				uIntensity: { value: 0 },
			},
		});
		this.object = new Points(geo, mat);
		this.object.renderOrder = -1; // 星点天幕之上、节点/链接之下（节点 renderOrder 1 永远盖住）
		this.object.frustumCulled = false;
	}

	setQuality(scale: number): void {
		this.scale = scale;
	}

	/** 生成/重生成云团：位置固定 seed，颜色取主题两色（各云核在两色间取一档 + 微扰） */
	bake(tintHexA: string, tintHexB: string): void {
		const rand = rng(0x9e37);
		const posAttr = this.object.geometry.getAttribute('position') as BufferAttribute;
		const colAttr = this.object.geometry.getAttribute('aColor') as BufferAttribute;
		const sizeAttr = this.object.geometry.getAttribute('aSize') as BufferAttribute;
		const pos = posAttr.array as Float32Array;
		const col = colAttr.array as Float32Array;
		const size = sizeAttr.array as Float32Array;
		const R = this.radius;
		const a = new Color(tintHexA);
		const b = new Color(tintHexB);
		const hsl = { h: 0, s: 0, l: 0 };
		const c = new Color();
		const centers = Math.max(2, Math.round(NEBULA_CENTERS * this.scale));
		const per = Math.max(6, Math.round(SPRITES_PER_CENTER * this.scale));
		let p = 0;
		for (let ci = 0; ci < centers && p < NEBULA_MAX; ci++) {
			// 云核方向随机（各向），深度 0.7R..2.4R → 有的近有的远、包裹住图
			const theta = 2 * Math.PI * rand();
			const phi = Math.acos(2 * rand() - 1);
			const cr = R * (0.7 + 1.7 * rand());
			const cx = cr * Math.sin(phi) * Math.cos(theta);
			const cy = cr * Math.sin(phi) * Math.sin(theta) * 0.75; // 略压扁，云带偏盘状
			const cz = cr * Math.cos(phi);
			const spread = R * (0.5 + 0.5 * rand());
			// 云核色：两主题色间取一档 + 亮度压低（加色叠加会自然提亮浓处）
			c.copy(a).lerp(b, rand());
			c.getHSL(hsl);
			c.setHSL(hsl.h + (rand() - 0.5) * 0.05, Math.min(hsl.s * 0.85, 0.9), 0.16 + 0.08 * rand());
			for (let k = 0; k < per && p < NEBULA_MAX; k++) {
				// 近似正态偏移（3 均匀和）→ 中心稠密、边缘稀薄
				const gx = (rand() + rand() + rand() - 1.5) * spread;
				const gy = (rand() + rand() + rand() - 1.5) * spread * 0.8;
				const gz = (rand() + rand() + rand() - 1.5) * spread;
				pos[p * 3] = cx + gx;
				pos[p * 3 + 1] = cy + gy;
				pos[p * 3 + 2] = cz + gz;
				// 尺寸：多数中等、少数大（大片打底 + 小片碎云）
				const big = rand() < 0.25;
				size[p] = R * (big ? 1.0 + 0.8 * rand() : 0.4 + 0.5 * rand());
				const j = 0.85 + 0.3 * rand(); // 逐片亮度微扰
				col[p * 3] = c.r * j;
				col[p * 3 + 1] = c.g * j;
				col[p * 3 + 2] = c.b * j;
				p++;
			}
		}
		this.count = p;
		posAttr.needsUpdate = true;
		colAttr.needsUpdate = true;
		sizeAttr.needsUpdate = true;
		this.object.geometry.setDrawRange(0, p);
	}

	setPixelScale(pixelScale: number, maxPointPx: number): void {
		this.object.material.uniforms['uPixelScale']!.value = pixelScale;
		this.object.material.uniforms['uMaxPoint']!.value = maxPointPx;
	}

	/** 强度 0–1（免重建，滑杆即时） */
	setIntensity(v: number): void {
		this.object.material.uniforms['uIntensity']!.value = v;
		this.object.visible = v > 0.005 && this.count > 0;
	}

	get visible(): boolean {
		return this.object.visible;
	}

	update(deltaS: number): void {
		this.object.rotation.y += NEBULA_ROTATION_RAD_PER_S * deltaS;
	}

	dispose(): void {
		this.object.geometry.dispose();
		this.object.material.dispose();
	}
}

// ---------- 集群云雾 ----------

const CLOUD_VERTEX = /* glsl */ `
attribute float aSize;
varying vec3 vColor;
uniform float uPixelScale;
uniform float uMaxPoint;

void main() {
	vColor = color;
	vec4 mv = modelViewMatrix * vec4(position, 1.0);
	gl_PointSize = min(aSize * uPixelScale / max(-mv.z, 1.0), uMaxPoint);
	gl_Position = projectionMatrix * mv;
}
`;

const CLOUD_FRAGMENT = /* glsl */ `
varying vec3 vColor;
uniform float uIntensity;

void main() {
	vec2 uv = gl_PointCoord - 0.5;
	float d2 = dot(uv, uv);
	float a = exp(-d2 * 10.0) - 0.0821; // 软高斯，r=0.5 处精确归零（无方形硬边）
	if (a < 0.004) discard;
	gl_FragColor = vec4(vColor * uIntensity * 0.55, a * uIntensity * 0.4);
}
`;

const MAX_CLUSTERS = 10;
const POINTS_PER_CLUSTER = 3;

/**
 * 集群云雾：稠密星团上的彩色云团（参考图里「云雾缭绕」的主体）。
 * 度数 top 节点做种子、贪心保持间距 → 每簇质心/散布半径 → 3 个抖动软 sprite，
 * 颜色 = 簇内节点均色提饱和。全部云 1 draw call；成员索引缓存供换主题重染色。
 * 只在布局沉降时刻重算（GraphController.checkSettled 驱动），巡航期零成本。
 */
export class ClusterClouds {
	readonly points: Points<BufferGeometry, ShaderMaterial>;
	private memberSamples: number[][] = [];
	private count = 0;

	constructor() {
		const geo = new BufferGeometry();
		geo.setAttribute('position', new BufferAttribute(new Float32Array(MAX_CLUSTERS * POINTS_PER_CLUSTER * 3), 3));
		geo.setAttribute('color', new BufferAttribute(new Float32Array(MAX_CLUSTERS * POINTS_PER_CLUSTER * 3), 3));
		geo.setAttribute('aSize', new BufferAttribute(new Float32Array(MAX_CLUSTERS * POINTS_PER_CLUSTER), 1));
		geo.setDrawRange(0, 0);
		const mat = new ShaderMaterial({
			vertexShader: CLOUD_VERTEX,
			fragmentShader: CLOUD_FRAGMENT,
			vertexColors: true,
			transparent: true,
			depthWrite: false,
			blending: AdditiveBlending,
			uniforms: {
				uPixelScale: { value: 1 },
				uMaxPoint: { value: 300 },
				uIntensity: { value: 0 },
			},
		});
		this.points = new Points(geo, mat);
		this.points.renderOrder = -1; // 与星空同层（在其后 add，画在星点之上、链接之下）
		this.points.frustumCulled = false;
	}

	/** 沉降时刻重算簇与几何；数据重建后成员索引会失效，须再次调用前先 clear() */
	rebuild(data: GraphData, positions: Float32Array, graphRadius: number): void {
		const nodes = data.nodes;
		const n = nodes.length;
		this.memberSamples = [];
		if (n < 20) {
			this.count = 0;
			this.points.geometry.setDrawRange(0, 0);
			return;
		}
		// 种子：度数 top 候选 + 贪心间距（≥0.5R），最多 MAX_CLUSTERS 簇
		const order = Array.from({ length: n }, (_, i) => i).sort((x, y) => (nodes[y]?.degree ?? 0) - (nodes[x]?.degree ?? 0));
		const seeds: number[] = [];
		const minGap = graphRadius * 0.5;
		for (const cand of order.slice(0, 250)) {
			const cx = positions[cand * 3] ?? 0;
			const cy = positions[cand * 3 + 1] ?? 0;
			const cz = positions[cand * 3 + 2] ?? 0;
			let ok = true;
			for (const sd of seeds) {
				if (Math.hypot(cx - (positions[sd * 3] ?? 0), cy - (positions[sd * 3 + 1] ?? 0), cz - (positions[sd * 3 + 2] ?? 0)) < minGap) {
					ok = false;
					break;
				}
			}
			if (ok) seeds.push(cand);
			if (seeds.length >= MAX_CLUSTERS) break;
		}
		const posAttr = this.points.geometry.getAttribute('position') as BufferAttribute;
		const sizeAttr = this.points.geometry.getAttribute('aSize') as BufferAttribute;
		const pArr = posAttr.array as Float32Array;
		const sArr = sizeAttr.array as Float32Array;
		const memberR = graphRadius * 0.33;
		let p = 0;
		let hashSeed = 11;
		for (const sd of seeds) {
			const sx = positions[sd * 3] ?? 0;
			const sy = positions[sd * 3 + 1] ?? 0;
			const sz = positions[sd * 3 + 2] ?? 0;
			// 簇成员：种子邻域内的节点（O(n·簇数)，仅沉降时刻跑一次）
			const members: number[] = [];
			let mx = 0;
			let my = 0;
			let mz = 0;
			for (let i = 0; i < n; i++) {
				const dx = (positions[i * 3] ?? 0) - sx;
				const dy = (positions[i * 3 + 1] ?? 0) - sy;
				const dz = (positions[i * 3 + 2] ?? 0) - sz;
				if (dx * dx + dy * dy + dz * dz < memberR * memberR) {
					members.push(i);
					mx += positions[i * 3] ?? 0;
					my += positions[i * 3 + 1] ?? 0;
					mz += positions[i * 3 + 2] ?? 0;
				}
			}
			if (members.length < 8) continue;
			mx /= members.length;
			my /= members.length;
			mz /= members.length;
			let sq = 0;
			for (const i of members) {
				sq += (((positions[i * 3] ?? 0) - mx) ** 2 + ((positions[i * 3 + 1] ?? 0) - my) ** 2 + ((positions[i * 3 + 2] ?? 0) - mz) ** 2);
			}
			const spread = Math.sqrt(sq / members.length);
			const sample = members.length > 120 ? members.filter((_, k) => k % Math.ceil(members.length / 120) === 0) : members;
			for (let k = 0; k < POINTS_PER_CLUSTER; k++) {
				const jx = (hash2(hashSeed, k, 3) - 0.5) * spread;
				const jy = (hash2(hashSeed, k, 5) - 0.5) * spread * 0.7;
				const jz = (hash2(hashSeed, k, 7) - 0.5) * spread;
				pArr[p * 3] = mx + jx;
				pArr[p * 3 + 1] = my + jy;
				pArr[p * 3 + 2] = mz + jz;
				sArr[p] = spread * (1.6 + 0.8 * hash2(hashSeed, k, 13));
				this.memberSamples.push(sample);
				p++;
			}
			hashSeed++;
		}
		this.count = p;
		posAttr.needsUpdate = true;
		sizeAttr.needsUpdate = true;
		this.points.geometry.setDrawRange(0, p);
	}

	/** 数据重建（vault 变化）后成员索引失效：先清空，等下次沉降重算 */
	clear(): void {
		this.count = 0;
		this.memberSamples = [];
		this.points.geometry.setDrawRange(0, 0);
	}

	/** 换配色主题时重染（免重算簇）：簇内均色 → 提饱和定亮度，加色混合下读作彩色星云 */
	recolor(colorOf: (nodeIndex: number) => Color): void {
		if (this.count === 0) return;
		const colAttr = this.points.geometry.getAttribute('color') as BufferAttribute;
		const cArr = colAttr.array as Float32Array;
		const hsl = { h: 0, s: 0, l: 0 };
		const acc = new Color();
		for (let p = 0; p < this.count; p++) {
			const sample = this.memberSamples[p] ?? [];
			acc.setRGB(0, 0, 0);
			for (const i of sample) acc.add(colorOf(i));
			if (sample.length > 0) acc.multiplyScalar(1 / sample.length);
			acc.getHSL(hsl);
			acc.setHSL(hsl.h, Math.min(hsl.s * 1.25, 1), 0.4);
			cArr[p * 3] = acc.r;
			cArr[p * 3 + 1] = acc.g;
			cArr[p * 3 + 2] = acc.b;
		}
		colAttr.needsUpdate = true;
	}

	setIntensity(v: number): void {
		this.points.material.uniforms['uIntensity']!.value = v;
		this.points.visible = v > 0.005 && this.count > 0;
	}

	get intensity(): number {
		return this.points.material.uniforms['uIntensity']!.value as number;
	}

	setPixelScale(pixelScale: number, maxPointPx: number): void {
		this.points.material.uniforms['uPixelScale']!.value = pixelScale;
		this.points.material.uniforms['uMaxPoint']!.value = maxPointPx;
	}

	dispose(): void {
		this.points.geometry.dispose();
		this.points.material.dispose();
	}
}
