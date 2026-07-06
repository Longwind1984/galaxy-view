import { describe, expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import { TourDirector } from '../src/tour/TourDirector';
import type { TourHooks } from '../src/tour/TourDirector';

function mockHooks(n = 10): TourHooks & { selectNode: ReturnType<typeof vi.fn>; flyPath: ReturnType<typeof vi.fn>; recenter: ReturnType<typeof vi.fn>; onStateChange: ReturnType<typeof vi.fn> } {
	return {
		nodeCount: () => n,
		degreeOf: (i) => i,
		nodePosition: (i, out: Vector3) => out.set(i, 0, 0),
		graphRadius: () => 100,
		selectNode: vi.fn(),
		clearSelection: vi.fn(),
		recenter: vi.fn(),
		flyPath: vi.fn(),
		beginIdleOrbit: vi.fn(),
		onPath: () => false,
		onStateChange: vi.fn(),
	};
}

describe('TourDirector state machine', () => {
	it('漫游：startWander 后首个 tick 调用 selectNode(fly=true)', () => {
		const h = mockHooks();
		const td = new TourDirector(h);
		td.startWander(1);
		expect(h.onStateChange).toHaveBeenCalledWith(true);
		td.tick(1000);
		expect(h.selectNode).toHaveBeenCalledTimes(1);
		expect(h.selectNode.mock.calls[0]?.[1]).toBe(true);
	});

	it('漫游：停留期内不重复跳，过了停留再跳', () => {
		const h = mockHooks();
		const td = new TourDirector(h);
		td.startWander(1);
		td.tick(1000);
		td.tick(1100); // 停留内
		expect(h.selectNode).toHaveBeenCalledTimes(1);
		td.tick(1000 + 6000); // 过停留
		expect(h.selectNode).toHaveBeenCalledTimes(2);
	});

	it('漫游：每第 4 拍插一段飞掠（flyPath），其余拍是回顾跳', () => {
		const h = mockHooks();
		const td = new TourDirector(h);
		td.startWander(1);
		td.tick(0); // 拍1 → 回顾
		td.tick(6000); // 拍2 → 回顾
		td.tick(12000); // 拍3 → 回顾
		td.tick(18000); // 拍4 → 飞掠
		expect(h.selectNode).toHaveBeenCalledTimes(3);
		expect(h.flyPath).toHaveBeenCalledTimes(1);
	});

	it('连接两篇：startGuided 沿路径逐节点走完 → 回总览', () => {
		const h = mockHooks();
		const td = new TourDirector(h);
		td.startGuided([0, 1, 2], 1);
		expect(h.onStateChange).toHaveBeenCalledWith(true);
		td.tick(0);
		td.tick(6000);
		td.tick(12000);
		expect(h.selectNode).toHaveBeenCalledTimes(3);
		td.tick(18000); // 队列走完
		expect(h.recenter).toHaveBeenCalled();
	});

	it('连接两篇：路径不足两点则不启动', () => {
		const h = mockHooks();
		const td = new TourDirector(h);
		td.startGuided([0], 1);
		expect(td.isRunning).toBe(false);
		td.tick(1000);
		expect(h.selectNode).not.toHaveBeenCalled();
	});

	it('未 start 时 tick 不动作', () => {
		const h = mockHooks();
		new TourDirector(h).tick(1000);
		expect(h.selectNode).not.toHaveBeenCalled();
	});
});
