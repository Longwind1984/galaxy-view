import { MOUSE, PerspectiveCamera, Spherical, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CRUISE, FLY_TO } from '../constants';

function easeInOutCubic(t: number): number {
	return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

interface Tween {
	t0: number;
	durMs: number;
	fromPos: Vector3;
	toPos: Vector3;
	fromTarget: Vector3;
	toTarget: Vector3;
	onDone?: () => void;
}

export interface CameraHooks {
	/** F 键：飞向当前选中（无选中则忽略） */
	onFlyToSelected: () => void;
	/** R 键：回总览 */
	onResetView: () => void;
}

const FLY_KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e']);

/**
 * 镜头导演：三层交互自由度（G1 反馈「像 FPS / Google Earth 一样移动」）
 * - 轨道基底：左键拖环绕 · 右键拖 / Ctrl(⌘)+左键拖 平移 · 滚轮缩放
 * - FPS 飞行：WASD 前后左右 + Q/E 升降，速度随离目标距离自适应，Shift ×3
 * - 编排：点击/搜索飞行 tween、闲置巡航（双不可通约周期）、F 飞向选中、R 回总览
 * 按键只在画布聚焦时生效（tabindex），不抢 Obsidian 全局快捷键。
 */
export class CameraDirector {
	cruiseEnabled = true;

	private controls: OrbitControls;
	private tween: Tween | null = null;
	private lastInputAt = 0;
	private cruiseAnchor: Spherical | null = null;
	private cruiseT = 0;
	private pressed = new Set<string>();
	private shiftHeld = false;
	private tmpOffset = new Vector3();
	private tmpSph = new Spherical();
	private tmpDir = new Vector3();
	private tmpRight = new Vector3();
	private disposeFns: (() => void)[] = [];

	constructor(
		private camera: PerspectiveCamera,
		private dom: HTMLElement,
		private hooks: CameraHooks,
	) {
		this.controls = new OrbitControls(camera, dom);
		this.controls.enableDamping = true;
		this.controls.dampingFactor = 0.08;
		this.lastInputAt = performance.now();

		dom.tabIndex = 0; // 画布可聚焦 → 键盘飞行不影响 Obsidian 其他快捷键
		this.bindPointer();
		this.bindKeys();
	}

	get target(): Vector3 {
		return this.controls.target;
	}

	private markInput(): void {
		this.lastInputAt = performance.now();
		this.cruiseAnchor = null;
		this.tween = null; // 任何输入打断飞行（停在当前位置，不跳变）
	}

	private bindPointer(): void {
		const onDown = (e: PointerEvent) => {
			this.dom.focus();
			// Google Earth 式：Ctrl/⌘ + 左键拖 = 平移（右键拖原生就是平移）
			this.controls.mouseButtons.LEFT = e.ctrlKey || e.metaKey ? MOUSE.PAN : MOUSE.ROTATE;
			this.markInput();
		};
		const onInput = () => this.markInput();
		this.dom.addEventListener('pointerdown', onDown, { capture: true });
		this.dom.addEventListener('wheel', onInput, { passive: true });
		this.dom.addEventListener('touchstart', onInput, { passive: true });
		this.disposeFns.push(() => {
			this.dom.removeEventListener('pointerdown', onDown, { capture: true });
			this.dom.removeEventListener('wheel', onInput);
			this.dom.removeEventListener('touchstart', onInput);
		});
	}

	private bindKeys(): void {
		const onKeyDown = (e: KeyboardEvent) => {
			const k = e.key.toLowerCase();
			this.shiftHeld = e.shiftKey;
			if (FLY_KEYS.has(k)) {
				this.pressed.add(k);
				this.markInput();
				e.preventDefault();
				e.stopPropagation();
			} else if (k === 'f') {
				this.hooks.onFlyToSelected();
				e.preventDefault();
			} else if (k === 'r') {
				this.hooks.onResetView();
				e.preventDefault();
			}
		};
		const onKeyUp = (e: KeyboardEvent) => {
			this.shiftHeld = e.shiftKey;
			this.pressed.delete(e.key.toLowerCase());
		};
		const onBlur = () => this.pressed.clear();
		this.dom.addEventListener('keydown', onKeyDown);
		this.dom.addEventListener('keyup', onKeyUp);
		this.dom.addEventListener('blur', onBlur);
		this.disposeFns.push(() => {
			this.dom.removeEventListener('keydown', onKeyDown);
			this.dom.removeEventListener('keyup', onKeyUp);
			this.dom.removeEventListener('blur', onBlur);
		});
	}

	/** WASD/QE：相机与轨道目标同步平移，飞完仍可正常环绕 */
	private applyFly(deltaS: number): boolean {
		if (this.pressed.size === 0) return false;
		const dist = this.camera.position.distanceTo(this.controls.target);
		const speed = Math.min(Math.max(dist * 0.8, 10), 600) * (this.shiftHeld ? 3 : 1);
		const fwd = this.camera.getWorldDirection(this.tmpDir);
		this.tmpRight.crossVectors(fwd, this.camera.up).normalize();
		const move = new Vector3();
		if (this.pressed.has('w')) move.add(fwd);
		if (this.pressed.has('s')) move.sub(fwd);
		if (this.pressed.has('d')) move.add(this.tmpRight);
		if (this.pressed.has('a')) move.sub(this.tmpRight);
		if (this.pressed.has('e')) move.y += 1;
		if (this.pressed.has('q')) move.y -= 1;
		if (move.lengthSq() < 1e-8) return false;
		move.normalize().multiplyScalar(speed * deltaS);
		this.camera.position.add(move);
		this.controls.target.add(move);
		this.lastInputAt = performance.now();
		return true;
	}

	/** 初始机位：质心外 2.2×半径、仰角 +18° */
	setInitialFraming(graphRadius: number): void {
		this.camera.position.copy(this.framingPosition(graphRadius));
		this.controls.target.set(0, 0, 0);
		this.controls.update();
	}

	private framingPosition(graphRadius: number): Vector3 {
		const d = graphRadius * 2.2;
		const elev = (18 * Math.PI) / 180;
		return new Vector3(d * Math.cos(elev), d * Math.sin(elev), d * 0.35);
	}

	/** R：平滑回总览 */
	resetView(graphRadius: number): void {
		this.startTween(this.framingPosition(graphRadius), new Vector3(0, 0, 0), 1200);
	}

	flyTo(nodePos: Vector3, nodeRadius: number, onDone?: () => void): void {
		const dist = Math.min(Math.max(nodeRadius * FLY_TO.distancePerRadius, FLY_TO.minDistance), FLY_TO.maxDistance);
		// 保持当前视角方向但偏转 15° 方位角——到达时不正对节点，邻域可见
		const dir = this.camera.position.clone().sub(nodePos);
		if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
		this.tmpSph.setFromVector3(dir);
		this.tmpSph.theta += FLY_TO.azimuthOffsetRad;
		this.tmpSph.radius = dist;
		const toPos = nodePos.clone().add(new Vector3().setFromSpherical(this.tmpSph));
		const travel = this.camera.position.distanceTo(toPos);
		const durMs = Math.min(Math.max(FLY_TO.minMs + FLY_TO.msPerWorldUnit * travel, FLY_TO.minMs), FLY_TO.maxMs);
		this.startTween(toPos, nodePos.clone(), durMs, onDone);
	}

	private startTween(toPos: Vector3, toTarget: Vector3, durMs: number, onDone?: () => void): void {
		this.tween = {
			t0: performance.now(),
			durMs,
			fromPos: this.camera.position.clone(),
			toPos,
			fromTarget: this.controls.target.clone(),
			toTarget,
		};
		if (onDone) this.tween.onDone = onDone;
	}

	/** 每帧驱动；返回当前是否处于巡航中（HUD 显示用） */
	update(now: number, deltaS: number): boolean {
		if (this.tween) {
			const tw = this.tween;
			const t = Math.min((now - tw.t0) / tw.durMs, 1);
			const k = easeInOutCubic(t);
			this.camera.position.lerpVectors(tw.fromPos, tw.toPos, k);
			this.controls.target.lerpVectors(tw.fromTarget, tw.toTarget, k);
			this.controls.update();
			if (t >= 1) {
				this.tween = null;
				tw.onDone?.();
				this.lastInputAt = now; // 到达后等满闲置时长再起巡航
			}
			return false;
		}

		const flying = this.applyFly(deltaS);

		const idleMs = now - this.lastInputAt;
		if (!flying && this.cruiseEnabled && idleMs > CRUISE.resumeDelayMs) {
			// 0→满速渐起，无顿挫
			const ramp = Math.min((idleMs - CRUISE.resumeDelayMs) / CRUISE.rampUpMs, 1);
			if (!this.cruiseAnchor) {
				this.cruiseAnchor = new Spherical().setFromVector3(
					this.tmpOffset.copy(this.camera.position).sub(this.controls.target),
				);
				this.cruiseT = 0;
			}
			this.cruiseT += deltaS * ramp;
			const t = this.cruiseT;
			const a = this.cruiseAnchor;
			const elev = ((CRUISE.elevationDeg * Math.PI) / 180) * Math.sin((2 * Math.PI * t) / CRUISE.elevationPeriodS);
			const breath = 1 + CRUISE.radiusBreath * Math.sin((2 * Math.PI * t) / CRUISE.radiusPeriodS);
			this.tmpSph.radius = a.radius * breath;
			this.tmpSph.theta = a.theta + CRUISE.angularSpeed * t;
			this.tmpSph.phi = Math.min(Math.max(a.phi + elev, 0.05), Math.PI - 0.05);
			this.camera.position.setFromSpherical(this.tmpSph).add(this.controls.target);
			this.camera.lookAt(this.controls.target);
			return true;
		}

		this.controls.update();
		return false;
	}

	dispose(): void {
		this.tween = null;
		this.pressed.clear();
		for (const fn of this.disposeFns) fn();
		this.disposeFns = [];
		this.controls.dispose();
	}
}
