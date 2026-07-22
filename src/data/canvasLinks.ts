import type { LinkTable } from './buildGraph';

interface CanvasFileNode {
	type?: unknown;
	file?: unknown;
}

interface CanvasDocument {
	nodes?: unknown;
}

export class CanvasLinkCache {
	private readonly links: LinkTable = {};
	private readonly revisions = new Map<string, number>();

	capture(path: string): number {
		if (!this.revisions.has(path)) this.revisions.set(path, 0);
		return this.revisions.get(path) ?? 0;
	}

	mark(path: string): number {
		const revision = this.capture(path) + 1;
		this.revisions.set(path, revision);
		return revision;
	}

	remove(path: string): boolean {
		this.mark(path);
		const existed = this.links[path] !== undefined;
		delete this.links[path];
		return existed;
	}

	removeTree(folderPath: string): boolean {
		let changed = false;
		const paths = new Set([...this.revisions.keys(), ...Object.keys(this.links)]);
		for (const path of paths) {
			if (!isPathInside(path, folderPath)) continue;
			changed = this.remove(path) || changed;
		}
		return changed;
	}

	renameFile(oldPath: string, newPath: string, moveSource: boolean): boolean {
		let changed = this.renameTargets((path) => path === oldPath ? newPath : path);
		if (!moveSource) return changed;
		const targets = this.links[oldPath];
		this.remove(oldPath);
		this.mark(newPath);
		if (targets !== undefined) {
			this.links[newPath] = targets;
			changed = true;
		}
		return changed;
	}

	renameTree(oldFolderPath: string, newFolderPath: string): boolean {
		const rename = (path: string) => renamePathPrefix(path, oldFolderPath, newFolderPath);
		let changed = this.renameTargets(rename);
		const entries = Object.entries(this.links);
		for (const [oldSource, targets] of entries) {
			const newSource = rename(oldSource);
			if (newSource === oldSource) continue;
			this.remove(oldSource);
			this.mark(newSource);
			this.links[newSource] = targets;
			changed = true;
		}
		// Invalidate reads captured before the folder move even when no cache entry existed yet.
		for (const oldSource of [...this.revisions.keys()]) {
			const newSource = rename(oldSource);
			if (newSource === oldSource) continue;
			this.mark(oldSource);
			this.mark(newSource);
		}
		return changed;
	}

	apply(path: string, revision: number, targets: Record<string, number>): { accepted: boolean; changed: boolean } {
		if (this.capture(path) !== revision) return { accepted: false, changed: false };
		const previous = this.links[path];
		const changed = previous === undefined || !sameLinkTargets(previous, targets);
		if (changed) this.links[path] = targets;
		return { accepted: true, changed };
	}

	asLinkTable(): LinkTable {
		return this.links;
	}

	private renameTargets(rename: (path: string) => string): boolean {
		let changed = false;
		for (const [source, targets] of Object.entries(this.links)) {
			const nextTargets: Record<string, number> = {};
			let sourceChanged = false;
			for (const [target, count] of Object.entries(targets)) {
				const nextTarget = rename(target);
				nextTargets[nextTarget] = Math.max(nextTargets[nextTarget] ?? 0, count);
				sourceChanged ||= nextTarget !== target;
			}
			if (sourceChanged) {
				this.links[source] = nextTargets;
				changed = true;
			}
		}
		return changed;
	}
}

/** Obsidian vault path normalization needed by JSON Canvas file nodes, kept pure for tests. */
export function normalizeCanvasFilePath(raw: string): string {
	const parts: string[] = [];
	for (const part of raw.trim().replaceAll('\\', '/').split('/')) {
		if (!part || part === '.') continue;
		if (part === '..') parts.pop();
		else parts.push(part);
	}
	return parts.join('/');
}

/**
 * Extract file-card references from one JSON Canvas document.
 * `null` means the file is temporarily invalid/incomplete; callers should preserve their last good cache.
 */
export function parseCanvasFileLinks(text: string): Record<string, number> | null {
	let doc: CanvasDocument;
	try {
		doc = JSON.parse(text) as CanvasDocument;
	} catch {
		return null;
	}
	if (!doc || typeof doc !== 'object') return null;
	if (!Array.isArray(doc.nodes)) return null;

	const links: Record<string, number> = {};
	for (const value of doc.nodes) {
		if (!value || typeof value !== 'object') continue;
		const node = value as CanvasFileNode;
		if (node.type !== 'file' || typeof node.file !== 'string') continue;
		const path = normalizeCanvasFilePath(node.file);
		if (!path) continue;
		links[path] = (links[path] ?? 0) + 1;
	}
	return links;
}

/**
 * Overlay Canvas-derived sources onto Obsidian's resolved link table without mutating either input.
 * A source-target pair present in both tables remains one graph edge; the larger occurrence count wins.
 */
export function mergeResolvedLinks(base: LinkTable, canvas: LinkTable): LinkTable {
	const merged: LinkTable = { ...base };
	for (const [source, canvasTargets] of Object.entries(canvas)) {
		const baseTargets = base[source] ?? {};
		const targets: Record<string, number> = { ...baseTargets };
		for (const [target, count] of Object.entries(canvasTargets)) {
			targets[target] = Math.max(targets[target] ?? 0, count);
		}
		merged[source] = targets;
	}
	return merged;
}

function isPathInside(path: string, folderPath: string): boolean {
	const prefix = folderPath.endsWith('/') ? folderPath : `${folderPath}/`;
	return path.startsWith(prefix);
}

function renamePathPrefix(path: string, oldFolderPath: string, newFolderPath: string): string {
	if (!isPathInside(path, oldFolderPath)) return path;
	return `${newFolderPath}${path.slice(oldFolderPath.length)}`;
}

function sameLinkTargets(a: Record<string, number>, b: Record<string, number>): boolean {
	const aKeys = Object.keys(a);
	const bKeys = Object.keys(b);
	return aKeys.length === bKeys.length && aKeys.every((key) => a[key] === b[key]);
}
