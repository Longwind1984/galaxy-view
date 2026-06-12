import workerSource from 'worker:./forceWorker.ts';
import type { GraphData, LayoutParams } from '../types';
import type { LayoutEngine } from './LayoutEngine';

interface TickMsg {
	type: 'tick';
	buffer: ArrayBuffer;
	alpha: number;
	settled: boolean;
	ticks: number;
}

/**
 * Worker 布局（M3 性能硬化）：d3-force-3d 跑在 Blob URL Worker 里，
 * 坐标经 transferable 双缓冲乒乓回传——主线程每帧只剩一次 38KB memcpy。
 * 创建失败（罕见环境）由调用方回退 MainThreadForceLayout。
 */
export class WorkerForceLayout implements LayoutEngine {
	positions: Float32Array = new Float32Array(0);

	private worker: Worker | null = null;
	private url = '';
	private dirty = false;
	private settled = true;
	private _ticks = 0;

	get ticks(): number {
		return this._ticks;
	}

	init(data: GraphData, positions: Float32Array, params: LayoutParams, initialAlpha = 1): void {
		this.disposeWorker();
		this.positions = positions;
		this._ticks = 0;
		this.dirty = false;

		this.url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
		this.worker = new Worker(this.url);
		this.worker.onmessage = (e: MessageEvent) => {
			const m = e.data as TickMsg;
			if (m.type !== 'tick') return;
			const incoming = new Float32Array(m.buffer);
			this.positions.set(incoming.subarray(0, this.positions.length));
			this._ticks = m.ticks;
			this.settled = m.settled;
			this.dirty = true;
			// 归还 buffer（transferable 乒乓）
			this.worker?.postMessage({ type: 'buffer', buffer: m.buffer }, [m.buffer]);
		};

		const n = data.nodes.length;
		const posCopy = new Float32Array(positions); // worker 持有自己的副本
		const linkIdx = new Uint32Array(data.links.length * 2);
		data.links.forEach((l, i) => {
			linkIdx[i * 2] = l.source;
			linkIdx[i * 2 + 1] = l.target;
		});
		const degrees = new Float32Array(n);
		data.nodes.forEach((node, i) => (degrees[i] = Math.max(node.degree, 1)));
		const bufA = new ArrayBuffer(n * 3 * 4);
		const bufB = new ArrayBuffer(n * 3 * 4);

		this.settled = initialAlpha < 0.001;
		this.worker.postMessage(
			{
				type: 'init',
				count: n,
				positions: posCopy.buffer,
				links: linkIdx.buffer,
				degrees: degrees.buffer,
				params,
				initialAlpha,
				bufA,
				bufB,
			},
			[posCopy.buffer, linkIdx.buffer, degrees.buffer, bufA, bufB],
		);
	}

	/** 返回「本帧坐标有更新」——调用方据此刷新渲染缓冲 */
	step(): boolean {
		const had = this.dirty;
		this.dirty = false;
		return had;
	}

	isSettled(): boolean {
		return this.settled;
	}

	reheat(alpha = 0.3): void {
		this.settled = false;
		this.worker?.postMessage({ type: 'reheat', alpha });
	}

	updateParams(params: LayoutParams): void {
		this.settled = false;
		this.worker?.postMessage({ type: 'params', params });
	}

	private disposeWorker(): void {
		this.worker?.terminate();
		this.worker = null;
		if (this.url) {
			URL.revokeObjectURL(this.url);
			this.url = '';
		}
	}

	dispose(): void {
		this.disposeWorker();
		this.settled = true;
		this.dirty = false;
	}
}
