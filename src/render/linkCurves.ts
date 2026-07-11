// 曲线连线（v0.4）：二次贝塞尔，控制点 = 边中点沿「远离星系核（原点）」方向外推。
// 布局的 centerPull/coreGravity 都指向原点，所以径向外拱 = 弧线绕开亮核，
// 长边拱得更高（弓高 ∝ 边长）——NASA Eyes 式的轨道弧感。
// 被否决的备选：节点坐标传 GPU 纹理、顶点着色器算曲线（每帧 O(n) 更优，
// 但布局热窗口只有几秒，CPU gather 足够；见 WORKLOG 2026-07-09）。

/** 满曲率（滑杆=1）时弓高 ≈ 边长的 32%（起点值，真机眼调） */
export const CURVE_BOW = 0.32;

/** 每边折线段数：曲率关闭时 1 段，与直线渲染完全等价（几何/内存零变化） */
export function segsFor(curvature: number, tierSegs: number): number {
	return curvature > 0.001 ? Math.max(tierSegs, 1) : 1;
}

/**
 * 把 links 的折线顶点写入 out（LineSegments 布局：每边 K 段 = 2K 顶点连续存放，
 * out 长度须 ≥ links.length·K·6）。O(m·K)，仅布局热窗口/创世动画逐帧调用，沉降后零成本。
 */
export function fillLinkPositions(
	out: Float32Array,
	positions: Float32Array,
	links: readonly ({ source: number; target: number } | undefined)[],
	K: number,
	curvature: number,
): void {
	const bow = curvature * CURVE_BOW;
	let o = 0;
	for (let li = 0; li < links.length; li++) {
		const l = links[li];
		if (!l) {
			o += K * 6;
			continue;
		}
		const s = l.source * 3;
		const t = l.target * 3;
		const sx = positions[s] ?? 0;
		const sy = positions[s + 1] ?? 0;
		const sz = positions[s + 2] ?? 0;
		const tx = positions[t] ?? 0;
		const ty = positions[t + 1] ?? 0;
		const tz = positions[t + 2] ?? 0;
		if (K === 1 || bow <= 0) {
			out[o++] = sx;
			out[o++] = sy;
			out[o++] = sz;
			out[o++] = tx;
			out[o++] = ty;
			out[o++] = tz;
			continue;
		}
		const mx = (sx + tx) / 2;
		const my = (sy + ty) / 2;
		const mz = (sz + tz) / 2;
		const len = Math.hypot(tx - sx, ty - sy, tz - sz);
		const mr = Math.hypot(mx, my, mz);
		let dx: number;
		let dy: number;
		let dz: number;
		if (mr > 1e-3) {
			dx = mx / mr;
			dy = my / mr;
			dz = mz / mr;
		} else {
			// 中点几乎在原点（穿核对径边）：退化方向取边向量 × Y 轴的垂线
			const ex = tx - sx;
			const ez = tz - sz;
			const pl = Math.hypot(ez, ex);
			if (pl > 1e-6) {
				dx = ez / pl;
				dy = 0;
				dz = -ex / pl;
			} else {
				dx = 1;
				dy = 0;
				dz = 0;
			}
		}
		const h = bow * len;
		const cx = mx + dx * h;
		const cy = my + dy * h;
		const cz = mz + dz * h;
		let px = sx;
		let py = sy;
		let pz = sz;
		for (let i = 1; i <= K; i++) {
			const tt = i / K;
			const w0 = (1 - tt) * (1 - tt);
			const w1 = 2 * (1 - tt) * tt;
			const w2 = tt * tt;
			const qx = w0 * sx + w1 * cx + w2 * tx;
			const qy = w0 * sy + w1 * cy + w2 * ty;
			const qz = w0 * sz + w1 * cz + w2 * tz;
			out[o++] = px;
			out[o++] = py;
			out[o++] = pz;
			out[o++] = qx;
			out[o++] = qy;
			out[o++] = qz;
			px = qx;
			py = qy;
			pz = qz;
		}
	}
}
