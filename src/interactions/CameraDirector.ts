import { PerspectiveCamera, Spherical, Vector3 } from 'three';
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

/**
 * 镜头导演：OrbitControls 用户输入 + 飞行 tween + 闲置巡航。
 * 巡航用两个不可通约周期（90s 仰角 / 60s 半径）→ 轨迹永不复现，「飞船」而非「转盘」。
 */
export class CameraDirector {
	cruiseEnabled = true;

	private controls: OrbitControls;
	private tween: Tween | null = null;
	private lastInputAt = 0;
	private cruiseAnchor: Spherical | null = null;
	private cruiseT = 0;
	private tmpOffset = new Vector3();
	private tmpSph = new Spherical();
	private disposeFns: (() => void)[] = [];

	constructor(
		private camera: PerspectiveCamera,
		dom: HTMLElement,
	) {
		this.controls = new OrbitControls(camera, dom);
		this.controls.enableDamping = true;
		this.controls.dampingFactor = 0.08;
		this.lastInputAt = performance.now();

		const onInput = () => {
			this.lastInputAt = performance.now();
			this.cruiseAnchor = null;
			if (this.tween) this.tween = null; // 任何输入打断飞行（停在当前位置，不跳变）
		};
		for (const ev of ['pointerdown', 'wheel', 'touchstart'] as const) {
			dom.addEventListener(ev, onInput, { passive: true });
			this.disposeFns.push(() => dom.removeEventListener(ev, onInput));
		}
	}

	get target(): Vector3 {
		return this.controls.target;
	}

	/** 初始机位：质心外 2.2×半径、仰角 +18°（M2 换成完整开场镜头） */
	setInitialFraming(graphRadius: number): void {
		const d = graphRadius * 2.2;
		const elev = (18 * Math.PI) / 180;
		this.camera.position.set(d * Math.cos(elev), d * Math.sin(elev), d * 0.35);
		this.controls.target.set(0, 0, 0);
		this.controls.update();
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
		this.tween = {
			t0: performance.now(),
			durMs,
			fromPos: this.camera.position.clone(),
			toPos,
			fromTarget: this.controls.target.clone(),
			toTarget: nodePos.clone(),
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

		const idleMs = now - this.lastInputAt;
		if (this.cruiseEnabled && idleMs > CRUISE.resumeDelayMs) {
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
		for (const fn of this.disposeFns) fn();
		this.disposeFns = [];
		this.controls.dispose();
	}
}
