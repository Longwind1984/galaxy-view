/** 创世动画前 55% 时间用于按半径错峰，后 45% 是每个节点自己的展开窗口。 */
export const REVEAL_DELAY_SPAN = 0.55;
export const REVEAL_ACTIVE_SPAN = 0.45;

function finite(v: number | undefined): number {
	return v !== undefined && Number.isFinite(v) ? v : 0;
}

/** 与节点/链接 vertex shader 共用的径向波次标尺。 */
export function revealScale(progress: number, radius: number, maxRadius: number): number {
	const p = Number.isFinite(progress) ? Math.min(Math.max(progress, 0), 1) : progress > 0 ? 1 : 0;
	const safeMax = Number.isFinite(maxRadius) && maxRadius > 0 ? maxRadius : 1;
	const safeRadius = Number.isFinite(radius) ? Math.max(radius, 0) : 0;
	const delay = (safeRadius / safeMax) * REVEAL_DELAY_SPAN;
	const local = Math.min(Math.max((p - delay) / REVEAL_ACTIVE_SPAN, 0), 1);
	return 1 - Math.pow(1 - local, 3);
}

export function maxPositionRadius(positions: ArrayLike<number>, nodeCount: number): number {
	let maxRadius = 1;
	const count = Math.min(Math.max(Math.floor(nodeCount), 0), Math.floor(positions.length / 3));
	for (let i = 0; i < count; i++) {
		const radius = Math.hypot(
			finite(positions[i * 3]),
			finite(positions[i * 3 + 1]),
			finite(positions[i * 3 + 2]),
		);
		if (radius > maxRadius) maxRadius = radius;
	}
	return maxRadius;
}

/**
 * 只更新 CPU 侧的“当前显示坐标”，供标签、拾取和镜头查询使用。
 * WebGL 节点/链接由同一进度的 shader 展开，不再逐帧上传几何。
 */
export function fillRevealPositions(
	out: Float32Array,
	target: Float32Array,
	nodeCount: number,
	maxRadius: number,
	progress: number,
): void {
	if (out.buffer === target.buffer) {
		throw new Error('Reveal target and display buffers must not alias');
	}
	const count = Math.min(
		Math.max(Math.floor(nodeCount), 0),
		Math.floor(out.length / 3),
		Math.floor(target.length / 3),
	);
	for (let i = 0; i < count; i++) {
		const x = finite(target[i * 3]);
		const y = finite(target[i * 3 + 1]);
		const z = finite(target[i * 3 + 2]);
		const scale = revealScale(progress, Math.hypot(x, y, z), maxRadius);
		out[i * 3] = x * scale;
		out[i * 3 + 1] = y * scale;
		out[i * 3 + 2] = z * scale;
	}
}
