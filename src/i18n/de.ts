import type { Translations } from './en';

/** Deutsch. Die Struktur muss mit en.ts übereinstimmen (durch den Typ Translations erzwungen). */
export const de: Translations = {
	cmd: {
		open: 'Galaxieansicht öffnen',
		search: 'Galaxie-Knoten suchen und hinfliegen',
	},

	notice: {
		workerUnavailable: 'Galaxieansicht: Hintergrund-Thread nicht verfügbar – Layout läuft im Haupt-Thread',
		mobileCap: (cap, total) => `Mobil-Stufe: Die ${cap} am stärksten verknüpften Knoten werden angezeigt (von ${total})`,
		autoPerf: 'Galaxieansicht: automatisch in den Leistungsmodus gewechselt (unter „Erweitert“ umstellbar)',
		notSettled: 'Die Galaxie formt sich noch – bitte erneut versuchen, sobald sie sich beruhigt hat',
		importFirst: 'Zuerst 2D-Graph-Farben importieren, dann kann gemischt werden',
		noColorGroups: 'Keine Farbgruppen im Graphen gefunden (graph.json)',
		importedColors: (n) => `${n} 2D-Graph-Farbgruppe(n) importiert`,
	},

	mask: {
		building: 'Sternenkarte wird erstellt…',
		contextLost: 'Render-Kontext verloren – zum Neuaufbau klicken',
	},

	hud: {
		settled: 'beruhigt',
		settling: 'ordnet sich',
	},

	panel: {
		search: 'Suchen',
		recenter: 'Zentrieren',
		cruiseOn: 'Reiseflug: an',
		cruiseOff: 'Reiseflug: aus',
		reveal: 'Entstehungsanimation',
		secBloom: 'Leuchten',
		secPhysics: 'Physik',
		secLook: 'Aussehen & Farbe',
		secCruise: 'Reiseflug',
		secAdvanced: 'Erweitert',
		strength: 'Stärke',
		spread: 'Streuung',
		threshold: 'Schwelle',
		repel: 'Abstoßung',
		linkDistance: 'Verbindungsabstand',
		linkStrength: 'Verbindungsstärke',
		centerPull: 'Zentrumszug',
		flatten: 'Abflachung',
		nodeSize: 'Knotengröße',
		linkOpacity: 'Verbindungsdeckkraft',
		twinkle: 'Funkeln',
		twinkleOff: 'aus',
		themePlaceholder: 'Farbschema…',
		importColors: '2D-Farben importieren',
		shuffleColors: 'Farben mischen',
		speed: 'Geschwindigkeit',
		reset: 'Auf Standard zurücksetzen',
		unresolvedShow: 'Unaufgelöst: sichtbar',
		unresolvedHide: 'Unaufgelöst: verborgen',
		orphansShow: 'Waisen: sichtbar',
		orphansHide: 'Waisen: verborgen',
		sizeByDegree: 'Größe: Verknüpfungen',
		sizeByFileSize: 'Größe: Dateigröße',
		sizeByUniform: 'Größe: einheitlich',
		presetDeepSpace: 'Optik: Tiefer Weltraum',
		presetAdaptive: 'Optik: themenbasiert',
		qualityAuto: 'Qualität: automatisch',
		qualityHigh: 'Qualität: hoch',
		qualityLow: 'Qualität: niedrig',
		qualityMobile: 'Qualität: Mobil-Simulation',
		help: [
			'Linksziehen = umkreisen · Mausrad = zoomen',
			'Rechtsziehen / ⌘ oder ⇧ + Linksziehen = verschieben',
			'(Unter macOS gilt Strg+Klick als Rechtsklick)',
			'WASD = fliegen · Q/E = hoch/runter · Umschalt = schneller',
			'Knoten anklicken = auswählen, hinfliegen & umkreisen · ESC = abbrechen',
			'F = zur Auswahl fliegen · R = zurück zur Übersicht',
			'Doppelklick auf Regler = auf Standard zurücksetzen',
		],
		sliderDefault: (v) => `Standard ${v}`,
	},

	card: {
		unresolvedLink: 'Unaufgelöster Link (Notiz existiert noch nicht)',
		rootFolder: 'Stammordner',
		emptyNote: '(leere Notiz)',
		openNote: 'Notiz öffnen',
		focus: 'Fokussieren',
		degrees: (inDeg, outDeg) => `↩ ${inDeg} Backlinks · → ${outDeg} ausgehend`,
		modified: (date) => ` · geändert ${date}`,
	},

	search: {
		placeholder: 'Notizen suchen, Enter zum Hinfliegen…',
		unresolved: 'Unaufgelöst',
		links: (n) => `${n} Verknüpfungen`,
	},

	presets: {
		galaxy: 'Galaxie',
		nebula: 'Nebel',
		minimal: 'Minimal',
		fireworks: 'Feuerwerk',
	},

	themes: {
		hubble: 'Hubble-Tiefraum',
		tiktok: 'TikTok Neon',
		sunset: 'Sonnenuntergangsfilm',
		cyber: 'Cyber-Stadt',
		matrix: 'Matrix',
		aurora: 'Polarlicht',
	},

	dateLocale: 'de-DE',
};
