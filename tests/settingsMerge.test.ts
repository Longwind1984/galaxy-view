import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings } from '../src/settings';

describe('mergeSettings v0.4 兼容（曲线 + 深空背景）', () => {
	it('空存档 → 新默认（银河预设含曲线与背景层）', () => {
		const m = mergeSettings({});
		expect(m.look.linkCurve).toBe(DEFAULT_SETTINGS.look.linkCurve);
		expect(m.space).toEqual(DEFAULT_SETTINGS.space);
	});

	it('v0.4 前的存档：look 缺 linkCurve / 无 space → 补默认值', () => {
		const m = mergeSettings({ look: { nodeSize: 1.5, linkOpacity: 0.2, twinkle: 0, sizeBy: 'uniform' } });
		expect(m.look.nodeSize).toBe(1.5);
		expect(m.look.linkCurve).toBe(DEFAULT_SETTINGS.look.linkCurve);
		expect(m.space).toEqual(DEFAULT_SETTINGS.space);
	});

	it('老自定义预设缺新字段 → 按 0 补齐（保持存档当时的直线/无背景观感）', () => {
		const m = mergeSettings({
			customPresets: [
				{
					id: 'custom-old',
					name: '我的 1',
					starfield: true,
					theme: 'hubble',
					bloom: { strength: 0.3, radius: 0.3, threshold: 0.2 },
					physics: { repel: 100, linkDistance: 50, linkStrength: 1, centerPull: 0.05, flatten: 0, coreGravity: 0, spiral: 0 },
					look: { nodeSize: 1, linkOpacity: 0.1, twinkle: 0.5, sizeBy: 'degree' },
				},
			],
		});
		const p = m.customPresets[0]!;
		expect(p.look.linkCurve).toBe(0);
		expect(p.space).toEqual({ nebula: 0, fieldStars: 0, clusterClouds: 0 });
		expect(p.look.nodeSize).toBe(1); // 原字段不动
	});

	it('带新字段的存档原样保留', () => {
		const m = mergeSettings({ space: { nebula: 0.9, fieldStars: 0, clusterClouds: 0.1 }, look: { linkCurve: 0.7 } });
		expect(m.space).toEqual({ nebula: 0.9, fieldStars: 0, clusterClouds: 0.1 });
		expect(m.look.linkCurve).toBe(0.7);
	});

	// 改名后的名字必须挺过一次「保存→重启」往返（loadData → mergeSettings 是重启读回路径）
	it('自定义预设改名后 mergeSettings 保留 name/nameEn（重启不丢名）', () => {
		const saved = {
			customPresets: [
				{
					id: 'custom-x',
					name: '我的深空调色',
					nameEn: '我的深空调色',
					starfield: true,
					theme: 'hubble',
					space: { nebula: 0.5, fieldStars: 0.3, clusterClouds: 0.2 },
					bloom: { strength: 0.3, radius: 0.3, threshold: 0.2 },
					physics: { repel: 100, linkDistance: 50, linkStrength: 1, centerPull: 0.05, flatten: 0, coreGravity: 0, spiral: 0 },
					look: { nodeSize: 1, linkOpacity: 0.1, linkCurve: 0.4, twinkle: 0.5, sizeBy: 'degree' },
				},
			],
		};
		// 序列化往返模拟磁盘写入/读回
		const roundTrip = mergeSettings(JSON.parse(JSON.stringify(saved)));
		expect(roundTrip.customPresets[0]!.name).toBe('我的深空调色');
		expect(roundTrip.customPresets[0]!.nameEn).toBe('我的深空调色');
	});
});

describe('mergeSettings v0.5 兼容（笔记过滤 #11）', () => {
	it('0.4.x 存档无 filterQuery → 空串（不过滤），老用户不会开图就少笔记', () => {
		const m = mergeSettings({ showTags: true, showOrphans: false });
		expect(m.filterQuery).toBe('');
		expect(m.showTags).toBe(true); // 既有字段不受影响
		expect(m.showOrphans).toBe(false);
	});

	it('存档里的 filterQuery 原样保留（含引号与取反）', () => {
		const m = mergeSettings({ filterQuery: '-file:"Index" path:Daily' });
		expect(m.filterQuery).toBe('-file:"Index" path:Daily');
	});

	it('filterQuery 类型不对 → 回落默认而不是把非串塞进去', () => {
		expect(mergeSettings({ filterQuery: 42 }).filterQuery).toBe('');
		expect(mergeSettings({ filterQuery: null }).filterQuery).toBe('');
	});
});

describe('mergeSettings adaptive labels', () => {
	it('keeps the feature opt-in for existing vaults', () => {
		expect(mergeSettings({}).adaptiveLabels).toBe(false);
		expect(mergeSettings({ adaptiveLabels: true }).adaptiveLabels).toBe(true);
		expect(mergeSettings({ adaptiveLabels: 'yes' }).adaptiveLabels).toBe(false);
	});
});
