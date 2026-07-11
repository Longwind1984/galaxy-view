import { describe, expect, it } from 'vitest';
import { CURVE_BOW, fillLinkPositions, segsFor } from '../src/render/linkCurves';

// 两个节点：源在 (10,0,0)，靶在 (0,10,0)——中点在离原点有距离的位置，径向外拱方向确定
const positions = new Float32Array([10, 0, 0, 0, 10, 0]);
const links = [{ source: 0, target: 1 }];

describe('segsFor', () => {
	it('曲率 0 恒为 1 段（与旧直线渲染等价）', () => {
		expect(segsFor(0, 8)).toBe(1);
		expect(segsFor(0.0005, 8)).toBe(1);
	});
	it('曲率开启取档位段数', () => {
		expect(segsFor(0.5, 8)).toBe(8);
		expect(segsFor(1, 4)).toBe(4);
	});
});

describe('fillLinkPositions', () => {
	it('K=1 直线：两顶点就是端点', () => {
		const out = new Float32Array(6);
		fillLinkPositions(out, positions, links, 1, 0);
		expect([...out]).toEqual([10, 0, 0, 0, 10, 0]);
	});

	it('曲线首末顶点严格落在端点上（弧线不脱节点）', () => {
		const K = 8;
		const out = new Float32Array(K * 6);
		fillLinkPositions(out, positions, links, K, 0.6);
		expect(out[0]).toBeCloseTo(10);
		expect(out[1]).toBeCloseTo(0);
		expect(out[2]).toBeCloseTo(0);
		expect(out[(K - 1) * 6 + 3]).toBeCloseTo(0);
		expect(out[(K - 1) * 6 + 4]).toBeCloseTo(10);
		expect(out[(K - 1) * 6 + 5]).toBeCloseTo(0);
	});

	it('折线连续：每段起点 = 上段终点', () => {
		const K = 8;
		const out = new Float32Array(K * 6);
		fillLinkPositions(out, positions, links, K, 0.6);
		for (let i = 1; i < K; i++) {
			expect(out[i * 6]).toBeCloseTo(out[(i - 1) * 6 + 3] ?? NaN);
			expect(out[i * 6 + 1]).toBeCloseTo(out[(i - 1) * 6 + 4] ?? NaN);
			expect(out[i * 6 + 2]).toBeCloseTo(out[(i - 1) * 6 + 5] ?? NaN);
		}
	});

	it('弧顶沿径向外拱，弓高 = 曲率 × CURVE_BOW × 边长 ÷ 2（贝塞尔中点性质）', () => {
		const K = 8;
		const curvature = 1;
		const out = new Float32Array(K * 6);
		fillLinkPositions(out, positions, links, K, curvature);
		// K 偶数 → 第 K/2 段起点恰为 t=0.5 的贝塞尔中点
		const mx = out[(K / 2) * 6] ?? 0;
		const my = out[(K / 2) * 6 + 1] ?? 0;
		const mz = out[(K / 2) * 6 + 2] ?? 0;
		const dist = Math.hypot(mx - 5, my - 5, mz - 0); // 弦中点 (5,5,0)
		const edgeLen = Math.hypot(10 - 0, 0 - 10, 0);
		expect(dist).toBeCloseTo((curvature * CURVE_BOW * edgeLen) / 2, 5);
		// 外拱方向 = 远离原点
		expect(Math.hypot(mx, my, mz)).toBeGreaterThan(Math.hypot(5, 5, 0));
	});

	it('undefined 边留零跳过，不错位后续边', () => {
		const twoLinks = [undefined, { source: 0, target: 1 }];
		const out = new Float32Array(2 * 6).fill(99);
		fillLinkPositions(out, positions, twoLinks, 1, 0);
		expect([...out.slice(0, 6)]).toEqual([99, 99, 99, 99, 99, 99]); // 跳过=不写
		expect([...out.slice(6)]).toEqual([10, 0, 0, 0, 10, 0]);
	});
});
