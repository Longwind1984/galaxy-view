/**
 * 笔记过滤（issue #11）：按路径/文件名正负筛选，在 buildGraph 之前作用于 FileRecord[]。
 * 被滤掉的笔记连同指向它的边会自然消失（buildGraph 靠 indexById 查不到就丢边），故本层零渲染耦合。
 *
 * 语法对齐 Obsidian 核心搜索的子集（核心 Graph View 的过滤框用的就是通用搜索语法）：
 *   Index          裸词 → 匹配完整路径（含文件夹名与文件名）
 *   file:Index     只匹配文件名（basename）
 *   path:Daily/    只匹配完整路径
 *   -file:Index    取反：排除文件名含 Index 的
 *   "star wars"    引号包住带空格的短语
 *   多个词之间是隐式 AND
 *
 * 刻意不做（都没有真实用例，等有人要再说）：
 * - 正文搜索（content:/line:/block:/section:/task:）——核心 Graph View 有，但那要每次按键读全库正文；
 *   3225 篇的库上做不到即时反馈，违反性能纪律。本过滤器只吃 vault 已有的路径元数据，O(N) 纯字符串。
 * - regex、OR、括号分组、tag:（标签已有独立开关，加进来会和 showTags 的语义纠缠）
 */

export type FilterField = 'file' | 'path';

export interface FilterTerm {
	field: FilterField;
	/** 已转小写；匹配为大小写不敏感的子串包含 */
	value: string;
	negate: boolean;
}

/** 空数组 = 不过滤（调用方据此短路，零成本） */
export type FilterQuery = FilterTerm[];

/** 供过滤的最小记录形状；与 buildGraph 的 FileRecord 结构兼容 */
export interface FilterableRecord {
	path: string;
	basename: string;
}

const FIELDS: Record<string, FilterField> = { file: 'file', path: 'path' };

/**
 * 把查询串切成词。引号内的空格不切词；`field:` 前缀与前导 `-` 在词内解析。
 * 容错优先：不合法的写法退化成裸词而不是报错——过滤框是边打边用的，中间态必然不合法。
 */
export function parseFilterQuery(raw: string): FilterQuery {
	const terms: FilterQuery = [];
	let i = 0;
	const n = raw.length;

	while (i < n) {
		while (i < n && raw[i] === ' ') i++;
		if (i >= n) break;

		let negate = false;
		if (raw[i] === '-') {
			negate = true;
			i++;
		}

		// field: 前缀——只认已知字段，`foo:bar` 这种未知前缀整体当裸词
		let field: FilterField = 'path';
		const colon = raw.indexOf(':', i);
		if (colon > i) {
			const head = raw.slice(i, colon).toLowerCase();
			const known = FIELDS[head];
			// 冒号必须紧跟在词内（中间不能有空格），否则不是字段前缀
			if (known && !head.includes(' ') && !head.includes('"')) {
				field = known;
				i = colon + 1;
			}
		}

		// 值：带引号则读到闭合引号（未闭合就读到末尾），否则读到空格
		let value = '';
		if (raw[i] === '"') {
			i++;
			const close = raw.indexOf('"', i);
			if (close === -1) {
				value = raw.slice(i);
				i = n;
			} else {
				value = raw.slice(i, close);
				i = close + 1;
			}
		} else {
			const start = i;
			while (i < n && raw[i] !== ' ') i++;
			value = raw.slice(start, i);
		}

		// 空值词（单个 `-`、`file:` 后什么都没有）没有语义，丢弃
		if (value.length > 0) terms.push({ field, value: value.toLowerCase(), negate });
	}

	return terms;
}

export function matchesFilter(rec: FilterableRecord, query: FilterQuery): boolean {
	for (const term of query) {
		const hay = (term.field === 'file' ? rec.basename : rec.path).toLowerCase();
		if (hay.includes(term.value) === term.negate) return false;
	}
	return true;
}

/** 空查询直接原样返回（不复制数组），避免全库无谓遍历 */
export function filterFiles<T extends FilterableRecord>(files: T[], query: FilterQuery): T[] {
	if (query.length === 0) return files;
	return files.filter((f) => matchesFilter(f, query));
}
