import { describe, expect, it } from 'vitest';
import { CanvasLinkCache, mergeResolvedLinks, normalizeCanvasFilePath, parseCanvasFileLinks } from '../src/data/canvasLinks';

describe('parseCanvasFileLinks', () => {
	it('extracts only file cards, normalizes paths, and counts duplicates', () => {
		const parsed = parseCanvasFileLinks(JSON.stringify({
			nodes: [
				{ id: 'a', type: 'file', file: './Notes\\Alpha.md' },
				{ id: 'b', type: 'file', file: 'Notes/Alpha.md' },
				{ id: 'c', type: 'file', file: 'Boards/Plan.canvas' },
				{ id: 'd', type: 'text', text: '[[Ignored.md]]' },
				{ id: 'e', type: 'link', url: 'https://example.com' },
			],
		}));
		expect(parsed).toEqual({ 'Notes/Alpha.md': 2, 'Boards/Plan.canvas': 1 });
	});

	it('returns null for malformed JSON so callers can preserve the last good cache', () => {
		expect(parseCanvasFileLinks('{"nodes":[')).toBeNull();
		expect(parseCanvasFileLinks('null')).toBeNull();
		expect(parseCanvasFileLinks('{}')).toBeNull();
		expect(parseCanvasFileLinks('{"nodes":{}}')).toBeNull();
		expect(parseCanvasFileLinks('{"nodes":[]}')).toEqual({});
	});

	it('normalizes relative path segments without escaping the vault root', () => {
		expect(normalizeCanvasFilePath('/Projects/./Maps/../Plan.md')).toBe('Projects/Plan.md');
	});
});

describe('CanvasLinkCache', () => {
	it('rejects an older async read after a newer modify revision', () => {
		const cache = new CanvasLinkCache();
		const oldRevision = cache.capture('board.canvas');
		const newRevision = cache.mark('board.canvas');

		expect(cache.apply('board.canvas', newRevision, { 'new.md': 1 })).toEqual({ accepted: true, changed: true });
		expect(cache.apply('board.canvas', oldRevision, { 'old.md': 1 })).toEqual({ accepted: false, changed: false });
		expect(cache.asLinkTable()).toEqual({ 'board.canvas': { 'new.md': 1 } });
	});

	it('invalidates in-flight reads and cached sources below a renamed or deleted folder', () => {
		const cache = new CanvasLinkCache();
		const revision = cache.capture('Maps/board.canvas');
		cache.apply('Maps/board.canvas', revision, { 'note.md': 1 });

		expect(cache.removeTree('Maps')).toBe(true);
		expect(cache.apply('Maps/board.canvas', revision, { 'stale.md': 1 })).toEqual({ accepted: false, changed: false });
		expect(cache.asLinkTable()).toEqual({});
	});

	it('moves last-good Canvas sources and referenced targets across renames', () => {
		const cache = new CanvasLinkCache();
		const inside = cache.capture('Maps/board.canvas');
		const outside = cache.capture('outside.canvas');
		cache.apply('Maps/board.canvas', inside, { 'Maps/note.md': 1 });
		cache.apply('outside.canvas', outside, { 'Maps/note.md': 1 });

		expect(cache.renameTree('Maps', 'Archive/Maps')).toBe(true);
		expect(cache.asLinkTable()).toEqual({
			'Archive/Maps/board.canvas': { 'Archive/Maps/note.md': 1 },
			'outside.canvas': { 'Archive/Maps/note.md': 1 },
		});

		expect(cache.renameFile('Archive/Maps/board.canvas', 'board.canvas', true)).toBe(true);
		expect(cache.asLinkTable()).toEqual({
			'board.canvas': { 'Archive/Maps/note.md': 1 },
			'outside.canvas': { 'Archive/Maps/note.md': 1 },
		});
	});
});

describe('mergeResolvedLinks', () => {
	it('adds Canvas sources without mutating inputs or duplicating an existing pair', () => {
		const base = { 'a.md': { 'b.md': 1 }, 'board.canvas': { 'b.md': 1 } };
		const canvas = { 'board.canvas': { 'b.md': 2, 'c.md': 1 } };
		const merged = mergeResolvedLinks(base, canvas);
		expect(merged).toEqual({ 'a.md': { 'b.md': 1 }, 'board.canvas': { 'b.md': 2, 'c.md': 1 } });
		expect(base).toEqual({ 'a.md': { 'b.md': 1 }, 'board.canvas': { 'b.md': 1 } });
		expect(canvas).toEqual({ 'board.canvas': { 'b.md': 2, 'c.md': 1 } });
	});
});
