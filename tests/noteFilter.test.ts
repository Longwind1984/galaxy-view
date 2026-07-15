import { describe, expect, it } from 'vitest';
import { filterFiles, matchesFilter, parseFilterQuery } from '../src/data/noteFilter';

const rec = (path: string) => ({ path, basename: path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '') });

const VAULT = [
	rec('Daily/2026-07-15.md'),
	rec('Daily/Index.md'),
	rec('Projects/Galaxy View.md'),
	rec('Projects/Index.md'),
	rec('Archive/Old Index Notes.md'),
	rec('star wars notes.md'),
];

const run = (q: string) => filterFiles(VAULT, parseFilterQuery(q)).map((f) => f.path);

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

describe('filterFiles', () => {
	it('returns the array untouched for an empty query', () => {
		const q = parseFilterQuery('');
		expect(filterFiles(VAULT, q)).toBe(VAULT); // 同一引用 = 没有无谓复制
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
