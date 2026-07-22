/**
 * 将 document visibility 与元素 viewport 可见性合成一个 paused 状态。
 * 每次 bind 都开启新代际；旧窗口已经排队的 IntersectionObserver callback 会被忽略。
 */
export class WindowVisibilityBinding {
	private generation = 0;
	private observer: IntersectionObserver | null = null;
	private doc: Document | null = null;
	private onVisibilityChange: (() => void) | null = null;
	private disposed = false;

	constructor(
		private target: Element,
		private onPausedChange: (paused: boolean) => void,
	) {}

	bind(win: Window, doc: Document): void {
		if (this.disposed) return;
		this.generation++;
		this.releaseCurrent();
		const generation = this.generation;
		// 不继承旧 observer 的 false；新 document 的 hidden 状态仍会在 sync 中立即生效。
		let visible = true;
		const isCurrent = () => !this.disposed && this.generation === generation;
		const sync = () => {
			if (!isCurrent()) return;
			this.onPausedChange(doc.hidden || !visible);
		};
		const onVisibilityChange = () => sync();
		this.doc = doc;
		this.onVisibilityChange = onVisibilityChange;
		doc.addEventListener('visibilitychange', onVisibilityChange);

		// DOM typings把构造器放在 globalThis；Electron 的每个 Window 运行时各自持有该构造器。
		const Observer = (win as Window & { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver;
		const observer = new Observer((entries) => {
			if (!isCurrent() || this.observer !== observer) return;
			visible = entries[0]?.isIntersecting ?? true;
			sync();
		});
		this.observer = observer;
		observer.observe(this.target);
		sync();
	}

	private releaseCurrent(): void {
		this.observer?.disconnect();
		this.observer = null;
		if (this.doc && this.onVisibilityChange) {
			this.doc.removeEventListener('visibilitychange', this.onVisibilityChange);
		}
		this.doc = null;
		this.onVisibilityChange = null;
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.generation++;
		this.releaseCurrent();
	}
}
