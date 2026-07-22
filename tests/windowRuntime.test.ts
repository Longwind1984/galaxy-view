import { describe, expect, it, vi } from 'vitest';
import { elapsedFrameSeconds } from '../src/timing/frameClock';
import type { AnimationFrameOwner } from '../src/timing/windowFrameLoop';
import { WindowFrameLoop } from '../src/timing/windowFrameLoop';
import { WindowVisibilityBinding } from '../src/timing/windowVisibility';

class FakeFrameWindow implements AnimationFrameOwner {
	private nextId = 1;
	private callbacks = new Map<number, FrameRequestCallback>();
	private staleCallbacks = new Map<number, FrameRequestCallback>();
	readonly cancelled: number[] = [];

	requestAnimationFrame(callback: FrameRequestCallback): number {
		const id = this.nextId++;
		this.callbacks.set(id, callback);
		this.staleCallbacks.set(id, callback);
		return id;
	}

	cancelAnimationFrame(id: number): void {
		this.cancelled.push(id);
		this.callbacks.delete(id);
	}

	fire(id: number, now: number): void {
		const callback = this.callbacks.get(id);
		this.callbacks.delete(id);
		callback?.(now);
	}

	fireStale(id: number, now: number): void {
		this.staleCallbacks.get(id)?.(now);
	}

	get pendingIds(): number[] {
		return [...this.callbacks.keys()];
	}
}

type VisibilityListener = () => void;

class FakeDocument {
	hidden = false;
	private listener: VisibilityListener | null = null;

	addEventListener(_type: string, listener: EventListenerOrEventListenerObject): void {
		this.listener = listener as VisibilityListener;
	}

	removeEventListener(_type: string, listener: EventListenerOrEventListenerObject): void {
		if (this.listener === listener) this.listener = null;
	}

	emitVisibility(): void {
		this.listener?.();
	}
}

class FakeObserver {
	disconnected = false;
	constructor(private callback: IntersectionObserverCallback) {}
	observe(): void {}
	disconnect(): void {
		this.disconnected = true;
	}
	emit(isIntersecting: boolean): void {
		this.callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
	}
}

function makeVisibilityWindow(): { win: Window; observers: FakeObserver[] } {
	const observers: FakeObserver[] = [];
	class Observer extends FakeObserver {
		constructor(callback: IntersectionObserverCallback) {
			super(callback);
			observers.push(this);
		}
	}
	return { win: { IntersectionObserver: Observer } as unknown as Window, observers };
}

describe('WindowFrameLoop', () => {
	it('hands the only pending frame to the new owner and resets a different time origin', () => {
		const a = new FakeFrameWindow();
		const b = new FakeFrameWindow();
		const frames: Array<[number, number | null, number]> = [];
		const loop = new WindowFrameLoop((now, previous) => frames.push([now, previous, elapsedFrameSeconds(now, previous)]));

		loop.setOwner(a);
		a.fire(1, 1_000_000);
		expect(frames).toEqual([[1_000_000, null, 0]]);
		expect(a.pendingIds).toEqual([2]);

		loop.setOwner(b);
		expect(a.cancelled).toEqual([2]);
		expect(a.pendingIds).toEqual([]);
		expect(b.pendingIds).toEqual([1]);
		b.fire(1, 12);
		expect(frames.at(-1)).toEqual([12, null, 0]);
	});

	it('ignores a cancelled old-owner callback even if it is delivered late', () => {
		const a = new FakeFrameWindow();
		const b = new FakeFrameWindow();
		const onFrame = vi.fn();
		const loop = new WindowFrameLoop(onFrame);
		loop.setOwner(a);
		loop.setOwner(b);
		a.fireStale(1, 50_000);
		expect(onFrame).not.toHaveBeenCalled();
		expect(b.pendingIds).toEqual([1]);
	});

	it('cancels on the creating owner and cannot revive after dispose', () => {
		const a = new FakeFrameWindow();
		const onFrame = vi.fn();
		const loop = new WindowFrameLoop(onFrame);
		loop.setOwner(a);
		loop.dispose();
		expect(a.cancelled).toEqual([1]);
		a.fireStale(1, 16);
		expect(onFrame).not.toHaveBeenCalled();
		expect(a.pendingIds).toEqual([]);
	});

	it('does not requeue when disposed from inside the frame callback', () => {
		const a = new FakeFrameWindow();
		let loop: WindowFrameLoop;
		const onFrame = vi.fn(() => loop.dispose());
		loop = new WindowFrameLoop(onFrame);
		loop.setOwner(a);
		a.fire(1, 16);
		expect(onFrame).toHaveBeenCalledTimes(1);
		expect(a.pendingIds).toEqual([]);
	});
});

describe('WindowVisibilityBinding', () => {
	it('resets visibility on rebind and ignores a stale old-window observer callback', () => {
		const a = makeVisibilityWindow();
		const b = makeVisibilityWindow();
		const docA = new FakeDocument();
		const docB = new FakeDocument();
		const paused: boolean[] = [];
		const binding = new WindowVisibilityBinding({} as Element, (value) => paused.push(value));

		binding.bind(a.win, docA as unknown as Document);
		a.observers[0]?.emit(false);
		expect(paused.at(-1)).toBe(true);

		binding.bind(b.win, docB as unknown as Document);
		expect(paused.at(-1)).toBe(false);
		b.observers[0]?.emit(true);
		a.observers[0]?.emit(false);
		expect(paused.at(-1)).toBe(false);

		docB.hidden = true;
		docB.emitVisibility();
		expect(paused.at(-1)).toBe(true);
	});

	it('disconnects and ignores queued callbacks after dispose', () => {
		const current = makeVisibilityWindow();
		const doc = new FakeDocument();
		const onPaused = vi.fn();
		const binding = new WindowVisibilityBinding({} as Element, onPaused);
		binding.bind(current.win, doc as unknown as Document);
		const callsBeforeDispose = onPaused.mock.calls.length;
		binding.dispose();
		current.observers[0]?.emit(false);
		doc.hidden = true;
		doc.emitVisibility();
		expect(onPaused).toHaveBeenCalledTimes(callsBeforeDispose);
		expect(current.observers[0]?.disconnected).toBe(true);
	});
});
