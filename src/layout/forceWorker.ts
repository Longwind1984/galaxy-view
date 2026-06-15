import { forceLink, forceManyBody, forceSimulation, forceX, forceY, forceZ } from 'd3-force-3d';
import type { SimLink, SimNode, Simulation } from 'd3-force-3d';
import type { LayoutParams } from '../types';

/**
 * 布局 Worker（M3）：d3-force-3d 完全离主线程。
 * 协议：init（坐标/边/度数 transferable 进）→ 批量 tick（每批 ≤12ms）→
 * 坐标经双缓冲乒乓 transferable 回传（零拷贝），消费完归还。
 */

interface WNode extends SimNode {
	x: number;
	y: number;
	z: number;
}

interface InitMsg {
	type: 'init';
	count: number;
	positions: ArrayBuffer;
	links: ArrayBuffer; // Uint32Array [s0,t0,s1,t1,...]
	degrees: ArrayBuffer; // Float32Array
	params: LayoutParams;
	initialAlpha: number;
	bufA: ArrayBuffer;
	bufB: ArrayBuffer;
}

type InMsg =
	| InitMsg
	| { type: 'params'; params: LayoutParams }
	| { type: 'reheat'; alpha: number }
	| { type: 'buffer'; buffer: ArrayBuffer };

interface WorkerCtx {
	onmessage: ((e: MessageEvent) => void) | null;
	postMessage(msg: unknown, transfer?: Transferable[]): void;
}

const ctx = self as unknown as WorkerCtx;

let sim: Simulation<WNode> | null = null;
let nodes: WNode[] = [];
let degrees: Float32Array = new Float32Array(0);
let freeBuffers: ArrayBuffer[] = [];
let settled = true;
let tickCount = 0;
let needPost = false;
let scheduled = false;

function linkStrengthFn(mult: number): (link: SimLink<WNode>) => number {
	return (link) => {
		const s = typeof link.source === 'number' ? link.source : (link.source.index ?? 0);
		const t = typeof link.target === 'number' ? link.target : (link.target.index ?? 0);
		const base = 1 / Math.min(degrees[s] ?? 1, degrees[t] ?? 1);
		return Math.min(base * mult, 1);
	};
}

function applyParams(params: LayoutParams): void {
	if (!sim) return;
	(sim.force('charge') as import('d3-force-3d').ManyBodyForce<WNode> | undefined)?.strength(params.charge);
	const link = sim.force('link') as import('d3-force-3d').LinkForce<WNode> | undefined;
	link?.distance(params.linkDistance);
	link?.strength(linkStrengthFn(params.linkStrength));
	(sim.force('x') as import('d3-force-3d').PositionForce<WNode> | undefined)?.strength(params.centerPull);
	(sim.force('y') as import('d3-force-3d').PositionForce<WNode> | undefined)?.strength(params.centerPull + params.flatten);
	(sim.force('z') as import('d3-force-3d').PositionForce<WNode> | undefined)?.strength(params.centerPull);
}

function schedule(): void {
	if (scheduled) return;
	scheduled = true;
	// Worker 作用域用 self（没有 window）；宏任务 yield 让批次间能处理回传消息
	self.setTimeout(run, 0);
}

function run(): void {
	scheduled = false;
	const s = sim;
	if (!s || settled) return;
	const t0 = Date.now();
	// 批量 tick：每批最多 12ms，主线程按消费节奏取最新帧
	while (Date.now() - t0 < 12) {
		s.tick();
		tickCount++;
		if (s.alpha() < s.alphaMin()) {
			settled = true;
			break;
		}
	}
	needPost = true;
	post();
	if (!settled) schedule();
}

function post(): void {
	if (!needPost || !sim) return;
	const buf = freeBuffers.pop();
	if (!buf) return; // 等 buffer 归还时再补发
	const arr = new Float32Array(buf);
	for (let i = 0; i < nodes.length; i++) {
		const n = nodes[i];
		if (!n) continue;
		arr[i * 3] = n.x;
		arr[i * 3 + 1] = n.y;
		arr[i * 3 + 2] = n.z;
	}
	needPost = false;
	ctx.postMessage({ type: 'tick', buffer: buf, alpha: sim.alpha(), settled, ticks: tickCount }, [buf]);
}

ctx.onmessage = (e: MessageEvent) => {
	const msg = e.data as InMsg;
	switch (msg.type) {
		case 'init': {
			sim?.stop();
			const pos = new Float32Array(msg.positions);
			degrees = new Float32Array(msg.degrees);
			const linkIdx = new Uint32Array(msg.links);
			nodes = [];
			for (let i = 0; i < msg.count; i++) {
				nodes.push({ x: pos[i * 3] ?? 0, y: pos[i * 3 + 1] ?? 0, z: pos[i * 3 + 2] ?? 0 });
			}
			const links: SimLink<WNode>[] = [];
			for (let li = 0; li < linkIdx.length; li += 2) {
				links.push({ source: linkIdx[li] ?? 0, target: linkIdx[li + 1] ?? 0 });
			}
			sim = forceSimulation(nodes, 3)
				.alphaDecay(1 - Math.pow(0.001, 1 / 300))
				.velocityDecay(msg.params.velocityDecay)
				.force('link', forceLink<WNode>(links).distance(msg.params.linkDistance).strength(linkStrengthFn(msg.params.linkStrength)))
				.force('charge', forceManyBody<WNode>().strength(msg.params.charge).distanceMax(800))
				.force('x', forceX<WNode>(0).strength(msg.params.centerPull))
				.force('y', forceY<WNode>(0).strength(msg.params.centerPull + msg.params.flatten))
				.force('z', forceZ<WNode>(0).strength(msg.params.centerPull))
				.stop();
			sim.alpha(msg.initialAlpha);
			freeBuffers = [msg.bufA, msg.bufB];
			tickCount = 0;
			settled = msg.initialAlpha < sim.alphaMin();
			needPost = false;
			if (!settled) schedule();
			break;
		}
		case 'params':
			applyParams(msg.params);
			if (sim) {
				sim.alpha(Math.max(sim.alpha(), 0.5));
				settled = false;
				schedule();
			}
			break;
		case 'reheat':
			if (sim) {
				sim.alpha(Math.max(sim.alpha(), msg.alpha));
				settled = false;
				schedule();
			}
			break;
		case 'buffer':
			freeBuffers.push(msg.buffer);
			post(); // 沉降最后一帧可能在等 buffer
			break;
	}
};
