/** 留在既有 6.5× 星空球壳内的显示半径；约 5% 内边距给节点光晕和透视。 */
export const GRAPH_FIT_RADIUS_FACTOR = 6.2;
/** 以链接端点权重计，主体的这一部分必须留在安全半径内。 */
export const GRAPH_BODY_WEIGHT_COVERAGE = 0.95;

export interface GraphDisplayTransform {
	center: [number, number, number];
	scale: number;
	sourceRadius: number;
}

/** 加权分位直方图的桶数；2048 桶 ≈ 0.05% 半径分辨率，够显示层用了 */
const RADIUS_BUCKETS = 2048;

/** 复用的直方图桶，避免每帧分配（本函数在布局热时逐帧调用） */
let radiusHistogram: Float64Array | null = null;
function histogram(): Float64Array {
	if (!radiusHistogram) radiusHistogram = new Float64Array(RADIUS_BUCKETS);
	return radiusHistogram;
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
	if (useWeights) {
		// 加权 95% 分位半径。原实现每帧 new 一个 [半径,权重] 元组数组再全量排序（O(N log N) + N 次分配），
		// 而本函数在布局热时每帧都跑（GraphController 的 rAF → updatePositions）——9.8k 节点实测 1.53ms/帧、
		// 占 60fps 预算 9.2%，还带来每帧上万次分配的 GC 压力。改为定桶直方图：O(N)、零分配。
		// 分位落在桶上界，误差 ≤ maxWeighted/BUCKETS，方向偏保守（主体略微更靠内），观感无损。
		let maxWeighted = 0;
		for (let i = 0; i < count; i++) {
			if (Math.max(finite(nodeWeights?.[i]), 0) <= 0) continue;
			const dx = finite(source[i * 3]) - cx;
			const dy = finite(source[i * 3 + 1]) - cy;
			const dz = finite(source[i * 3 + 2]) - cz;
			const radius = Math.hypot(dx, dy, dz);
			if (radius > maxWeighted) maxWeighted = radius;
		}
		if (maxWeighted > 0) {
			const hist = histogram();
			hist.fill(0);
			for (let i = 0; i < count; i++) {
				const weight = Math.max(finite(nodeWeights?.[i]), 0);
				if (weight <= 0) continue;
				const dx = finite(source[i * 3]) - cx;
				const dy = finite(source[i * 3 + 1]) - cy;
				const dz = finite(source[i * 3 + 2]) - cz;
				const radius = Math.hypot(dx, dy, dz);
				const b = Math.min(Math.floor((radius / maxWeighted) * RADIUS_BUCKETS), RADIUS_BUCKETS - 1);
				hist[b] = (hist[b] ?? 0) + weight;
			}
			const targetWeight = totalWeight * GRAPH_BODY_WEIGHT_COVERAGE;
			let seenWeight = 0;
			for (let b = 0; b < RADIUS_BUCKETS; b++) {
				seenWeight += hist[b] ?? 0;
				if (seenWeight >= targetWeight) {
					sourceRadius = ((b + 1) / RADIUS_BUCKETS) * maxWeighted;
					break;
				}
			}
			if (sourceRadius === 0) sourceRadius = maxWeighted;
		}
	} else {
		for (let i = 0; i < count; i++) {
			const dx = finite(source[i * 3]) - cx;
			const dy = finite(source[i * 3 + 1]) - cy;
			const dz = finite(source[i * 3 + 2]) - cz;
			sourceRadius = Math.max(sourceRadius, Math.hypot(dx, dy, dz));
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
