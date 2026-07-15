import { describe, expect, it } from 'vitest';
import { assignFolderHues, folderColor, folderCoveredByGroups } from '../src/render/palette';

// 注意：three 的 setHSL 在线性空间算、getHexString 转回 sRGB，故色值不是朴素 HSL→RGB 的结果
const hex = (folder: string) => `#${folderColor(folder, false).getHexString()}`;

/**
 * 回归用例来自 Rick 的真实库（3,224 篇 / 14 个顶层文件夹 / 9 个从 2D 图谱导入的配色组）。
 * 修复前：回退色相 = HUES[hash32(folder) % 9]，与文件夹大小无关且乱序 →
 * 99Archive(545) / 90故纸堆(86) / Readwise(68) 撞成同一个蓝，共 1184 篇＝全库 37% 读不出区别。
 */
const REAL_FOLDERS = [
	{ folder: '04AI', count: 607 },
	{ folder: '99Archive', count: 545 },
	{ folder: 'Cubox', count: 505 },
	{ folder: '80随记', count: 392 },
	{ folder: '02工作', count: 284 },
	{ folder: '01学习', count: 197 },
	{ folder: '05读书', count: 133 },
	{ folder: '30认真活着', count: 113 },
	{ folder: '60流浪', count: 93 },
	{ folder: '06人', count: 92 },
	{ folder: '90故纸堆', count: 86 },
	{ folder: 'Readwise', count: 68 },
	{ folder: '03产品', count: 58 },
	{ folder: '00Meta', count: 51 },
];
const REAL_GROUPS = [
	{ query: 'path:01学习', color: '#46d4dc' },
	{ query: 'path:02工作', color: '#ffc35c' },
	{ query: 'path:03产品', color: '#d05a32' },
	{ query: 'path:04AI', color: '#7fd0a0' },
	{ query: 'path:05读书', color: '#e8d9a0' },
	{ query: 'path:06人', color: '#5a9bd8' },
	{ query: 'path:30认真活着', color: '#d87fa8' },
	{ query: 'path:Cubox', color: '#9a7fe0' },
	{ query: 'path:00Meta', color: '#cfd8e8' },
];
const ranked = REAL_FOLDERS.map((f) => f.folder);
const covered = (f: string) => folderCoveredByGroups(f, REAL_GROUPS);

describe('folderCoveredByGroups', () => {
	it('认出被 path: 组覆盖的文件夹', () => {
		expect(covered('04AI')).toBe(true);
		expect(covered('Cubox')).toBe(true);
	});

	it('没有对应组的文件夹＝未覆盖（这 5 个正是要发回退色相的）', () => {
		for (const f of ['99Archive', '80随记', '60流浪', '90故纸堆', 'Readwise']) {
			expect(covered(f), f).toBe(false);
		}
	});
});

describe('assignFolderHues（撞色修复）', () => {
	it('Rick 真实库：5 个未覆盖文件夹拿到 5 个互不相同的颜色', () => {
		assignFolderHues(ranked, covered);
		const fallback = ['99Archive', '80随记', '60流浪', '90故纸堆', 'Readwise'];
		const colors = fallback.map(hex);
		expect(new Set(colors).size).toBe(fallback.length);
	});

	it('修复前撞成同一个蓝的三个文件夹，现在两两不同', () => {
		assignFolderHues(ranked, covered);
		expect(hex('99Archive')).not.toBe(hex('90故纸堆'));
		expect(hex('90故纸堆')).not.toBe(hex('Readwise'));
		expect(hex('99Archive')).not.toBe(hex('Readwise'));
	});

	it('被配色组覆盖的文件夹不占色相槽——否则回退的又会被挤到撞色', () => {
		assignFolderHues(ranked, covered);
		// 未覆盖的按排名依次拿 HUES[0..4] = 0/40/80/120/160
		expect(hex('99Archive')).toBe('#eca2a2'); // 排名 1（未覆盖里最大）→ hue 0
		expect(hex('80随记')).toBe('#ecd7a2'); // → hue 40
	});

	it('文件夹数 ≤ 9 时全部互不撞色', () => {
		const nine = Array.from({ length: 9 }, (_, i) => `F${i}`);
		assignFolderHues(nine, () => false);
		expect(new Set(nine.map(hex)).size).toBe(9);
	});

	it('超过 9 个待发文件夹时回收色相，但撞的是最小的几个而非最大的', () => {
		const twelve = Array.from({ length: 12 }, (_, i) => `F${i}`); // 已按大小降序
		assignFolderHues(twelve, () => false);
		const top9 = twelve.slice(0, 9).map(hex);
		expect(new Set(top9).size).toBe(9); // 前 9 大保证不撞
		expect(hex('F9')).toBe(hex('F0')); // 第 10 个开始回收色轮
	});

	it('根目录（空串）不占色相槽', () => {
		assignFolderHues(['', 'A', 'B'], () => false);
		expect(hex('A')).toBe('#eca2a2'); // A 仍拿 hue 0，没被空串挤掉
	});

	it('重发色相会清掉旧缓存，不留上一次的颜色', () => {
		assignFolderHues(['X', 'Y'], () => false);
		const before = hex('Y'); // hue 40
		assignFolderHues(['Y', 'X'], () => false); // Y 升到第一
		expect(hex('Y')).not.toBe(before);
		expect(hex('Y')).toBe('#eca2a2'); // hue 0
	});
});
