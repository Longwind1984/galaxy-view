// 每个预设的手绘小图标（用 createSvg 现画，避免 innerHTML；颜色跟随预设主题色）。
type Attr = Record<string, string | number>;
interface Shape {
	tag: 'circle' | 'ellipse' | 'path' | 'line';
	attr: Attr;
}

const DOT = (cx: number, cy: number, r: number): Shape => ({ tag: 'circle', attr: { cx, cy, r, fill: 'currentColor', stroke: 'none' } });
const P = (d: string): Shape => ({ tag: 'path', attr: { d } });

const ICONS: Record<string, Shape[]> = {
	galaxy: [DOT(12, 12, 1.7), P('M12 12 C 17 9 20 13 17 17'), P('M12 12 C 7 15 4 11 7 7')],
	spiral: [DOT(12, 12, 1.5), P('M12 12 C 18.5 10 19 16.5 13 18.5'), P('M12 12 C 5.5 14 5 7.5 11 5.5')],
	orbits: [
		DOT(12, 12, 1.7),
		{ tag: 'ellipse', attr: { cx: 12, cy: 12, rx: 8, ry: 4 } },
		{ tag: 'ellipse', attr: { cx: 12, cy: 12, rx: 4.6, ry: 2.3 } },
		DOT(20, 12, 1.1),
	],
	deepfield: [DOT(6, 7, 1), DOT(17, 6, 1.3), DOT(11, 12, 1), DOT(19, 15, 1), DOT(7, 17, 1.2), DOT(14, 18, 0.9)],
	nebula: [{ tag: 'path', attr: { d: 'M8 13 C 6 9 11 6 14 9 C 18 8 19 14 15 15 C 13 18 8 17 8 13 Z', fill: 'currentColor', 'fill-opacity': 0.22 } }],
	minimal: [DOT(6, 16, 1.6), DOT(13, 8, 1.6), DOT(18, 16, 1.6), P('M6 16 L13 8 L18 16')],
	fireworks: [
		P('M12 12 L12 5'), P('M12 12 L17.5 8'), P('M12 12 L19 13.5'), P('M12 12 L15 18.5'), P('M12 12 L8 18'), P('M12 12 L5 13.5'), P('M12 12 L7 8'),
		DOT(12, 5, 0.9), DOT(17.5, 8, 0.9), DOT(19, 13.5, 0.9), DOT(15, 18.5, 0.9), DOT(8, 18, 0.9), DOT(5, 13.5, 0.9), DOT(7, 8, 0.9),
	],
	supernova: [
		DOT(12, 12, 3),
		P('M12 3 L12 6'), P('M12 18 L12 21'), P('M3 12 L6 12'), P('M18 12 L21 12'),
		P('M6 6 L8 8'), P('M16 16 L18 18'), P('M18 6 L16 8'), P('M8 16 L6 18'),
	],
	custom: [{ tag: 'path', attr: { d: 'M12 4 L14.2 9.2 L20 9.7 L15.6 13.5 L17 19 L12 16 L7 19 L8.4 13.5 L4 9.7 L9.8 9.2 Z', fill: 'currentColor', 'fill-opacity': 0.28 } }],
};

/** 在 parent 里画出某预设的图标（color = 预设主题色，通过 currentColor 生效） */
export function drawPresetIcon(parent: HTMLElement, id: string, color: string): void {
	const svg = parent.createSvg('svg', {
		attr: { viewBox: '0 0 24 24', width: 18, height: 18, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
	});
	svg.style.color = color;
	for (const s of ICONS[id] ?? ICONS['custom'] ?? []) svg.createSvg(s.tag, { attr: s.attr });
}
