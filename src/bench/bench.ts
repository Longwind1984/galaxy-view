import type { App } from 'obsidian';
import { normalizePath } from 'obsidian';
import type { BenchResult, FrameStats } from '../types';

const BENCH_DIR = '_galaxy_bench';

/** 收集 durationMs 内的 rAF 帧间隔；onFrame 可用于驱动脚本镜头 */
export function collectFrames(
	durationMs: number,
	onFrame?: (elapsedMs: number) => void,
): Promise<FrameStats> {
	return new Promise((resolve) => {
		const deltas: number[] = [];
		let last = performance.now();
		const start = last;
		const tick = (now: number) => {
			deltas.push(now - last);
			last = now;
			const elapsed = now - start;
			onFrame?.(elapsed);
			if (elapsed < durationMs) {
				window.requestAnimationFrame(tick);
			} else {
				deltas.shift(); // 首帧间隔含启动开销，丢弃
				const sorted = [...deltas].sort((a, b) => a - b);
				const total = deltas.reduce((s, d) => s + d, 0);
				const p95 = sorted[Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1)] ?? 0;
				resolve({
					frames: deltas.length,
					avgFps: deltas.length > 0 ? 1000 / (total / deltas.length) : 0,
					p95FrameMs: p95,
					worstFrameMs: sorted[sorted.length - 1] ?? 0,
					durationMs: total,
				});
			}
		};
		window.requestAnimationFrame(tick);
	});
}

/** 观察主线程 longtask；返回 stop() 取回结果 */
export function observeLongTasks(): { stop: () => { count: number; longestMs: number; totalMs: number } } {
	let count = 0;
	let longestMs = 0;
	let totalMs = 0;
	let observer: PerformanceObserver | null = null;
	try {
		observer = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				count++;
				totalMs += entry.duration;
				if (entry.duration > longestMs) longestMs = entry.duration;
			}
		});
		observer.observe({ entryTypes: ['longtask'] });
	} catch {
		// longtask observer 不可用时降级为零值（结果中可见）
	}
	return {
		stop: () => {
			observer?.disconnect();
			return { count, longestMs, totalMs };
		},
	};
}

export function heapUsed(): number {
	const perf = performance as unknown as { memory?: { usedJSHeapSize: number } };
	return perf.memory?.usedJSHeapSize ?? -1;
}

export async function writeBenchResult(app: App, result: BenchResult): Promise<string> {
	const adapter = app.vault.adapter;
	const dir = normalizePath(BENCH_DIR);
	if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
	const file = normalizePath(`${BENCH_DIR}/${result.scenario}-${Date.now()}.json`);
	await adapter.write(file, JSON.stringify(result, null, 2));
	return file;
}

export function sleep(ms: number): Promise<void> {
	return new Promise((r) => window.setTimeout(r, ms));
}
