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
	private degrees: number[] = [];
	private settled = true;
	private _ticks = 0;

	get ticks(): number {
		return this._ticks;
	}

	init(data: GraphData, positions: Float32Array, params: LayoutParams, initialAlpha = 1): void {
		this.dispose();
		this.positions = positions;
		this.degrees = data.nodes.map((n) => Math.max(n.degree, 1));
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
			.force('link', forceLink<LNode>(links).distance(params.linkDistance).strength(this.linkStrengthFn(params.linkStrength)))
			.force('charge', forceManyBody<LNode>().strength(params.charge).distanceMax(800))
			.force('x', forceX<LNode>(0).strength(params.centerPull))
			.force('y', forceY<LNode>(0).strength(params.centerPull + params.flatten))
			.force('z', forceZ<LNode>(0).strength(params.centerPull))
			.stop();
		this.sim.alpha(initialAlpha);
		this._ticks = 0;
		this.settled = false;
	}

	/** d3 默认 strength = 1/min(端点连接数)，倍率叠加其上（保持枢纽不被拉爆的特性） */
	private linkStrengthFn(mult: number): (link: SimLink<LNode>) => number {
		const degrees = this.degrees;
		return (link) => {
			const s = typeof link.source === 'number' ? link.source : (link.source.index ?? 0);
			const t = typeof link.target === 'number' ? link.target : (link.target.index ?? 0);
			const base = 1 / Math.min(degrees[s] ?? 1, degrees[t] ?? 1);
			return Math.min(base * mult, 1);
		};
	}

	updateParams(params: LayoutParams): void {
		const sim = this.sim;
		if (!sim) return;
		(sim.force('charge') as import('d3-force-3d').ManyBodyForce<LNode> | undefined)?.strength(params.charge);
		const link = sim.force('link') as import('d3-force-3d').LinkForce<LNode> | undefined;
		link?.distance(params.linkDistance);
		link?.strength(this.linkStrengthFn(params.linkStrength));
		(sim.force('x') as import('d3-force-3d').PositionForce<LNode> | undefined)?.strength(params.centerPull);
		(sim.force('y') as import('d3-force-3d').PositionForce<LNode> | undefined)?.strength(params.centerPull + params.flatten);
		(sim.force('z') as import('d3-force-3d').PositionForce<LNode> | undefined)?.strength(params.centerPull);
		this.reheat(0.5);
	}

	step(): boolean {
		const sim = this.sim;
		if (!sim || this.settled) return false;
		sim.tick();
		this._ticks++;
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
