import { describe, expect, it } from 'vitest';
import {
	fillRevealPositions,
	maxPositionRadius,
	REVEAL_ACTIVE_SPAN,
	REVEAL_DELAY_SPAN,
	revealScale,
} from '../src/render/reveal';

describe('genesis reveal', () => {
	it('keeps the immutable target separate from the current display buffer', () => {
		const target = new Float32Array([10, 0, 0, 50, 0, 0, 100, 0, 0]);
		const display = new Float32Array(target.length);
		const maxRadius = maxPositionRadius(target, 3);

		fillRevealPositions(display, target, 3, maxRadius, 0);
		expect([...display]).toEqual(new Array(target.length).fill(0));
		expect([...target]).toEqual([10, 0, 0, 50, 0, 0, 100, 0, 0]);

		fillRevealPositions(display, target, 3, maxRadius, 1);
		expect([...display]).toEqual([...target]);
	});

	it('is independent of the previous frame and expands every radius monotonically', () => {
		const target = new Float32Array([20, 0, 0, 60, 0, 0, 100, 0, 0]);
		const display = new Float32Array(target.length);
		const maxRadius = maxPositionRadius(target, 3);
		const previous = [0, 0, 0];

		for (const progress of [0, 0.1, 0.25, 0.5, 0.75, 1]) {
			display.fill(999); // 上一帧输出无论是什么，都不能参与下一帧计算
			fillRevealPositions(display, target, 3, maxRadius, progress);
			for (let i = 0; i < 3; i++) {
				const radius = Math.hypot(display[i * 3] ?? 0, display[i * 3 + 1] ?? 0, display[i * 3 + 2] ?? 0);
				expect(radius).toBeGreaterThanOrEqual(previous[i] ?? 0);
				expect(radius).toBeLessThanOrEqual(target[i * 3] ?? 0);
				previous[i] = radius;
			}
		}
	});

	it('preserves the original 55% radial delay and 45% ease-out window', () => {
		expect(REVEAL_DELAY_SPAN).toBe(0.55);
		expect(REVEAL_ACTIVE_SPAN).toBe(0.45);
		expect(revealScale(0.55, 100, 100)).toBe(0);
		expect(revealScale(1, 100, 100)).toBe(1);
		expect(revealScale(0.5, 0, 100)).toBeCloseTo(1);
	});

	it('rejects the aliasing regression explicitly', () => {
		const shared = new Float32Array([10, 0, 0]);
		expect(() => fillRevealPositions(shared, shared, 1, 10, 0.5)).toThrow(/must not alias/);
	});
});
