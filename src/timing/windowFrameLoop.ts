export interface AnimationFrameOwner {
	requestAnimationFrame(callback: FrameRequestCallback): number;
	cancelAnimationFrame(id: number): void;
}

export type WindowFrameCallback = (now: number, previousNow: number | null) => void;

/**
 * 一个循环只保留一个带 owner 的 rAF 槽位。
 *
 * Electron 弹出窗口各自拥有 rAF 队列和 timestamp time origin；因此窗口切换必须在原
 * owner 上取消旧请求、清空上一帧时间，再立即从新 owner 起第一帧。
 */
export class WindowFrameLoop {
	private owner: AnimationFrameOwner | null = null;
	private frameId: number | null = null;
	private previousNow: number | null = null;
	private generation = 0;
	private disposed = false;

	constructor(private onFrame: WindowFrameCallback) {}

	setOwner(owner: AnimationFrameOwner): void {
		if (this.disposed) return;
		if (this.owner === owner && this.frameId !== null) return;
		this.cancelScheduled();
		this.owner = owner;
		this.previousNow = null;
		this.schedule();
	}

	private schedule(): void {
		const owner = this.owner;
		if (this.disposed || !owner || this.frameId !== null) return;
		const generation = ++this.generation;
		let frameId = 0;
		frameId = owner.requestAnimationFrame((now) => {
			// cancelAnimationFrame 后浏览器仍可能交付已经进入任务队列的 callback。
			if (
				this.disposed ||
				this.owner !== owner ||
				this.generation !== generation ||
				this.frameId !== frameId
			) return;

			this.frameId = null;
			const previousNow = this.previousNow;
			this.previousNow = now;
			this.onFrame(now, previousNow);

			// onFrame 可能同步触发换窗或 dispose；两种情况都不能在旧 owner 上复活。
			if (!this.disposed && this.owner === owner && this.generation === generation && this.frameId === null) {
				this.schedule();
			}
		});
		this.frameId = frameId;
	}

	private cancelScheduled(): void {
		this.generation++;
		if (this.owner && this.frameId !== null) this.owner.cancelAnimationFrame(this.frameId);
		this.frameId = null;
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.cancelScheduled();
		this.owner = null;
		this.previousNow = null;
	}
}
