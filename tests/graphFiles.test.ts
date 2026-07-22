import { describe, expect, it } from 'vitest';
import { isMarkdownFile, selectGraphFiles } from '../src/data/graphFiles';

describe('selectGraphFiles', () => {
	it('只选择 Markdown 与 Canvas，并保留输入顺序和原对象', () => {
		const files = [
			{ path: 'a.md', extension: 'md' },
			{ path: 'board.canvas', extension: 'canvas' },
			{ path: 'image.png', extension: 'png' },
			{ path: 'data.json', extension: 'json' },
		];

		expect(selectGraphFiles(files)).toEqual([files[0], files[1]]);
	});

	it('扩展名不区分大小写，其他附件仍排除', () => {
		const files = [
			{ path: 'UPPER.MD', extension: 'MD' },
			{ path: 'Board.CANVAS', extension: 'CANVAS' },
			{ path: 'fake.canvas.json', extension: 'JSON' },
			{ path: 'no-extension', extension: '' },
		];

		expect(selectGraphFiles(files).map((file) => file.path)).toEqual(['UPPER.MD', 'Board.CANVAS']);
	});
});

describe('isMarkdownFile', () => {
	it('Canvas 不进入 Markdown 标签读取路径', () => {
		expect(isMarkdownFile({ extension: 'md' })).toBe(true);
		expect(isMarkdownFile({ extension: 'MD' })).toBe(true);
		expect(isMarkdownFile({ extension: 'canvas' })).toBe(false);
	});
});
