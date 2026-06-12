// FNV-1a 确定性散列：种子布局（基准可复现）与调色板分配共用
export function hash32(s: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

export function unit(s: string): number {
	return hash32(s) / 0xffffffff;
}

/** 按 id 确定性地撒进半径 radius 的球内，返回 [x,y,z] */
export function seedPosition(id: string, radius: number): [number, number, number] {
	const u = unit(id);
	const v = unit(id + ':v');
	const w = unit(id + ':w');
	const r = radius * Math.cbrt(u);
	const theta = 2 * Math.PI * v;
	const phi = Math.acos(2 * w - 1);
	return [r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi)];
}

/** 与节点规模匹配的种子球半径 */
export function seedRadius(nodeCount: number): number {
	return 80 * Math.cbrt(Math.max(nodeCount, 1) / 1000);
}
