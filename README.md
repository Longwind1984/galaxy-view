# Galaxy View

A cinematic 3D graph view for [Obsidian](https://obsidian.md) — fly through your vault like NASA's [Eyes on Asteroids](https://eyes.nasa.gov/apps/asteroids/#/home).

![Uploading image.png…]()


Your notes become a galaxy: luminous nodes colored by your graph groups, thin desaturated link filaments, a slowly rotating starfield, and a camera that glides instead of jumps. Beauty and playfulness are part of productivity.

> 中文文档见 [README.zh.md](README.zh.md)。

## Highlights

- **Fast on real vaults** — 3,000+ notes / 20,000+ links render at 60 fps in under 10 draw calls. The force simulation runs in a Web Worker: zero main-thread jank, even during layout.
- **Cinematic camera** — click a note to fly to it (the camera arrives off-axis and immediately starts orbiting, sweeping across the side where its neighbors cluster), idle cruise with organic drift, a reveal animation that blooms the galaxy out of the center on open.
- **Playable physics** — repulsion, link distance/strength, center pull, and a *flatten* force that turns the cloud into a spiral-galaxy disc. Drag a slider and watch the universe rearrange in real time.
- **Curved links & deep-space backdrop** — links can arc away from the galactic core (slider, 0 = straight); the backdrop splits into four stackable layers: star shell, nebula veil (baked once, tinted by your color theme), drifting field stars (parallax), and cluster mist (colored clouds hugging dense clusters). All woven into the presets, each layer customizable.
- **Style & color presets** — eight hand-drawn bundles (Galaxy, Spiral, Orbits, Deep Field, Nebula, Minimal, Fireworks, Supernova) that differ across backdrop layers, palette, node size, physics, bloom, and link curvature; hover to preview live, click to apply. Save your own presets (reorder / delete), plus color themes (Hubble deep field, neon, sunset film, cyberpunk, Matrix, aurora) or import the color groups from your core 2D graph.
- **Guided navigation** — **Wander**, a hands-off cinematic auto-tour that drifts between your notable and long-unseen notes, and **Connect two**, which flies the shortest link path between any two notes.
- **Focus mode** — selecting a note dims everything but its neighborhood (optionally out to the 2nd degree), highlights its links at full saturation, and shows a draggable, collapsible card with backlinks, tags, and a snippet.
- **Six-language UI** — English / 中文 / Deutsch / Italiano / Español / Português, auto-detecting your Obsidian language and switchable in the panel.
- **Filter by clicking, not by typing** — the Filter section lists your top-level folders with their node color and note count: click one to hide it, hover for *only*. It's the legend the graph never had and the filter at the same time. A collapsed text field handles what a legend can't express — cross-cutting name patterns like `-file:Index`.
- **Search & navigate** — fuzzy search flies you to any note; `WASD`/`Q`/`E` free flight; right-drag or ⌘-drag to pan; `F`/`R`/`ESC` shortcuts.
- **Mobile aware** — automatic quality tier on phones (no postprocessing, top-1500 nodes by degree, bottom-sheet cards) keeps it smooth on iOS and Android.
- **Two visual directions** — always-dark deep space, or theme-adaptive with a designed ink-on-paper light mode.

## Install

**From the community plugin store**: search for "Galaxy view".

**Via BRAT**: add `Longwind1984/galaxy-view` in the BRAT plugin.

**Manual**: download `main.js`, `manifest.json`, `styles.css` from the latest release into `<vault>/.obsidian/plugins/galaxy-view/`, then enable it in Settings → Community plugins.

## Usage

Click the orbit icon in the ribbon, or run the command "Open galaxy view". The control panel (top-left) opens with **Filter**, then the preset picker plus collapsible sections for appearance, deep-space backdrop, bloom, and physics, a navigation zone (auto-orbit, Wander, Connect two), and advanced options. Hover any slider and double-click to reset it; everything persists.

### Filter

The Filter section lists every top-level folder with the color its notes carry in the graph and how many there are:

- **Click a folder** to hide it — its notes and their links leave the graph.
- **Hover → "only"** to isolate one folder; click again to restore.
- **Show all** (in the section header) brings everything back.
- The unresolved / orphan / tag toggles live here too — they answer the same question: what's in the graph.

Colors match the graph exactly, including groups imported from your core 2D graph, so the section doubles as the legend.

**By name** (collapsed, under the folder list) covers what a folder list can't — patterns that cut across folders:

| Query | Keeps |
| --- | --- |
| `Index` | notes whose **path or name** contains "index" |
| `file:Index` | notes whose **filename** contains "index" |
| `path:Daily/` | notes under a path containing "daily/" |
| `-file:Index` | everything **except** those filenames |
| `"star wars"` | a phrase with spaces |
| `Index -path:Daily` | both terms (terms are ANDed) |

Matching is case-insensitive and substring-based. Note contents are not searched — the filter reads only paths and filenames, which is what keeps it instant on large vaults.

## Privacy

No network requests, no telemetry. The plugin reads your vault's link graph and (optionally, read-only) the core graph's color groups from `.obsidian/graph.json`.

## License

[MIT](LICENSE)
