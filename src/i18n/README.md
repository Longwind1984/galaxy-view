# Localization (i18n)

> 中文文档见 [README.zh.md](README.zh.md)。

The plugin resolves the active locale once at load from Obsidian's display
language (`localStorage["language"]`): any `zh*` variant → `zh.ts`, everything
else falls back to `en.ts`. Every call site reads strings through the `t`
accessor exported from `index.ts`, e.g. `t.panel.search`.

`en.ts` defines the shape: `type Translations = typeof en`, and every other
locale object is declared `: Translations`, so all locale files stay
structurally identical.

## Adding or changing a string

1. Add/edit the key in `en.ts`.
2. Add/edit the **same** key in every other locale file (currently `zh.ts`).
3. Read it at the call site via `t.<group>.<key>`.

Skipping step 2 is a **deliberate** compile error (`property is missing in
type`), not a bug: it guarantees no locale ever ships a missing or stale
string. For interpolated text, make the value a function — e.g.
`count: (n: number): string => \`${n} items\`` — and give it the same signature
in every locale.

## Adding a new locale

Copy `zh.ts` to e.g. `de.ts`, translate the values (keeping the keys), then
register it in `index.ts` (add to the `DICTS` map, the `Locale` type, and
`detectLocale()`).
