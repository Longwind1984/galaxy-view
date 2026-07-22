import { describe, expect, it } from 'vitest';
import { effectivePixelRatio } from '../src/quality/tiers';

describe('effectivePixelRatio', () => {
	it('设备 DPR 低于档位上限时保持设备值', () => {
		expect(effectivePixelRatio(1, 2)).toBe(1);
	});

	it('设备 DPR 高于档位上限时应用档位上限', () => {
		expect(effectivePixelRatio(3, 1.5)).toBe(1.5);
	});
});
