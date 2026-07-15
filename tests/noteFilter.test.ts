import { describe, expect, it } from 'vitest';
import { applyFilter, folderStats, matchesFilter, parseFilterQuery } from '../src/data/noteFilter';

const rec = (path: string) => ({ path, basename: path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '') });

const VAULT = [
	rec('Daily/2026-07-15.md'),
	rec('Daily/Index.md'),
	rec('Projects/Galaxy View.md'),
	rec('Projects/Index.md'),
	rec('Archive/Old Index Notes.md'),
	rec('star wars notes.md'),
];

const run = (q: string) => applyFilter(VAULT, { hiddenFolders: new Set<string>(), query: parseFilterQuery(q) }).map((f) => f.path);
const runHidden = (folders: string[]) => applyFilter(VAULT, { hiddenFolders: new Set(folders), query: [] }).map((f) => f.path);

describe('parseFilterQuery', () => {
	it('treats a bare word as a path match', () => {
		expect(parseFilterQuery('Index')).toEqual([{ field: 'path', value: 'index', negate: false }]);
	});

	it('parses field prefixes and negation', () => {
		expect(parseFilterQuery('-file:Index')).toEqual([{ field: 'file', value: 'index', negate: true }]);
		expect(parseFilterQuery('path:Daily')).toEqual([{ field: 'path', value: 'daily', negate: false }]);
	});

	it('keeps spaces inside quotes as one term', () => {
		expect(parseFilterQuery('"star wars"')).toEqual([{ field: 'path', value: 'star wars', negate: false }]);
		expect(parseFilterQuery('-file:"Old Index"')).toEqual([{ field: 'file', value: 'old index', negate: true }]);
	});

	it('splits multiple terms on whitespace', () => {
		expect(parseFilterQuery('  file:a   -path:b  ')).toEqual([
			{ field: 'file', value: 'a', negate: false },
			{ field: 'path', value: 'b', negate: true },
		]);
	});

	it('degrades unknown prefixes to a literal bare term rather than erroring', () => {
		// 过滤框是边打边用的，中间态必然不合法——不能抛错
		expect(parseFilterQuery('content:foo')).toEqual([{ field: 'path', value: 'content:foo', negate: false }]);
	});

	it('drops terms that carry no value', () => {
		expect(parseFilterQuery('-')).toEqual([]);
		expect(parseFilterQuery('file:')).toEqual([]);
		expect(parseFilterQuery('   ')).toEqual([]);
	});

	it('reads an unclosed quote to the end instead of dropping the term', () => {
		expect(parseFilterQuery('"star wars')).toEqual([{ field: 'path', value: 'star wars', negate: false }]);
	});
});

describe('applyFilter', () => {
	it('returns the array untouched when nothing is filtered', () => {
		expect(applyFilter(VAULT, { hiddenFolders: new Set<string>(), query: [] })).toBe(VAULT); // 同一引用 = 没有无谓复制
	});

	it('includes only matches for a positive filename term (issue #11 example)', () => {
		expect(run('file:"Index"')).toEqual(['Daily/Index.md', 'Projects/Index.md', 'Archive/Old Index Notes.md']);
	});

	it('excludes matches for a negative filename term (issue #11 example)', () => {
		expect(run('-file:"Index"')).toEqual(['Daily/2026-07-15.md', 'Projects/Galaxy View.md', 'star wars notes.md']);
	});

	it('matches folder names via a bare term, since path includes them', () => {
		expect(run('Daily')).toEqual(['Daily/2026-07-15.md', 'Daily/Index.md']);
	});

	it('is case-insensitive', () => {
		expect(run('file:index')).toEqual(run('file:INDEX'));
	});

	it('ANDs multiple terms', () => {
		expect(run('Index -path:Daily')).toEqual(['Projects/Index.md', 'Archive/Old Index Notes.md']);
	});

	it('distinguishes file: from path: (folder name must not satisfy file:)', () => {
		expect(run('path:Projects')).toEqual(['Projects/Galaxy View.md', 'Projects/Index.md']);
		expect(run('file:Projects')).toEqual([]);
	});

	it('matches a quoted phrase containing spaces', () => {
		expect(run('"star wars"')).toEqual(['star wars notes.md']);
	});

	it('can exclude everything without throwing', () => {
		expect(run('file:Index -file:Index')).toEqual([]);
	});
});

describe('matchesFilter', () => {
	it('passes any record when the query is empty', () => {
		expect(matchesFilter(rec('anything.md'), [])).toBe(true);
	});
});

describe('folderStats（图例数据）', () => {
	it('按笔记数降序，根目录笔记归入 ""（同数时按名字，空串在前）', () => {
		expect(folderStats(VAULT)).toEqual([
			{ folder: 'Daily', count: 2 },
			{ folder: 'Projects', count: 2 },
			{ folder: '', count: 1 },
			{ folder: 'Archive', count: 1 },
		]);
	});

	it('数量相同时按名字定序——图例顺序必须稳定，否则每次重建 chip 会跳', () => {
		const a = folderStats(VAULT).map((f) => f.folder);
		const b = folderStats([...VAULT].reverse()).map((f) => f.folder);
		expect(a).toEqual(b);
	});
});

describe('文件夹显隐（图例点击）', () => {
	it('点灭一个文件夹 → 它的笔记全部消失', () => {
		expect(runHidden(['Daily'])).toEqual([
			'Projects/Galaxy View.md',
			'Projects/Index.md',
			'Archive/Old Index Notes.md',
			'star wars notes.md',
		]);
	});

	it('「只看 Projects」= 点灭其余全部', () => {
		expect(runHidden(['Daily', 'Archive', ''])).toEqual(['Projects/Galaxy View.md', 'Projects/Index.md']);
	});

	it('根目录笔记可单独点灭（键是空串，不能被当成 falsy 忽略）', () => {
		expect(runHidden([''])).not.toContain('star wars notes.md');
		expect(runHidden([''])).toHaveLength(5);
	});

	it('图例与文本框是 AND：Projects 里排除 Index', () => {
		const out = applyFilter(VAULT, { hiddenFolders: new Set(['Daily', 'Archive', '']), query: parseFilterQuery('-file:Index') });
		expect(out.map((f) => f.path)).toEqual(['Projects/Galaxy View.md']);
	});
});
