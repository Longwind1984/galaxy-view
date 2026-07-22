/** Galaxy View 中作为普通文件节点参与建图的扩展名。 */
const GRAPH_EXTENSIONS = new Set(['md', 'canvas']);

export interface FileWithExtension {
	extension: string;
}

/**
 * 从 Vault.getFiles() 的结果中挑出可建图文件。
 * 扩展名按不区分大小写比较，兼容保留原始大小写的 vault 文件名。
 */
export function selectGraphFiles<T extends FileWithExtension>(files: readonly T[]): T[] {
	return files.filter((file) => GRAPH_EXTENSIONS.has(file.extension.toLowerCase()));
}

/** 标签读取只对 Markdown 文件有意义。 */
export function isMarkdownFile(file: FileWithExtension): boolean {
	return file.extension.toLowerCase() === 'md';
}
