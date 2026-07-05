/**
 * English translation, and the shape every locale shares:
 * `Translations` (derived below via `typeof en`) is the contract each locale
 * object is checked against. To add strings or locales, see ./README.md.
 */
export const en = {
	// Commands & ribbon (main.ts)
	cmd: {
		open: 'Open galaxy view',
		search: 'Search galaxy nodes and fly there',
	},

	// Notice toasts that ship in the store build (GraphController)
	notice: {
		workerUnavailable: 'Galaxy view: background thread unavailable — using main-thread layout',
		mobileCap: (cap: number, total: number): string => `Mobile tier: showing the ${cap} most-linked nodes (of ${total})`,
		autoPerf: "Galaxy view: switched to performance mode automatically (change it back under 'Advanced')",
		notSettled: 'The galaxy is still forming — try again once it settles',
		importFirst: 'Import 2D graph colors first, then you can shuffle',
		noColorGroups: 'No color groups found in your graph (graph.json)',
		importedColors: (n: number): string => `Imported ${n} 2D graph color group(s)`,
	},

	// Loading / error mask over the canvas (GraphController)
	mask: {
		building: 'Building star map…',
		contextLost: 'Render context lost — click to rebuild',
	},

	// Stats readout in the panel header (GraphController)
	hud: {
		settled: 'settled',
		settling: 'settling',
	},

	// Control panel (ControlPanel + Slider)
	panel: {
		search: 'Search',
		recenter: 'Recenter',
		cruiseOn: 'Cruise: on',
		cruiseOff: 'Cruise: off',
		reveal: 'Genesis animation',
		// collapsible section titles
		secBloom: 'Bloom',
		secPhysics: 'Physics',
		secLook: 'Look & color',
		secCruise: 'Cruise',
		secAdvanced: 'Advanced',
		// bloom sliders
		strength: 'Strength',
		spread: 'Spread',
		threshold: 'Threshold',
		// physics sliders
		repel: 'Repel',
		linkDistance: 'Link distance',
		linkStrength: 'Link strength',
		centerPull: 'Center pull',
		flatten: 'Flatten',
		// look sliders
		nodeSize: 'Node size',
		linkOpacity: 'Link opacity',
		twinkle: 'Twinkle',
		twinkleOff: 'off',
		// color controls
		themePlaceholder: 'Color theme…',
		importColors: 'Import 2D colors',
		shuffleColors: 'Shuffle colors',
		// cruise slider
		speed: 'Speed',
		// advanced
		reset: 'Reset defaults',
		unresolvedShow: 'Unresolved: shown',
		unresolvedHide: 'Unresolved: hidden',
		orphansShow: 'Orphans: shown',
		orphansHide: 'Orphans: hidden',
		sizeByDegree: 'Size: link count',
		sizeByFileSize: 'Size: file size',
		sizeByUniform: 'Size: uniform',
		presetDeepSpace: 'Visual: deep space',
		presetAdaptive: 'Visual: theme-based',
		qualityAuto: 'Quality: auto',
		qualityHigh: 'Quality: high',
		qualityLow: 'Quality: low',
		qualityMobile: 'Quality: mobile sim',
		// help block
		help: [
			'Left-drag = orbit · Wheel = zoom',
			'Right-drag / ⌘ or ⇧ + left-drag = pan',
			'(On macOS, Ctrl+click acts as right-click)',
			'WASD = fly · Q/E = up/down · Shift = boost',
			'Click a node = select, fly & orbit · ESC = cancel',
			'F = fly to selection · R = back to overview',
			'Double-click a slider = reset to default',
		],
		sliderDefault: (v: string): string => `Default ${v}`,
	},

	// Node info card (OverlayManager)
	card: {
		unresolvedLink: "Unresolved link (note doesn't exist yet)",
		rootFolder: 'Root folder',
		emptyNote: '(empty note)',
		openNote: 'Open note',
		focus: 'Focus',
		degrees: (inDeg: number, outDeg: number): string => `↩ ${inDeg} backlinks · → ${outDeg} outgoing`,
		modified: (date: string): string => ` · modified ${date}`,
	},

	// Fuzzy search modal (SearchModal)
	search: {
		placeholder: 'Search notes, press Enter to fly there…',
		unresolved: 'Unresolved',
		links: (n: number): string => `${n} links`,
	},

	// Style-preset display names, keyed by preset id (stylePresets)
	presets: {
		galaxy: 'Galaxy',
		nebula: 'Nebula',
		minimal: 'Minimal',
		fireworks: 'Fireworks',
	} as Record<string, string>,

	// Color-theme display names, keyed by theme id (colorThemes)
	themes: {
		hubble: 'Hubble deep space',
		tiktok: 'TikTok neon',
		sunset: 'Sunset film',
		cyber: 'Cyber city',
		matrix: 'Matrix',
		aurora: 'Aurora',
	} as Record<string, string>,

	// BCP-47 tag for Date#toLocaleDateString (OverlayManager)
	dateLocale: 'en-US',
};

export type Translations = typeof en;
