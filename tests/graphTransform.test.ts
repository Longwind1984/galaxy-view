import { describe, expect, it } from 'vitest';
import { fitGraphPositions } from '../src/render/graphTransform';

describe('fitGraphPositions', () => {
	it('moves an off-center graph to the world origin without changing its scale', () => {
		const source = new Float32Array([90, -40, 20, 110, -40, 20]);
		const target = new Float32Array(source.length);
		const transform = fitGraphPositions(source, target, 2, 100);

		expect(transform.center).toEqual([100, -40, 20]);
		expect(transform.scale).toBe(1);
		expect([...target]).toEqual([-10, 0, 0, 10, 0, 0]);
	});

	it('uniformly scales every node inside the existing shell safety radius', () => {
		const source = new Float32Array([-200, 0, 0, 200, 0, 0, 0, 100, 0]);
		const target = new Float32Array(source.length);
		const transform = fitGraphPositions(source, target, 3, 80);
		const radii = [0, 1, 2].map((i) => Math.hypot(target[i * 3] ?? 0, target[i * 3 + 1] ?? 0, target[i * 3 + 2] ?? 0));

		expect(transform.scale).toBeLessThan(1);
		expect(Math.max(...radii)).toBeCloseTo(80, 4);
	});

	it('fits the linked body without letting an isolated outlier shrink it', () => {
		const source = new Float32Array([-100, 0, 0, 100, 0, 0, 1000, 0, 0]);
		const target = new Float32Array(source.length);
		const transform = fitGraphPositions(source, target, 3, 80, new Float32Array([10, 10, 0]));

		expect(transform.center).toEqual([0, 0, 0]);
		expect(transform.scale).toBeCloseTo(0.8, 4);
		expect(target[0]).toBeCloseTo(-80, 4);
		expect(target[3]).toBeCloseTo(80, 4);
		expect(target[6]).toBeCloseTo(800, 4);
	});

	it('handles an empty graph without producing invalid coordinates', () => {
		const transform = fitGraphPositions([], new Float32Array(0), 0, 80);
		expect(transform).toEqual({ center: [0, 0, 0], scale: 1, sourceRadius: 0 });
	});
});
