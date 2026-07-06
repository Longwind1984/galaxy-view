import { getLanguage, moment } from 'obsidian';
import { EN } from './en';
import { ZH } from './zh';

export type Lang = 'en' | 'zh';
/**
 * English is canonical: the set of keys comes from EN, values are plain strings.
 * (Deriving keys from `typeof EN` keeps a missing zh key a compile error, while
 * mapping values to `string` lets zh hold different text than en.)
 */
export type Dict = Record<keyof typeof EN, string>;
export type LangPref = 'auto' | Lang;

const DICTS: Record<Lang, Dict> = { en: EN, zh: ZH };

let lang: Lang = 'en';
let active: Dict = EN;

export function getLang(): Lang {
	return lang;
}

export function setLang(l: Lang): void {
	lang = l;
	active = DICTS[l];
}

/**
 * Resolve the effective language. `auto` reads Obsidian's UI language via
 * getLanguage() (available from the 1.8.7 minAppVersion floor), falling back to
 * moment.locale() then 'en'. Anything whose prefix is `zh` maps to zh; else en.
 */
export function resolveLang(pref: LangPref): Lang {
	if (pref === 'en' || pref === 'zh') return pref;
	let raw = '';
	try {
		raw = getLanguage() || '';
	} catch {
		/* stay safe if the host misbehaves */
	}
	if (!raw) {
		try {
			raw = moment.locale() || '';
		} catch {
			/* moment always present via obsidian, but stay safe */
		}
	}
	return raw.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

/**
 * Look up a string. Missing keys fall back to English, then to the key itself —
 * never throws, never blanks the UI. `vars` fills {name} placeholders.
 */
export function t(key: keyof Dict, vars?: Record<string, string | number>): string {
	let s: string = active[key] ?? EN[key] ?? String(key);
	if (vars) {
		for (const k of Object.keys(vars)) {
			s = s.split(`{${k}}`).join(String(vars[k]));
		}
	}
	return s;
}
