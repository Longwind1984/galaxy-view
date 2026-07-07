import { getLanguage, moment } from 'obsidian';
import { EN } from './en';
import { ZH } from './zh';
import { DE } from './de';
import { IT } from './it';
import { ES } from './es';
import { PT } from './pt';

export type Lang = 'en' | 'zh' | 'de' | 'it' | 'es' | 'pt';
/**
 * English is canonical: the set of keys comes from EN, values are plain strings.
 * (Deriving keys from `typeof EN` keeps a missing key in any dict a compile error,
 * while mapping values to `string` lets each language hold different text.)
 */
export type Dict = Record<keyof typeof EN, string>;
export type LangPref = 'auto' | Lang;

/** Ordered for the switcher menu; each entry's `name` is its endonym (shown as-is). */
export const LANGS: { code: Lang; name: string }[] = [
	{ code: 'en', name: 'English' },
	{ code: 'zh', name: '中文' },
	{ code: 'de', name: 'Deutsch' },
	{ code: 'it', name: 'Italiano' },
	{ code: 'es', name: 'Español' },
	{ code: 'pt', name: 'Português' },
];

const DICTS: Record<Lang, Dict> = { en: EN, zh: ZH, de: DE, it: IT, es: ES, pt: PT };
/** Obsidian locale prefixes we map to a supported language (checked in order). */
const DETECT: Lang[] = ['zh', 'de', 'it', 'es', 'pt'];

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
 * Resolve the effective language. A non-`auto` preference is used as-is. `auto`
 * reads Obsidian's UI language via getLanguage() (available from the 1.8.7
 * minAppVersion floor), falling back to moment.locale(), then 'en'. The locale
 * prefix is matched against the supported set; anything else falls back to 'en'.
 */
export function resolveLang(pref: LangPref): Lang {
	if (pref !== 'auto') return pref;
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
	raw = raw.toLowerCase();
	for (const l of DETECT) if (raw.startsWith(l)) return l;
	return 'en';
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
