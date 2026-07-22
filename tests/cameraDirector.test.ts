import { describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';

vi.mock('three/examples/jsm/controls/OrbitControls.js', async () => {
	const { Vector3: MockVector3 } = await import('three');
	return {
		OrbitControls: class {
			target = new MockVector3();
			enableDamping = false;
			dampingFactor = 0;
			mouseButtons = { LEFT: 0 };
			update(): void {}
			dispose(): void {}
		},
	};
});

import { CameraDirector } from '../src/interactions/CameraDirector';

function makeDom(): HTMLElement {
	return {
		tabIndex: -1,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		focus: vi.fn(),
	} as unknown as HTMLElement;
}

function makeDirector(): { camera: PerspectiveCamera; director: CameraDirector } {
	const camera = new PerspectiveCamera(50, 1, 0.1, 10_000);
	camera.position.set(10, 0, 0);
	const director = new CameraDirector(camera, makeDom(), {
		onFlyToSelected: vi.fn(),
		onResetView: vi.fn(),
	});
	director.cruiseEnabled = false;
	return { camera, director };
}

describe('CameraDirector cross-window clock handling', () => {
	it('reset tween ignores absolute rAF clock offsets and clamps negative frame progress', () => {
		const { camera, director } = makeDirector();
		const start = camera.position.clone();
		const done = vi.fn();
		director.resetView(new Vector3(0, 0, 0), 20, done);

		// 新窗口 timestamp 可比创建 tween 的窗口小很多；负帧间隔不得让相机反向外插。
		director.update(-1_000_000_000, -0.25);
		expect(camera.position.toArray()).toEqual(start.toArray());
		expect(done).not.toHaveBeenCalled();

		// 即使绝对 timestamp 在两个时钟域间大幅跳变，动画仍只按有效帧间隔前进。
		for (let i = 0; i < 12; i++) {
			director.update(i % 2 === 0 ? -1_000_000_000 + i : 1_000_000_000 + i, 0.1);
		}
		expect(done).toHaveBeenCalledTimes(1);
		expect(camera.position.toArray().every(Number.isFinite)).toBe(true);
		expect(camera.position.length()).toBeLessThan(100);
	});

	it('path tween clamps negative progress and completes across timestamp origins', () => {
		const { camera, director } = makeDirector();
		const done = vi.fn();
		director.flyPath([new Vector3(0, 0, 0), new Vector3(100, 0, 0)], 1000, {
			lookMode: 'fixed',
			target: new Vector3(50, 0, 0),
			onDone: done,
		});

		director.update(-500_000, -1);
		expect(camera.position.toArray()).toEqual([0, 0, 0]);
		expect(done).not.toHaveBeenCalled();

		for (let i = 0; i < 10; i++) {
			director.update(i % 2 === 0 ? -500_000 + i : 500_000 + i, 0.1);
		}
		expect(done).toHaveBeenCalledTimes(1);
		expect(camera.position.toArray()).toEqual([100, 0, 0]);
	});

	it('uses uncapped animation time while keeping manual motion on the capped delta', () => {
		const { camera, director } = makeDirector();
		const done = vi.fn();
		director.resetView(new Vector3(0, 0, 0), 20, done);

		// 1.2s tween 必须按 1.2s 实际帧时间完成；第三参仍可把 WASD/物理移动限制到 100ms。
		director.update(1_200, 1.2, 0.1);
		expect(done).toHaveBeenCalledTimes(1);
		expect(camera.position.toArray().every(Number.isFinite)).toBe(true);
	});
});
