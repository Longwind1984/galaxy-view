/** 留在既有 6.5× 星空球壳内的显示半径；约 5% 内边距给节点光晕和透视。 */
export const GRAPH_FIT_RADIUS_FACTOR = 6.2;
/** 以链接端点权重计，主体的这一部分必须留在安全半径内。 */
export const GRAPH_BODY_WEIGHT_COVERAGE = 0.95;

export interface GraphDisplayTransform {
	center: [number, number, number];
	scale: number;
	sourceRadius: number;
}

function finite(v: number | undefined): number {
	return v !== undefined && Number.isFinite(v) ? v : 0;
}

/**
 * 只变换渲染坐标：链接密度中心移到原点，主体超出安全半径时等比缩小。
 * 力学模拟与位置缓存继续使用 source，不被显示约束反向污染。
 */
export function fitGraphPositions(
	source: ArrayLike<number>,
	target: Float32Array,
	nodeCount: number,
	maxRadius: number,
	nodeWeights?: ArrayLike<number>,
): GraphDisplayTransform {
	const count = Math.min(
		Math.max(Math.floor(nodeCount), 0),
		Math.floor(source.length / 3),
		Math.floor(target.length / 3),
	);
	if (count === 0) return { center: [0, 0, 0], scale: 1, sourceRadius: 0 };

	let totalWeight = 0;
	let cx = 0;
	let cy = 0;
	let cz = 0;
	for (let i = 0; i < count; i++) {
		const weight = Math.max(finite(nodeWeights?.[i]), 0);
		totalWeight += weight;
		cx += finite(source[i * 3]) * weight;
		cy += finite(source[i * 3 + 1]) * weight;
		cz += finite(source[i * 3 + 2]) * weight;
	}
	const useWeights = totalWeight > 0;
	if (useWeights) {
		cx /= totalWeight;
		cy /= totalWeight;
		cz /= totalWeight;
	} else {
		for (let i = 0; i < count; i++) {
			cx += finite(source[i * 3]);
			cy += finite(source[i * 3 + 1]);
			cz += finite(source[i * 3 + 2]);
		}
		cx /= count;
		cy /= count;
		cz /= count;
	}

	let sourceRadius = 0;
	const weightedRadii: Array<[radius: number, weight: number]> = [];
	for (let i = 0; i < count; i++) {
		const dx = finite(source[i * 3]) - cx;
		const dy = finite(source[i * 3 + 1]) - cy;
		const dz = finite(source[i * 3 + 2]) - cz;
		const radius = Math.hypot(dx, dy, dz);
		if (useWeights) {
			const weight = Math.max(finite(nodeWeights?.[i]), 0);
			if (weight > 0) weightedRadii.push([radius, weight]);
		} else {
			sourceRadius = Math.max(sourceRadius, radius);
		}
	}
	if (useWeights) {
		weightedRadii.sort((a, b) => a[0] - b[0]);
		const targetWeight = totalWeight * GRAPH_BODY_WEIGHT_COVERAGE;
		let seenWeight = 0;
		for (const [radius, weight] of weightedRadii) {
			seenWeight += weight;
			sourceRadius = radius;
			if (seenWeight >= targetWeight) break;
		}
	}
	const scale = sourceRadius > maxRadius && maxRadius > 0 ? maxRadius / sourceRadius : 1;

	for (let i = 0; i < count; i++) {
		target[i * 3] = (finite(source[i * 3]) - cx) * scale;
		target[i * 3 + 1] = (finite(source[i * 3 + 1]) - cy) * scale;
		target[i * 3 + 2] = (finite(source[i * 3 + 2]) - cz) * scale;
	}

	return { center: [cx, cy, cz], scale, sourceRadius };
}
