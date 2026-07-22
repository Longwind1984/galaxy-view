import { t } from '../i18n';

export interface SliderSpec {
	label: string;
	min: number;
	max: number;
	step: number;
	defaultValue: number;
	get: () => number;
	set: (v: number) => void;
	fmt?: (v: number) => string;
	onInput: () => void;
}

/**
 * Lightroom 式参数滑杆（G1 反馈：默认值居中 + 限位可视化）。
 * - 默认值永远在轨道几何中心：左半轴 [min,default]、右半轴 [default,max] 分段线性
 * - 中心刻痕 = 默认位；填充条从刻痕画到滑块（一眼看出偏离方向与幅度）
 * - 轨道两端常驻 min/max 限位值；双击回默认
 */
export class Slider {
	private thumbEl: HTMLElement;
	private fillEl: HTMLElement;
	private valueEl: HTMLElement;
	private trackEl: HTMLElement;

	constructor(
		parent: HTMLElement,
		private spec: SliderSpec,
	) {
		const root = parent.createDiv({ cls: 'gx-slider' });

		const head = root.createDiv({ cls: 'gx-slider-head' });
		head.createSpan({ cls: 'gx-slider-label', text: spec.label });
		this.valueEl = head.createSpan({ cls: 'gx-slider-value' });

		this.trackEl = root.createDiv({
			cls: 'gx-slider-track',
			attr: {
				role: 'slider',
				tabindex: '0',
				'aria-label': spec.label,
				'aria-valuemin': String(spec.min),
				'aria-valuemax': String(spec.max),
			},
		});
		this.trackEl.createDiv({ cls: 'gx-slider-rail' });
		this.fillEl = this.trackEl.createDiv({ cls: 'gx-slider-fill' });
		this.trackEl.createDiv({ cls: 'gx-slider-notch', attr: { title: t('slider.notch', { v: this.fmt(spec.defaultValue) }) } });
		this.thumbEl = this.trackEl.createDiv({ cls: 'gx-slider-thumb' });

		const bounds = root.createDiv({ cls: 'gx-slider-bounds' });
		bounds.createSpan({ text: this.fmt(spec.min) });
		bounds.createSpan({ text: this.fmt(spec.max) });

		this.bindDrag();
		this.bindKeyboard();
		this.trackEl.addEventListener('dblclick', () => this.applyValue(spec.defaultValue));
		this.refresh();
	}

	private fmt(v: number): string {
		return this.spec.fmt ? this.spec.fmt(v) : v.toFixed(2);
	}

	/** 位置(0..1) → 值：默认值锚定在 0.5 */
	private posToValue(p: number): number {
		const { min, max, defaultValue: d, step } = this.spec;
		const raw = p <= 0.5 ? min + (d - min) * (p / 0.5) : d + (max - d) * ((p - 0.5) / 0.5);
		const stepped = Math.round(raw / step) * step;
		return Math.min(Math.max(stepped, min), max);
	}

	private valueToPos(v: number): number {
		const { min, max, defaultValue: d } = this.spec;
		if (v <= d) return d === min ? 0 : (0.5 * (v - min)) / (d - min);
		return max === d ? 1 : 0.5 + (0.5 * (v - d)) / (max - d);
	}

	/** All user input converges here so visual and accessible state stay in sync. */
	private applyValue(v: number): void {
		const { min, max } = this.spec;
		const clamped = Math.min(Math.max(v, min), max);
		this.spec.set(Number(clamped.toFixed(12)));
		this.refresh();
		this.spec.onInput();
	}

	private stepValue(delta: number): number {
		// Keep repeated decimal steps (for example 0.1) from accumulating noise.
		return Number((this.spec.get() + delta).toFixed(12));
	}

	private bindKeyboard(): void {
		this.trackEl.addEventListener('keydown', (e) => {
			let next: number;
			switch (e.key) {
				case 'ArrowLeft':
				case 'ArrowDown':
					next = this.stepValue(-this.spec.step);
					break;
				case 'ArrowRight':
				case 'ArrowUp':
					next = this.stepValue(this.spec.step);
					break;
				case 'Home':
					next = this.spec.min;
					break;
				case 'End':
					next = this.spec.max;
					break;
				default:
					return;
			}
			e.preventDefault();
			this.applyValue(next);
		});
	}

	private bindDrag(): void {
		const onPointer = (e: PointerEvent) => {
			const rect = this.trackEl.getBoundingClientRect();
			const p = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
			this.applyValue(this.posToValue(p));
		};
		this.trackEl.addEventListener('pointerdown', (e) => {
			e.preventDefault();
			this.trackEl.setPointerCapture(e.pointerId);
			onPointer(e);
			const move = (ev: PointerEvent) => onPointer(ev);
			const up = (ev: PointerEvent) => {
				this.trackEl.releasePointerCapture(ev.pointerId);
				this.trackEl.removeEventListener('pointermove', move);
				this.trackEl.removeEventListener('pointerup', up);
			};
			this.trackEl.addEventListener('pointermove', move);
			this.trackEl.addEventListener('pointerup', up);
		});
	}

	refresh(): void {
		const v = this.spec.get();
		const p = this.valueToPos(v);
		this.thumbEl.style.left = `${(p * 100).toFixed(2)}%`;
		const from = Math.min(p, 0.5);
		const width = Math.abs(p - 0.5);
		this.fillEl.style.left = `${(from * 100).toFixed(2)}%`;
		this.fillEl.style.width = `${(width * 100).toFixed(2)}%`;
		this.valueEl.setText(this.fmt(v));
		this.valueEl.toggleClass('is-default', Math.abs(v - this.spec.defaultValue) < this.spec.step / 2);
		this.trackEl.setAttribute('aria-valuenow', String(v));
		this.trackEl.setAttribute('aria-valuetext', this.fmt(v));
	}
}
