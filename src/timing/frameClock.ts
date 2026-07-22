/** rAF 实际帧间隔：首次/换窗口首帧为 0，异常、负值归零；动画计时使用，不截短低帧率。 */
export function elapsedFrameSeconds(now: number, previousNow: number | null): number {
	if (previousNow === null) return 0;
	const elapsedSeconds = (now - previousNow) / 1000;
	if (!Number.isFinite(elapsedSeconds)) return 0;
	return Math.max(elapsedSeconds, 0);
}

/** 模拟/渲染帧间隔：在安全实际间隔之上加长帧上限，避免单帧跳跃。 */
export function frameDeltaSeconds(now: number, previousNow: number | null, maxSeconds = 0.1): number {
	return Math.min(elapsedFrameSeconds(now, previousNow), maxSeconds);
}

/** 下游计时器只接受有限、非负帧间隔。 */
export function safeFrameSeconds(deltaS: number): number {
	return Number.isFinite(deltaS) ? Math.max(deltaS, 0) : 0;
}

/** 归一化动画进度，任何输入都严格落在 [0, 1]。 */
export function progress01(elapsedMs: number, durationMs: number): number {
	if (!Number.isFinite(elapsedMs)) return elapsedMs > 0 ? 1 : 0;
	if (!Number.isFinite(durationMs) || durationMs <= 0) return 1;
	return Math.min(Math.max(elapsedMs / durationMs, 0), 1);
}
