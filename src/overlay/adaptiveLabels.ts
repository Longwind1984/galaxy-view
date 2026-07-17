export interface LabelBox {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/**
 * Number of labels to display at a given camera zoom.
 * `zoom` is 1 at the overview framing and grows as the camera moves closer.
 */
export function adaptiveLabelBudget(total: number, overviewBudget: number, zoom: number): number {
	const available = Math.max(Math.floor(total), 0);
	const base = Math.max(Math.floor(overviewBudget), 0);
	if (available === 0 || base === 0) return 0;
	const level = Math.max(Number.isFinite(zoom) ? zoom : 1, 1);
	const expanded = base + Math.round(base * 1.8 * (level - 1));
	return Math.min(available, expanded, base * 10);
}

/** Logarithmic type scale: minor nodes stay legible while major hubs stand out. */
export function adaptiveLabelFontSize(degree: number, maxDegree: number): number {
	const links = Math.max(Number.isFinite(degree) ? degree : 0, 0);
	const ceiling = Math.max(Number.isFinite(maxDegree) ? maxDegree : 1, 1);
	const importance = Math.min(Math.log1p(links) / Math.log1p(ceiling), 1);
	return 10 + importance * 5;
}

/** Approximate a one-line label footprint before the browser has laid it out. */
export function labelBox(name: string, x: number, y: number, fontSize = 11): LabelBox {
	const width = Math.min(Math.max(Array.from(name).length * fontSize * 0.59 + 12, 36), 260);
	return {
		left: x - width / 2 - 4,
		right: x + width / 2 + 4,
		top: y - fontSize - 19,
		bottom: y - 7,
	};
}

export function labelBoxesOverlap(a: LabelBox, b: LabelBox): boolean {
	return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
