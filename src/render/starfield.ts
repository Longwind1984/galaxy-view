import { BufferAttribute, BufferGeometry, Color, Group, Points, PointsMaterial } from 'three';

export function disposeStarfield(group: Group): void {
	for (const child of group.children) {
		const p = child as Points<BufferGeometry, PointsMaterial>;
		p.geometry.dispose();
		p.material.dispose();
	}
}

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

export function buildStarfield(shellRadius: number): Group {
	const group = new Group();
	const rand = mulberry(0x517cc1);
	for (const cls of CLASSES) {
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
			const c =
				pick < 0.85 ? COOL_A.clone().lerp(COOL_B, rand()) : pick < 0.95 ? WARM.clone() : BLUE.clone();
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
	}
	return group;
}
