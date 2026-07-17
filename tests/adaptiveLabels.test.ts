import { describe, expect, it } from 'vitest';
import { adaptiveLabelBudget, adaptiveLabelFontSize, labelBox, labelBoxesOverlap } from '../src/overlay/adaptiveLabels';

describe('adaptive labels', () => {
	it('starts with the hub budget and reveals more labels while zooming in', () => {
		expect(adaptiveLabelBudget(500, 14, 0.5)).toBe(14);
		expect(adaptiveLabelBudget(500, 14, 1)).toBe(14);
		expect(adaptiveLabelBudget(500, 14, 2)).toBe(39);
		expect(adaptiveLabelBudget(500, 14, 4)).toBe(90);
	});

	it('never exceeds the available nodes or the quality-tier safety cap', () => {
		expect(adaptiveLabelBudget(20, 14, 8)).toBe(20);
		expect(adaptiveLabelBudget(10_000, 14, 100)).toBe(140);
		expect(adaptiveLabelBudget(100, 0, 3)).toBe(0);
	});

	it('uses a logarithmic type scale based on the number of links', () => {
		expect(adaptiveLabelFontSize(0, 100)).toBe(10);
		expect(adaptiveLabelFontSize(9, 99)).toBeCloseTo(12.5, 1);
		expect(adaptiveLabelFontSize(100, 100)).toBe(15);
		expect(adaptiveLabelFontSize(10_000, 100)).toBe(15);
	});

	it('detects overlapping label footprints', () => {
		const first = labelBox('Main hub', 100, 100);
		expect(labelBoxesOverlap(first, labelBox('Nearby', 110, 100))).toBe(true);
		expect(labelBoxesOverlap(first, labelBox('Far away', 250, 100))).toBe(false);
	});
});
