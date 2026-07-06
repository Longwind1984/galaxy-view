import { CatmullRomCurve3, MOUSE, PerspectiveCamera, Spherical, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CRUISE, FLY_TO } from '../constants';

function easeInOutCubic(t: number): number {
	return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const WORLD_UP = new Vector3(0, 1, 0);
const BANK_MAX = 0.6; // 飞掠最大侧倾（弧度，~34°）
// 取景余量：相机竖直 FOV 恰好容下节点云球半径后，再乘该系数留出四周留白（>1 = 更远的全局视角）
const FRAMING_MARGIN = 1.5;
const DRAG_THRESHOLD_PX = 4; // 指针移动超过此阈值才算「拖动」→ 才打断环绕；纯点击（选点）不打断

interface Tween {
	t0: number;
	durMs: number;
	fromPos: Vector3;
	toPos: Vector3;
	fromTarget: Vector3;
	toTarget: Vector3;
	onDone?: () => void;
}

/** 样条路径运动（巡游用）：相机沿 CatmullRom 曲线走，看向切线前瞻或固定点 */
interface PathTween {
	t0: number;
	durMs: number;
	curve: CatmullRomCurve3;
	lookMode: 'tangent' | 'fixed';
	fixedTarget: Vector3;
	lookAhead: number;
	bank: number;
	onDone?: () => void;
}

export interface FlyPathOptions {
	lookMode?: 'tangent' | 'fixed';
	target?: Vector3;
	lookAhead?: number;
	/** 0=不侧倾；>0 飞掠随转弯压路侧倾（0..1） */
	bank?: number;
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
	/** 巡航角速度倍率（面板「巡航速度」滑杆） */
	cruiseSpeed = 1;
	/** 巡游进行中：即便用户关了巡航，也强制环绕（每腿飞达后有明显运动） */
	tourActive = false;
	/** 初始/回总览取景仰角（度）：盘类预设俯视看臂（~50°），默认 18° */
	private framingElevDeg = 18;

	private controls: OrbitControls;
	private tween: Tween | null = null;
	private path: PathTween | null = null;
	private pathPos = new Vector3();
	private pathTan = new Vector3();
	private pathTan2 = new Vector3();
	private pathRight = new Vector3();
	private pathUp = new Vector3();
	private lastInputAt = 0;
	private cruiseAnchor: Spherical | null = null;
	private cruiseT = 0;
	private cruiseDir = 1;
	private pendingDensityDir: Vector3 | null = null;
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
		this.path = null; // 任何输入也打断巡游路径
	}

	/** 是否正在跑一段巡游路径（TourDirector 据此决定何时发下一腿） */
	get onPath(): boolean {
		return this.path !== null;
	}

	/**
	 * 沿样条路径飞行（巡游基元）。waypoints ≥2；lookMode='tangent' 看向前方（飞掠），
	 * 'fixed' 看向固定点。零每帧分配：曲线一次性构建，每帧只采样进预分配 Vector3。
	 */
	flyPath(waypoints: Vector3[], durMs: number, opts: FlyPathOptions = {}): void {
		// 清洗控制点：剔除非有限点（NaN 位置）与相邻重合点。二者都会让 CatmullRom 的
		// 弧长映射产出 NaN → getPoint 索引到 undefined 控制点 → 在 update 里抛错并冻结整个渲染循环。
		const pts: Vector3[] = [];
		for (const w of waypoints) {
			if (!Number.isFinite(w.x) || !Number.isFinite(w.y) || !Number.isFinite(w.z)) continue;
			const last = pts[pts.length - 1];
			if (last && last.distanceToSquared(w) < 1e-4) continue;
			pts.push(w.clone());
		}
		if (pts.length < 2) return;
		// 用 uniform（'catmullrom'）而非默认 'centripetal'：后者按点距开方，控制点异常时更脆。
		const curve = new CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
		this.path = {
			t0: performance.now(),
			durMs: Math.max(1, durMs),
			curve,
			lookMode: opts.lookMode ?? 'tangent',
			fixedTarget: (opts.target ?? new Vector3()).clone(),
			lookAhead: opts.lookAhead ?? 60,
			bank: opts.bank ?? 0,
		};
		if (opts.onDone) this.path.onDone = opts.onDone;
		this.tween = null;
		this.cruiseAnchor = null;
	}

	/** 外部（如渲染循环兜底）安全清除进行中的路径/补间，恢复水平地平线；不触发 onDone。 */
	cancelMotion(): void {
		this.path = null;
		this.tween = null;
		this.camera.up.set(0, 1, 0);
	}

	private bindPointer(): void {
		// 只有「真正拖动 / 缩放」才打断环绕——纯点击（选点）不该停巡航（旧版按下即停 + 10s 才恢复 = 太容易打断）。
		let downX = 0;
		let downY = 0;
		let dragging = false;
		const onDown = (e: PointerEvent) => {
			this.dom.focus();
			// Google Earth 式平移：⌘/Shift/Ctrl + 左键拖（macOS 的 Ctrl+点击被系统征用为右键，
			// 所以 Mac 上主用 ⌘ 或 Shift；右键拖原生就是平移）
			this.controls.mouseButtons.LEFT =
				e.metaKey || e.shiftKey || e.ctrlKey ? MOUSE.PAN : MOUSE.ROTATE;
			downX = e.clientX;
			downY = e.clientY;
			dragging = false;
			// 注意：此处不 markInput——等移动超阈值才算拖动
		};
		const onMove = (e: PointerEvent) => {
			if (dragging || e.buttons === 0) return; // 未按住不算拖动
			if (Math.hypot(e.clientX - downX, e.clientY - downY) > DRAG_THRESHOLD_PX) {
				dragging = true;
				this.markInput(); // 拖动确立 → 接管相机、停环绕（OrbitControls 每帧读当前机位，无跳变）
			}
		};
		const onWheel = () => this.markInput(); // 缩放是明确操作，直接打断
		const onTouchMove = () => this.markInput(); // 触摸：拖动/捏合才打断（点按不触发 touchmove）
		this.dom.addEventListener('pointerdown', onDown, { capture: true });
		this.dom.addEventListener('pointermove', onMove);
		this.dom.addEventListener('wheel', onWheel, { passive: true });
		this.dom.addEventListener('touchmove', onTouchMove, { passive: true });
		this.disposeFns.push(() => {
			this.dom.removeEventListener('pointerdown', onDown, { capture: true });
			this.dom.removeEventListener('pointermove', onMove);
			this.dom.removeEventListener('wheel', onWheel);
			this.dom.removeEventListener('touchmove', onTouchMove);
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

	/** 初始机位：绕节点云实际质心 center、按实际半径 fitRadius 取全局视角 */
	setInitialFraming(center: Vector3, fitRadius: number): void {
		this.camera.position.copy(this.framingPosition(center, fitRadius));
		this.controls.target.copy(center);
		this.controls.update();
	}

	/** 盘类预设俯视看臂：设更高仰角（applyStylePreset / 启动时按预设设置） */
	setFramingElev(deg: number): void {
		this.framingElevDeg = deg;
	}

	/**
	 * 取景机位：绕质心 center，按相机竖直 FOV 恰好容下半径 fitRadius 的球（× 余量）算距离——
	 * 真正的全局视角，随不同 vault 规模/预设铺展自适应（取代旧的「种子半径 ×3」固定倍率+盯原点）。
	 */
	private framingPosition(center: Vector3, fitRadius: number): Vector3 {
		const vfov = (this.camera.fov * Math.PI) / 180;
		const dist = (Math.max(fitRadius, 1) / Math.sin(vfov / 2)) * FRAMING_MARGIN;
		const elev = (this.framingElevDeg * Math.PI) / 180;
		// 视线方向：仰角 + 轻微 z 偏移取 3/4 视角看出深度；单位化后乘距离，再落到质心上
		return new Vector3(Math.cos(elev), Math.sin(elev), 0.35).normalize().multiplyScalar(dist).add(center);
	}

	/** R/回中心：平滑回总览（绕质心 center，居中不偏） */
	resetView(center: Vector3, fitRadius: number, onDone?: () => void): void {
		this.startTween(this.framingPosition(center, fitRadius), center.clone(), 1200, onDone);
	}

	/**
	 * 飞达节点后立即开始环绕（不等闲置 10s），且旋转方向优先扫过邻居密集的一侧
	 * （G2 反馈：5 条链接 4 条朝南 → 先划过南方）。
	 */
	beginFocusOrbit(densityDir: Vector3 | null): void {
		this.pendingDensityDir = densityDir;
		this.cruiseAnchor = null;
		this.lastInputAt = performance.now() - CRUISE.resumeDelayMs - 1;
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
		if (this.path) {
			const pt = this.path;
			const t = Math.min((now - pt.t0) / pt.durMs, 1);
			const u = easeInOutCubic(t);
			// 曲线采样兜底：即便清洗后仍触发 three.js 边界异常，也绝不让它冒泡冻结整个渲染循环——
			// 就地放弃这段路径、把地平线交回 OrbitControls。
			try {
				pt.curve.getPointAt(u, this.pathPos); // 弧长参数化 → 匀速
			} catch {
				this.camera.up.set(0, 1, 0);
				this.path = null;
				pt.onDone?.();
				this.lastInputAt = now;
				return false;
			}
			if (!Number.isFinite(this.pathPos.x) || !Number.isFinite(this.pathPos.y) || !Number.isFinite(this.pathPos.z)) {
				this.camera.up.set(0, 1, 0);
				this.path = null;
				pt.onDone?.();
				this.lastInputAt = now;
				return false;
			}
			this.camera.position.copy(this.pathPos);
			if (pt.lookMode === 'tangent') {
				pt.curve.getTangentAt(u, this.pathTan);
				this.controls.target.copy(this.pathPos).addScaledVector(this.pathTan, pt.lookAhead);
				// 压路侧倾：按前方切线的水平转向量把 up 绕视线方向 roll 进弯里
				if (pt.bank > 0 && t < 0.999) {
					pt.curve.getTangentAt(Math.min(u + 0.02, 1), this.pathTan2);
					this.pathRight.crossVectors(this.pathTan, WORLD_UP).normalize();
					const turn = this.pathTan2.dot(this.pathRight); // >0 右转
					const roll = Math.max(Math.min(-turn * pt.bank * 6, BANK_MAX), -BANK_MAX);
					this.pathUp.copy(this.pathTan).normalize(); // 视线方向作 roll 轴（复用 scratch）
					this.camera.up.copy(WORLD_UP).applyAxisAngle(this.pathUp, roll).normalize();
				} else {
					this.camera.up.set(0, 1, 0);
				}
			} else {
				this.controls.target.copy(pt.fixedTarget);
				this.camera.up.set(0, 1, 0);
			}
			this.controls.update();
			if (t >= 1) {
				this.camera.up.set(0, 1, 0); // 交回 OrbitControls 前重置地平线
				this.path = null;
				pt.onDone?.();
				this.lastInputAt = now; // 到达后等满闲置时长再起巡航
			}
			return false;
		}

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
		if (!flying && (this.cruiseEnabled || this.tourActive) && idleMs > CRUISE.resumeDelayMs) {
			// 0→满速渐起，无顿挫
			const ramp = Math.min((idleMs - CRUISE.resumeDelayMs) / CRUISE.rampUpMs, 1);
			if (!this.cruiseAnchor) {
				this.cruiseAnchor = new Spherical().setFromVector3(
					this.tmpOffset.copy(this.camera.position).sub(this.controls.target),
				);
				this.cruiseT = 0;
				this.cruiseDir = 1;
				// 邻居密集方向 → 选择能更早扫过该侧的旋转方向
				if (this.pendingDensityDir && this.pendingDensityDir.lengthSq() > 1e-6) {
					const densityTheta = new Spherical().setFromVector3(this.pendingDensityDir).theta;
					let delta = densityTheta - this.cruiseAnchor.theta;
					while (delta > Math.PI) delta -= 2 * Math.PI;
					while (delta < -Math.PI) delta += 2 * Math.PI;
					this.cruiseDir = delta >= 0 ? 1 : -1;
				}
				this.pendingDensityDir = null;
			}
			this.cruiseT += deltaS * ramp;
			const t = this.cruiseT;
			const a = this.cruiseAnchor;
			const elev = ((CRUISE.elevationDeg * Math.PI) / 180) * Math.sin((2 * Math.PI * t) / CRUISE.elevationPeriodS);
			const breath = 1 + CRUISE.radiusBreath * Math.sin((2 * Math.PI * t) / CRUISE.radiusPeriodS);
			this.tmpSph.radius = a.radius * breath;
			this.tmpSph.theta = a.theta + this.cruiseDir * CRUISE.angularSpeed * this.cruiseSpeed * t;
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
