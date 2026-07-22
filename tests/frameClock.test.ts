import { describe, expect, it } from 'vitest';
import { elapsedFrameSeconds, frameDeltaSeconds, progress01, safeFrameSeconds } from '../src/timing/frameClock';

describe('cross-window frame clock', () => {
	it('resets the first frame and rejects a negative cross-origin timestamp jump', () => {
		expect(frameDeltaSeconds(1_000_000_000, null)).toBe(0);
		expect(frameDeltaSeconds(-1_000_000_000, 1_000_000_000)).toBe(0);
		expect(frameDeltaSeconds(-999_999_984, -1_000_000_000)).toBeCloseTo(0.016);
	});

	it('bounds frame intervals and animation progress', () => {
		expect(elapsedFrameSeconds(10_000, 0)).toBe(10);
		expect(frameDeltaSeconds(10_000, 0)).toBe(0.1);
		expect(safeFrameSeconds(Number.NaN)).toBe(0);
		expect(safeFrameSeconds(-1)).toBe(0);
		expect(progress01(-500, 1000)).toBe(0);
		expect(progress01(500, 1000)).toBe(0.5);
		expect(progress01(1500, 1000)).toBe(1);
	});
});
