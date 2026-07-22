import { Vector3 } from 'three';
import type { FlyPathOptions } from '../interactions/CameraDirector';
import { safeFrameSeconds } from '../timing/frameClock';

/** GraphController 注入的动词——TourDirector 不碰 WebGL，只调用这些 */
export interface TourHooks {
	nodeCount: () => number;
	degreeOf: (i: number) => number;
	nodePosition: (i: number, out: Vector3) => Vector3;
	graphRadius: () => number;
	selectNode: (i: number, fly: boolean) => void;
	clearSelection: () => void;
	recenter: () => void;
	flyPath: (waypoints: Vector3[], durMs: number, opts: FlyPathOptions) => void;
	beginIdleOrbit: () => void;
	onPath: () => boolean;
	/** 运行态变化（面板按钮同步 播放/停止） */
	onStateChange?: (running: boolean) => void;
}

type TourKind = 'wander' | 'guided';

/** 每隔几拍插一段飞掠给漫游添电影感变化（其余拍是「飞向节点→环绕→弹卡」） */
const WANDER_FLYBY_EVERY = 4;

/**
 * 巡游状态机（v0.3 方向 C 重构）。tick(deltaS) 由 GraphController 的 rAF（paused 守卫内）驱动，
 * 隐藏视图自然冻结、恢复无缝。两种意图：
 * - **漫游 wander**：单一自动导演，把「回顾/飞掠/大巡游」合三为一——主要是逐个飞向加权节点
 *   （度数×久未见，枢纽自然被光顾）并环绕弹卡，每 WANDER_FLYBY_EVERY 拍插一段样条飞掠添变化。
 * - **连接两篇 guided**：沿预算好的最短路径逐节点走（GraphController 选完两点、算完 BFS 后调用）。
 */
export class TourDirector {
	private running = false;
	private kind: TourKind = 'wander';
	private speed = 1;
	private dwellRemainingMs = 0;
	private beat = 0;
	private visited = new Set<number>();
	private queue: number[] = []; // guided=最短路径
	private queueIdx = 0;
	private tmp = new Vector3();

	constructor(private hooks: TourHooks) {}

	get isRunning(): boolean {
		return this.running;
	}

	/** 漫游：一键氛围自动巡游（无需选模式） */
	startWander(speed: number): void {
		if (this.hooks.nodeCount() === 0) return;
		this.kind = 'wander';
		this.speed = Math.max(0.2, speed);
		this.running = true;
		this.visited.clear();
		this.beat = 0;
		this.dwellRemainingMs = 0; // 下一 tick 立即起第一拍
		this.hooks.onStateChange?.(true);
	}

	/** 连接两篇：沿最短路径逐节点走 */
	startGuided(path: number[], speed: number): void {
		if (path.length < 2) return;
		this.kind = 'guided';
		this.speed = Math.max(0.2, speed);
		this.running = true;
		this.queue = path.slice();
		this.queueIdx = 0;
		this.dwellRemainingMs = 0;
		this.hooks.onStateChange?.(true);
	}

	/** 用户停止：落回熟悉的 idle 漂移 */
	stop(): void {
		if (!this.running) return;
		this.running = false;
		this.hooks.clearSelection();
		this.hooks.beginIdleOrbit();
		this.hooks.onStateChange?.(false);
	}

	/** 数据重建等场景静默中止：不碰相机（调用方会重建/清选中） */
	abort(): void {
		if (!this.running) return;
		this.running = false;
		this.hooks.onStateChange?.(false);
	}

	setSpeed(v: number): void {
		this.speed = Math.max(0.2, v);
	}

	tick(deltaS: number): void {
		if (!this.running) return;
		const frameMs = safeFrameSeconds(deltaS) * 1000;
		if (this.kind === 'guided') {
			this.tickGuided(frameMs);
			return;
		}
		this.tickWander(frameMs);
	}

	// ---------- 漫游 ----------

	private tickWander(frameMs: number): void {
		if (this.hooks.onPath()) return; // 飞掠段进行中
		this.dwellRemainingMs = Math.max(this.dwellRemainingMs - frameMs, 0);
		if (this.dwellRemainingMs > 0) return; // 正在环绕当前节点
		this.beat++;
		if (this.beat % WANDER_FLYBY_EVERY === 0) {
			this.startFlybyLeg(); // 电影感飞掠一段；onPath 门控到它结束
			return;
		}
		const next = this.pickRediscover();
		if (next < 0) return;
		this.hooks.selectNode(next, true);
		this.dwellRemainingMs = Math.max(2600, 5000 / this.speed);
	}

	// ---------- 连接两篇 ----------

	private tickGuided(frameMs: number): void {
		this.dwellRemainingMs = Math.max(this.dwellRemainingMs - frameMs, 0);
		if (this.dwellRemainingMs > 0) return;
		const next = this.queueIdx < this.queue.length ? (this.queue[this.queueIdx++] ?? -1) : -1;
		if (next < 0) {
			this.finish(); // 路径走完 → 回总览收尾
			return;
		}
		this.hooks.selectNode(next, true);
		this.dwellRemainingMs = Math.max(2600, 5000 / this.speed);
	}

	// ---------- 选点 ----------

	private pickRediscover(): number {
		const n = this.hooks.nodeCount();
		if (n === 0) return -1;
		if (this.visited.size >= n) this.visited.clear(); // 都看过 → 重新来
		let best = -1;
		let bestScore = -1;
		const tries = Math.min(64, n);
		for (let k = 0; k < tries; k++) {
			const i = Math.floor(Math.random() * n);
			if (this.visited.has(i)) continue;
			const score = (this.hooks.degreeOf(i) + 1) * (0.5 + Math.random()); // 度数加权 → 枢纽更常被光顾
			if (score > bestScore) {
				bestScore = score;
				best = i;
			}
		}
		if (best < 0) for (let i = 0; i < n && best < 0; i++) if (!this.visited.has(i)) best = i;
		if (best >= 0) this.visited.add(best);
		return best;
	}

	// ---------- 飞掠 ----------

	private startFlybyLeg(): void {
		const R = this.hooks.graphRadius();
		const wp: Vector3[] = [this.randomShell(R * 2.2)];
		for (let k = 0; k < 3; k++) {
			const i = this.pickRediscover();
			if (i < 0) continue;
			this.hooks.nodePosition(i, this.tmp);
			wp.push(this.tmp.clone().add(this.randomVec(R * 0.15)));
		}
		wp.push(this.randomShell(R * 2.2));
		if (wp.length < 2) return; // 攒不出路径就跳过这拍（下一 tick 会走回顾拍）
		this.hooks.flyPath(wp, 7000 / this.speed, { lookMode: 'tangent', lookAhead: R * 0.3, bank: 0.6 });
	}

	/** 有限巡游（连接两篇）自然结束 → 回总览 + 通知面板 */
	private finish(): void {
		this.running = false;
		this.hooks.recenter();
		this.hooks.onStateChange?.(false);
	}

	private randomShell(r: number): Vector3 {
		const u = Math.random() * 2 - 1;
		const theta = Math.random() * Math.PI * 2;
		const s = Math.sqrt(1 - u * u);
		return new Vector3(s * Math.cos(theta) * r, u * r * 0.5, s * Math.sin(theta) * r); // 略压扁，偏盘面
	}

	private randomVec(r: number): Vector3 {
		return new Vector3((Math.random() * 2 - 1) * r, (Math.random() * 2 - 1) * r, (Math.random() * 2 - 1) * r);
	}
}
