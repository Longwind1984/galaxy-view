import type { Translations } from './en';
import { en } from './en';
import { zh } from './zh';
import { de } from './de';

export type { Translations };
export type Locale = 'en' | 'zh' | 'de';

const DICTS: Record<Locale, Translations> = { en, zh, de };

/**
 * Obsidian's UI display language ('' / 'en' for English, 'zh' / 'zh-TW' for
 * Chinese, …). Newer builds expose `getLanguage()`, but that API needs app
 * v1.8.7 while this plugin still supports v1.7.2 (manifest `minAppVersion`);
 * the underlying `localStorage["language"]` key is what `getLanguage()` reads
 * and is stable across all versions. It only changes on app reload, so
 * resolving once at module load is enough — no reactivity needed. Each
 * supported language is matched by prefix; everything else falls back to English.
 */
function detectLocale(): Locale {
	try {
		// eslint-disable-next-line obsidianmd/prefer-get-language -- getLanguage() requires v1.8.7; see comment above
		const lang = (window.localStorage.getItem('language') ?? '').toLowerCase();
		if (lang.startsWith('zh')) return 'zh';
		if (lang.startsWith('de')) return 'de';
	} catch {
		// localStorage may be unavailable (e.g. under tests) — fall through to default
	}
	return 'en';
}

export const locale: Locale = detectLocale();

/** The active locale's strings. Import as `t` and read `t.panel.search`, `t.card.focus(…)`, … */
export const t: Translations = DICTS[locale];
