import { BufferAttribute, BufferGeometry, Color, Group, Points, PointsMaterial } from 'three';

// 星空：3 个尺寸级 = 3 个 draw call（视觉规格 §1.2）；球壳分布近似无穷远
const CLASSES = [
	{ count: 2600, size: 1.2 },
	{ count: 900, size: 2.0 },
	{ count: 250, size: 3.0 },
];

const COOL_A = new Color('#9da8c4');
const COOL_B = new Color('#ffffff');
const WARM = new Color('#ffe9c9');
const BLUE = new Color('#bfd3ff');

function mulberry(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function disposeStarfield(group: Group): void {
	for (const child of group.children) {
		const p = child as Points<BufferGeometry, PointsMaterial>;
		p.geometry.dispose();
		p.material.dispose();
	}
}

/**
 * 亮星眨眼（G2.5 反馈）。品味逻辑：
 * 只有最大尺寸级的「真星」会眨——背景星不闪；同一时刻最多一颗；
 * 泊松随机间隔 + 1.6s 正弦包络——像真夜空偶尔的大气闪烁，不是圣诞彩灯。
 */
export class Twinkler {
	private baseColors: Float32Array;
	private attr: BufferAttribute;
	private active: { index: number; t: number } | null = null;
	private nextIn = 3;

	constructor(
		private geometry: BufferGeometry,
		private starCount: number,
	) {
		this.attr = geometry.getAttribute('color') as BufferAttribute;
		this.baseColors = new Float32Array(this.attr.array as Float32Array);
	}

	/** freq：期望每分钟眨眼次数 ÷ 10（滑杆 0–2，0=关） */
	update(deltaS: number, freq: number): void {
		if (this.active) {
			this.active.t += deltaS;
			const t = this.active.t;
			const DUR = 1.6;
			const arr = this.attr.array as Float32Array;
			const i = this.active.index * 3;
			const k = t >= DUR ? 1 : 1 + 2.2 * Math.sin((Math.PI * t) / DUR);
			arr[i] = (this.baseColors[i] ?? 1) * k;
			arr[i + 1] = (this.baseColors[i + 1] ?? 1) * k;
			arr[i + 2] = (this.baseColors[i + 2] ?? 1) * k;
			this.attr.needsUpdate = true;
			if (t >= DUR) this.active = null;
			return;
		}
		if (freq <= 0.01) return;
		this.nextIn -= deltaS;
		if (this.nextIn <= 0) {
			this.active = { index: Math.floor(Math.random() * this.starCount), t: 0 };
			// 泊松间隔：均值 6/freq 秒（freq=0.5 → 平均 12s 一次）
			this.nextIn = Math.min(Math.max(-Math.log(Math.random() + 1e-9) * (6 / freq), 1.5), 90);
		}
	}
}

/**
 * 空间浮星（v0.4 背景形态层）：散布在图体积内外的零星小星，sizeAttenuation 近大远小，
 * 巡航时产生视差——与球壳天幕的「无穷远」星点是两种不同的深度感。1 draw call。
 */
export function buildFieldStars(volumeRadius: number, density: number, scale = 1): Points<BufferGeometry, PointsMaterial> {
	const count = Math.max(Math.round(1200 * density * scale), 1);
	const rand = mulberry(0x2f6e1b);
	const pos = new Float32Array(count * 3);
	const col = new Float32Array(count * 3);
	for (let i = 0; i < count; i++) {
		// 立方根采样趋近体积均匀，再抬走 30% 内圈——核心区留给节点，浮星散在中远景
		const r = volumeRadius * (0.3 + 0.7 * Math.cbrt(rand()));
		const theta = 2 * Math.PI * rand();
		const phi = Math.acos(2 * rand() - 1);
		pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
		pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
		pos[i * 3 + 2] = r * Math.cos(phi);
		const pick = rand();
		const c = (pick < 0.85 ? COOL_A.clone().lerp(COOL_B, rand()) : pick < 0.95 ? WARM.clone() : BLUE.clone()).multiplyScalar(0.75);
		col[i * 3] = c.r;
		col[i * 3 + 1] = c.g;
		col[i * 3 + 2] = c.b;
	}
	const geo = new BufferGeometry();
	geo.setAttribute('position', new BufferAttribute(pos, 3));
	geo.setAttribute('color', new BufferAttribute(col, 3));
	const mat = new PointsMaterial({
		size: 2.4,
		sizeAttenuation: true,
		vertexColors: true,
		transparent: true,
		opacity: 0.6,
		depthWrite: false,
	});
	const points = new Points(geo, mat);
	points.renderOrder = -1;
	points.frustumCulled = false;
	return points;
}

export function buildStarfield(shellRadius: number, scale = 1): { group: Group; twinkler: Twinkler } {
	const group = new Group();
	const rand = mulberry(0x517cc1);
	let twinkler: Twinkler | null = null;
	for (const base of CLASSES) {
		const cls = { count: Math.max(Math.round(base.count * scale), 50), size: base.size };
		const pos = new Float32Array(cls.count * 3);
		const col = new Float32Array(cls.count * 3);
		for (let i = 0; i < cls.count; i++) {
			const theta = 2 * Math.PI * rand();
			const phi = Math.acos(2 * rand() - 1);
			const r = shellRadius * (0.95 + 0.1 * rand());
			pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
			pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
			pos[i * 3 + 2] = r * Math.cos(phi);

			const pick = rand();
			const c = pick < 0.85 ? COOL_A.clone().lerp(COOL_B, rand()) : pick < 0.95 ? WARM.clone() : BLUE.clone();
			// 大星级里 ~3% 提到 HDR 亮度，独享 bloom —— 仅有的几颗「真星」
			if (cls.size >= 3.0 && rand() < 0.03) c.multiplyScalar(1.8);
			col[i * 3] = c.r;
			col[i * 3 + 1] = c.g;
			col[i * 3 + 2] = c.b;
		}
		const geo = new BufferGeometry();
		geo.setAttribute('position', new BufferAttribute(pos, 3));
		geo.setAttribute('color', new BufferAttribute(col, 3));
		const mat = new PointsMaterial({
			size: cls.size,
			sizeAttenuation: false,
			vertexColors: true,
			transparent: true,
			opacity: 0.55,
			depthWrite: false,
		});
		const points = new Points(geo, mat);
		points.renderOrder = -1; // 星空垫底
		group.add(points);
		if (cls.size >= 3.0) twinkler = new Twinkler(geo, cls.count); // 只有「真星」级会眨眼
	}
	return { group, twinkler: twinkler ?? new Twinkler(new BufferGeometry().setAttribute('color', new BufferAttribute(new Float32Array(3), 3)), 1) };
}
