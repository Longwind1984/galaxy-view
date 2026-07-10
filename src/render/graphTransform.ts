/** 留在既有 6.5× 星空球壳内的显示半径；约 5% 内边距给节点光晕和透视。 */
export const GRAPH_FIT_RADIUS_FACTOR = 6.2;

export interface GraphDisplayTransform {
	center: [number, number, number];
	scale: number;
	sourceRadius: number;
}

function finite(v: number | undefined): number {
	return v !== undefined && Number.isFinite(v) ? v : 0;
}

/**
 * 只变换渲染坐标：质心移到原点，超出安全半径时等比缩小。
 * 力学模拟与位置缓存继续使用 source，不被显示约束反向污染。
 */
export function fitGraphPositions(
	source: ArrayLike<number>,
	target: Float32Array,
	nodeCount: number,
	maxRadius: number,
): GraphDisplayTransform {
	const count = Math.min(
		Math.max(Math.floor(nodeCount), 0),
		Math.floor(source.length / 3),
		Math.floor(target.length / 3),
	);
	if (count === 0) return { center: [0, 0, 0], scale: 1, sourceRadius: 0 };

	let cx = 0;
	let cy = 0;
	let cz = 0;
	for (let i = 0; i < count; i++) {
		cx += finite(source[i * 3]);
		cy += finite(source[i * 3 + 1]);
		cz += finite(source[i * 3 + 2]);
	}
	cx /= count;
	cy /= count;
	cz /= count;

	let sourceRadius = 0;
	for (let i = 0; i < count; i++) {
		const dx = finite(source[i * 3]) - cx;
		const dy = finite(source[i * 3 + 1]) - cy;
		const dz = finite(source[i * 3 + 2]) - cz;
		sourceRadius = Math.max(sourceRadius, Math.hypot(dx, dy, dz));
	}
	const scale = sourceRadius > maxRadius && maxRadius > 0 ? maxRadius / sourceRadius : 1;

	for (let i = 0; i < count; i++) {
		target[i * 3] = (finite(source[i * 3]) - cx) * scale;
		target[i * 3 + 1] = (finite(source[i * 3 + 1]) - cy) * scale;
		target[i * 3 + 2] = (finite(source[i * 3 + 2]) - cz) * scale;
	}

	return { center: [cx, cy, cz], scale, sourceRadius };
}
