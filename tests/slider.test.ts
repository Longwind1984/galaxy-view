import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/i18n', () => ({
	t: (_key: string, vars?: Record<string, string | number>) => `Default ${vars?.v ?? ''}`,
}));

import { Slider, type SliderSpec } from '../src/overlay/Slider';

type FakeEvent = Record<string, unknown>;
type FakeListener = (event: FakeEvent) => void;

interface CreateOptions {
	cls?: string;
	text?: string;
	attr?: Record<string, string>;
}

class FakeElement {
	readonly children: FakeElement[] = [];
	readonly style: Record<string, string> = {};
	readonly classes = new Set<string>();
	readonly attributes = new Map<string, string>();
	text = '';
	focused = false;
	private listeners = new Map<string, FakeListener[]>();

	createDiv(options: CreateOptions = {}): FakeElement {
		const child = new FakeElement();
		if (options.cls) child.classes.add(options.cls);
		if (options.text) child.text = options.text;
		for (const [name, value] of Object.entries(options.attr ?? {})) child.setAttribute(name, value);
		this.children.push(child);
		return child;
	}

	createSpan(options: CreateOptions = {}): FakeElement {
		return this.createDiv(options);
	}

	addEventListener(type: string, listener: FakeListener): void {
		const listeners = this.listeners.get(type) ?? [];
		listeners.push(listener);
		this.listeners.set(type, listeners);
	}

	removeEventListener(type: string, listener: FakeListener): void {
		this.listeners.set(type, (this.listeners.get(type) ?? []).filter((candidate) => candidate !== listener));
	}

	emit(type: string, event: FakeEvent = {}): void {
		for (const listener of this.listeners.get(type) ?? []) listener(event);
	}

	setAttribute(name: string, value: string): void {
		this.attributes.set(name, value);
	}

	getAttribute(name: string): string | null {
		return this.attributes.get(name) ?? null;
	}

	setText(value: string): void {
		this.text = value;
	}

	toggleClass(name: string, enabled: boolean): void {
		if (enabled) this.classes.add(name);
		else this.classes.delete(name);
	}

	focus(): void {
		this.focused = true;
	}

	getBoundingClientRect(): Pick<DOMRect, 'left' | 'width'> {
		return { left: 0, width: 100 };
	}

	setPointerCapture(): void {}
	releasePointerCapture(): void {}

	find(className: string): FakeElement {
		if (this.classes.has(className)) return this;
		for (const child of this.children) {
			try {
				return child.find(className);
			} catch {
				// Continue through the small synthetic tree.
			}
		}
		throw new Error(`Missing .${className}`);
	}
}

function makeSlider(overrides: Partial<SliderSpec> = {}): {
	slider: Slider;
	track: FakeElement;
	read: () => number;
	write: ReturnType<typeof vi.fn>;
	onInput: ReturnType<typeof vi.fn>;
} {
	let value = overrides.defaultValue ?? 0.5;
	const write = vi.fn((next: number) => {
		value = next;
	});
	const onInput = vi.fn();
	const parent = new FakeElement();
	const slider = new Slider(parent as unknown as HTMLElement, {
		label: 'Density',
		min: 0,
		max: 1,
		step: 0.1,
		defaultValue: 0.5,
		get: () => value,
		set: write,
		fmt: (current) => `${Math.round(current * 100)}%`,
		onInput,
		...overrides,
	});
	return { slider, track: parent.find('gx-slider-track'), read: () => value, write, onInput };
}

function keyEvent(key: string): { key: string; preventDefault: ReturnType<typeof vi.fn> } {
	return { key, preventDefault: vi.fn() };
}

describe('Slider keyboard accessibility', () => {
	beforeEach(() => vi.clearAllMocks());

	it('exposes a focusable slider and keeps its accessible value in sync', () => {
		let external = 0.5;
		const { slider, track } = makeSlider({
			get: () => external,
			set: (next) => {
				external = next;
			},
		});

		expect(track.getAttribute('tabindex')).toBe('0');
		expect(track.getAttribute('role')).toBe('slider');
		expect(track.getAttribute('aria-label')).toBe('Density');
		expect(track.getAttribute('aria-valuemin')).toBe('0');
		expect(track.getAttribute('aria-valuemax')).toBe('1');
		expect(track.getAttribute('aria-valuenow')).toBe('0.5');
		expect(track.getAttribute('aria-valuetext')).toBe('50%');

		external = 0.3;
		slider.refresh();
		expect(track.getAttribute('aria-valuenow')).toBe('0.3');
		expect(track.getAttribute('aria-valuetext')).toBe('30%');
	});

	it('applies arrow, Home, and End keys while focused', () => {
		const { track, read, onInput } = makeSlider();
		track.focus();
		expect(track.focused).toBe(true);

		const cases: Array<[string, number]> = [
			['ArrowRight', 0.6],
			['ArrowUp', 0.7],
			['ArrowLeft', 0.6],
			['ArrowDown', 0.5],
			['Home', 0],
			['End', 1],
		];
		for (const [key, expected] of cases) {
			const event = keyEvent(key);
			track.emit('keydown', event);
			expect(read()).toBe(expected);
			expect(event.preventDefault).toHaveBeenCalledOnce();
			expect(track.getAttribute('aria-valuenow')).toBe(String(expected));
		}
		expect(onInput).toHaveBeenCalledTimes(cases.length);

		const ignored = keyEvent('PageUp');
		track.emit('keydown', ignored);
		expect(ignored.preventDefault).not.toHaveBeenCalled();
		expect(onInput).toHaveBeenCalledTimes(cases.length);
	});

	it('preserves pointer input and double-click reset through the same update path', () => {
		const { track, read, write, onInput } = makeSlider({ defaultValue: 0.4 });
		const preventDefault = vi.fn();
		track.emit('pointerdown', { clientX: 75, pointerId: 1, preventDefault });
		expect(preventDefault).toHaveBeenCalledOnce();
		expect(read()).toBe(0.7);
		expect(track.getAttribute('aria-valuenow')).toBe('0.7');

		track.emit('dblclick');
		expect(read()).toBe(0.4);
		expect(track.getAttribute('aria-valuenow')).toBe('0.4');
		expect(write).toHaveBeenCalledTimes(2);
		expect(onInput).toHaveBeenCalledTimes(2);
	});
});
