import type { Translations } from './en';

/** Italiano. La struttura deve coincidere con en.ts (imposta dal tipo Translations). */
export const it: Translations = {
	cmd: {
		open: 'Apri vista galassia',
		search: 'Cerca nodi della galassia e vola',
	},

	notice: {
		workerUnavailable: 'Vista galassia: thread in background non disponibile – layout sul thread principale',
		mobileCap: (cap, total) => `Livello mobile: mostrati i ${cap} nodi più collegati (su ${total})`,
		autoPerf: 'Vista galassia: passata automaticamente alla modalità prestazioni (modificabile in «Avanzate»)',
		notSettled: 'La galassia si sta ancora formando – riprova quando si è stabilizzata',
		importFirst: 'Importa prima i colori del grafo 2D, poi potrai mescolarli',
		noColorGroups: 'Nessun gruppo di colori trovato nel grafo (graph.json)',
		importedColors: (n) => `Importati ${n} gruppi di colori dal grafo 2D`,
	},

	mask: {
		building: 'Creazione della mappa stellare…',
		contextLost: 'Contesto di rendering perso – clicca per ricostruire',
	},

	hud: {
		settled: 'stabile',
		settling: 'in assestamento',
	},

	panel: {
		search: 'Cerca',
		recenter: 'Ricentra',
		cruiseOn: 'Crociera: attiva',
		cruiseOff: 'Crociera: disattivata',
		reveal: 'Animazione di genesi',
		secBloom: 'Bagliore',
		secPhysics: 'Fisica',
		secLook: 'Aspetto e colore',
		secCruise: 'Crociera',
		secAdvanced: 'Avanzate',
		strength: 'Intensità',
		spread: 'Diffusione',
		threshold: 'Soglia',
		repel: 'Repulsione',
		linkDistance: 'Distanza collegamenti',
		linkStrength: 'Forza collegamenti',
		centerPull: 'Attrazione centrale',
		flatten: 'Appiattimento',
		nodeSize: 'Dimensione nodi',
		linkOpacity: 'Opacità collegamenti',
		twinkle: 'Scintillio',
		twinkleOff: 'off',
		themePlaceholder: 'Tema colori…',
		importColors: 'Importa colori 2D',
		shuffleColors: 'Mescola colori',
		speed: 'Velocità',
		reset: 'Ripristina predefiniti',
		unresolvedShow: 'Non risolti: mostrati',
		unresolvedHide: 'Non risolti: nascosti',
		orphansShow: 'Orfani: mostrati',
		orphansHide: 'Orfani: nascosti',
		sizeByDegree: 'Dimensione: n. collegamenti',
		sizeByFileSize: 'Dimensione: dimensione file',
		sizeByUniform: 'Dimensione: uniforme',
		presetDeepSpace: 'Visuale: spazio profondo',
		presetAdaptive: 'Visuale: basata sul tema',
		qualityAuto: 'Qualità: automatica',
		qualityHigh: 'Qualità: alta',
		qualityLow: 'Qualità: bassa',
		qualityMobile: 'Qualità: simulazione mobile',
		help: [
			'Trascina sx = orbita · Rotellina = zoom',
			'Trascina dx / ⌘ o ⇧ + trascina sx = sposta',
			'(Su macOS, Ctrl+clic vale come clic destro)',
			'WASD = vola · Q/E = su/giù · Shift = accelera',
			'Clicca un nodo = seleziona, vola e orbita · ESC = annulla',
			'F = vola alla selezione · R = torna alla panoramica',
			'Doppio clic sul cursore = ripristina predefinito',
		],
		sliderDefault: (v) => `Predefinito ${v}`,
	},

	card: {
		unresolvedLink: 'Collegamento non risolto (la nota non esiste ancora)',
		rootFolder: 'Cartella radice',
		emptyNote: '(nota vuota)',
		openNote: 'Apri nota',
		focus: 'Metti a fuoco',
		degrees: (inDeg, outDeg) => `↩ ${inDeg} backlink · → ${outDeg} in uscita`,
		modified: (date) => ` · modificata ${date}`,
	},

	search: {
		placeholder: 'Cerca note, premi Invio per volare lì…',
		unresolved: 'Non risolto',
		links: (n) => `${n} collegamenti`,
	},

	presets: {
		galaxy: 'Galassia',
		nebula: 'Nebulosa',
		minimal: 'Minimale',
		fireworks: "Fuochi d'artificio",
	},

	themes: {
		hubble: 'Spazio profondo Hubble',
		tiktok: 'TikTok neon',
		sunset: 'Pellicola tramonto',
		cyber: 'Città cyber',
		matrix: 'Matrix',
		aurora: 'Aurora',
	},

	dateLocale: 'it-IT',
};
