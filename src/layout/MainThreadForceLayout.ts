import { forceLink, forceManyBody, forceSimulation, forceX, forceY, forceZ } from 'd3-force-3d';
import type { SimLink, SimNode, Simulation } from 'd3-force-3d';
import type { GraphData, LayoutParams } from '../types';
import type { LayoutEngine } from './LayoutEngine';

interface LNode extends SimNode {
	x: number;
	y: number;
	z: number;
}

export class MainThreadForceLayout implements LayoutEngine {
	positions: Float32Array = new Float32Array(0);

	private sim: Simulation<LNode> | null = null;
	private simNodes: LNode[] = [];
	private settled = true;

	init(data: GraphData, positions: Float32Array, params: LayoutParams): void {
		this.dispose();
		this.positions = positions;
		this.simNodes = data.nodes.map((_, i) => ({
			x: positions[i * 3] ?? 0,
			y: positions[i * 3 + 1] ?? 0,
			z: positions[i * 3 + 2] ?? 0,
		}));
		const links: SimLink<LNode>[] = data.links.map((l) => ({ source: l.source, target: l.target }));

		// forceSimulation 创建即自启动内部 timer——立刻 stop，改由渲染循环逐帧驱动
		this.sim = forceSimulation(this.simNodes, 3)
			.alphaDecay(1 - Math.pow(0.001, 1 / 300))
			.velocityDecay(params.velocityDecay)
			.force('link', forceLink<LNode>(links).distance(params.linkDistance))
			.force('charge', forceManyBody<LNode>().strength(params.charge).distanceMax(800))
			.force('x', forceX<LNode>(0).strength(params.centerPull))
			.force('y', forceY<LNode>(0).strength(params.centerPull))
			.force('z', forceZ<LNode>(0).strength(params.centerPull))
			.stop();
		this.settled = false;
	}

	step(): boolean {
		const sim = this.sim;
		if (!sim || this.settled) return false;
		sim.tick();
		const pos = this.positions;
		const nodes = this.simNodes;
		for (let i = 0; i < nodes.length; i++) {
			const n = nodes[i];
			if (!n) continue;
			pos[i * 3] = n.x;
			pos[i * 3 + 1] = n.y;
			pos[i * 3 + 2] = n.z;
		}
		if (sim.alpha() < sim.alphaMin()) this.settled = true;
		return !this.settled;
	}

	isSettled(): boolean {
		return this.settled;
	}

	reheat(alpha = 0.3): void {
		if (!this.sim) return;
		this.sim.alpha(Math.max(this.sim.alpha(), alpha));
		this.settled = false;
	}

	dispose(): void {
		this.sim?.stop();
		this.sim = null;
		this.simNodes = [];
		this.settled = true;
	}
}
