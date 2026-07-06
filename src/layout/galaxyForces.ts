import type { Force, SimNode } from 'd3-force-3d';

// 单一来源：Worker（forceWorker.ts）与主线程回退（MainThreadForceLayout.ts）都从这里
// 引入，避免两处实现漂移。两个力都是 d3-force-3d 形状的自定义力（force(alpha) + initialize）。

/** 归一化半径（约星系盘半径量级），把强度缩放到合理区间 */
const CORE_R = 200;
const SPIRAL_R = 160;

/**
 * 径向核心引力：在柱面半径 r=hypot(x,z) 上把节点拉向中轴，外圈更强（线性于 r），
 * 并按度数加权（hub 沉核，度权钳 [0.3,3]）→ 致密亮核 + 径向密度梯度。
 * 全程 alpha 缩放 → 沉降后趋零、不炸暖图。
 * 无 .strength() setter：改强度请用 sim.force('core', forceRadialCore(v, degrees)) 重建。
 */
export function forceRadialCore(strength: number, degrees: ArrayLike<number>): Force<SimNode> {
	let nodes: SimNode[] = [];
	let meanDeg = 1;
	const force: Force<SimNode> = (alpha: number) => {
		if (strength === 0) return;
		for (const n of nodes) {
			const x = n.x ?? 0;
			const z = n.z ?? 0;
			const r = Math.hypot(x, z);
			if (r < 1e-4) continue;
			const degW = Math.min(Math.max((degrees[n.index ?? 0] || 1) / meanDeg, 0.3), 3);
			const pull = (strength * degW * alpha * r) / CORE_R; // 线性于 r
			n.vx = (n.vx ?? 0) - (x / r) * pull;
			n.vz = (n.vz ?? 0) - (z / r) * pull;
		}
	};
	force.initialize = (ns: SimNode[]) => {
		nodes = ns;
		let sum = 0;
		for (const n of ns) sum += degrees[n.index ?? 0] || 1;
		meanDeg = ns.length ? sum / ns.length : 1;
	};
	return force;
}

/**
 * 旋臂切向力：内快外慢 swirl=1/(1+r/R) 的微弱切向推力，冷却期把盘梳成对数旋臂。
 * alpha 缩放 + swirl 衰减 → 防止「永远转」。
 */
export function forceSpiral(strength: number): Force<SimNode> {
	let nodes: SimNode[] = [];
	const force: Force<SimNode> = (alpha: number) => {
		if (strength === 0) return;
		for (const n of nodes) {
			const x = n.x ?? 0;
			const z = n.z ?? 0;
			const r = Math.hypot(x, z);
			if (r < 1e-3) continue;
			const swirl = 1 / (1 + r / SPIRAL_R);
			const k = strength * alpha * swirl;
			// 切向 (-z, x)/r，乘 r 抵消 → 稳定的切向线速度推进
			n.vx = (n.vx ?? 0) + (-z / r) * k * r;
			n.vz = (n.vz ?? 0) + (x / r) * k * r;
		}
	};
	force.initialize = (ns: SimNode[]) => {
		nodes = ns;
	};
	return force;
}
