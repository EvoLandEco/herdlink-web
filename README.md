# HerdLink Web

![Version](https://img.shields.io/badge/version-v0.8.1-2f6fed)
![Deployment](https://img.shields.io/badge/deployment-GitHub%20Pages-121013?logo=github)
![Website](https://img.shields.io/website?url=https%3A%2F%2Fherdlink.nl&label=HerdLink.nl)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

HerdLink Web is a browser-based tool for exploring livestock trade networks in the Netherlands. It combines regional graph views, map overlays, temporal metrics, partition summaries, and simulation panels so movement structure and disease spread scenarios can be inspected in one workspace.

|  |  |
| :--: | :--: |
| **Ledger mode, global view**<br>![Ledger mode, global view](public/assets/screenshots/ledger-global.png)<br><sub>`public/assets/screenshots/ledger-global.png`</sub> | **Ledger mode, focus view**<br>![Ledger mode, focus view](public/assets/screenshots/ledger-focus.png)<br><sub>`public/assets/screenshots/ledger-focus.png`</sub> |
| **Sim mode, global view**<br>![Sim mode, global view](public/assets/screenshots/sim-global.png)<br><sub>`public/assets/screenshots/sim-global.png`</sub> | **Sim mode, focus view**<br>![Sim mode, focus view](public/assets/screenshots/sim-focus.png)<br><sub>`public/assets/screenshots/sim-focus.png`</sub> |

## Live Application

- [https://herdlink.nl](https://herdlink.nl)

## Main Features

- Trade ledger mode for daily, weekly, monthly, and yearly livestock movement summaries.
- Graph and map views with regional links, map layers, risk scores, and network metrics.
- Focus mode for inspecting one region's incoming and outgoing trade structure.
- Simulation mode with SEIR controls, compartment trajectory panels, regional prevalence maps, and focus node simulation insights.
- Partition and community views that summarize trade clustering, partition exposure, and CR-region mappings.
- Intro overlay with quick start notes, keyboard shortcuts, and guided shortcut callouts.
- PNG export for the main network visualization.

Seed region selects the single region that starts infected, with CR35 selected by
default. Initial % sets the infected share in that region before the first time
step. Choosing a seed region recomputes the simulation from the beginning.

Simulation mode has two controls for movement:

- Link availability changes an individual directed route for the displayed time
  step. A disabled self-loop stops local transmission for that step.
- Imports and exports controls govern all movement to or from a region,
  starting at the displayed date and lasting until re-enabled. They include
  partners that appear at later dates and do not stop local transmission. The
  searchable panel lists every node in the dataset. A timeline shows each region
  with restrictions anywhere in the schedule: teal allows both directions,
  salmon blocks exports, purple blocks imports, and amber blocks both. Hover a
  segment or change point for details. Click a change point to jump to its date,
  or the first time step on or after it at coarser time resolutions. Dates outside
  the replay range select the nearest endpoint. Closely spaced changes scroll
  horizontally, with region labels kept in view.
  In focus mode, the switch beside the region name selects this panel or the
  controls for individual links. Both sets of edits remain active when switching.
  The All exports and All imports checkboxes apply to every region, including
  regions outside the search results. A mixed checkbox means some regions are
  allowed and others are blocked.

A route can operate when its link is available, its source can export, and its
destination can import. Both kinds of edits can change disease outcomes from the
selected step onward. Earlier simulated states, regional holdings, and initial
infections stay fixed. Replay shows the controls active at each date. Restore all
clears both kinds of edits across every date and recomputes the full simulation.

Dated edits survive settings and time resolution changes. Link availability edits
apply only to matching dates in the selected resolution. Node restrictions apply
to every step on or after their start date until a later permission change.
Returning to ledger mode clears both schedules.

Trajectory panels use smooth curves within each period of unchanged links.
Each intervention boundary connects the last state before the edit to the first
state under it without smoothing across the boundary.

## Shortcuts

| Key | Action |
| --- | --- |
| `E` | Switch between trade ledger and simulation modes |
| `M` | Switch between map and graph views |
| `S` | Export a screenshot |
| `R` | Restore all links and node movement permissions |
| `Q` | Exit focus mode |
| `H` | Open or close the help overlay |
| `Space` | Play or pause the time slider |
| `F` | Jump to the first time step |
| `←` / `→` | Step through time |
| `↑` / `↓` | Switch focal node |

## Project Layout

```text
.
├── index.html                    # Vite entry document
├── src/
│   ├── App.jsx                   # React shell and mount bridge
│   ├── components/               # Static layout components
│   └── styles/herdlink.css       # Application styles
├── public/
│   ├── assets/
│   │   ├── data/                 # Aggregated trade datasets
│   │   ├── files/herdlink/       # GeoJSON and SVG assets
│   │   ├── js/                   # D3 helpers and HerdLink runtime
│   │   └── screenshots/          # README images
│   ├── CNAME
│   └── favicon.ico
├── package.json
└── vite.config.js
```

## Map Layers

The map layer menu offers a plain background, a light BRT map, and aerial imagery
from 2022. Major roads, water, province boundaries, place labels, and land cover
can be switched independently. The opacity control adjusts the background,
context overlays, and census colouring. Background imagery contains its own
roads, water, and labels.

Region colouring shows the analytical view, pig density, or pig holdings density.
Census colours follow the trade date's calendar year and share one linear scale
across 2018–2022. Zero and missing observations have separate appearances. The
census measures animals and businesses at their main establishment address;
holdings are not individual farm sites. Census definitions follow each reference
year, while the displayed COROP boundaries are from 2024. These layers do not
change the disease model or identify the vehicle routes behind regional flows.

- [Kadaster TOP250NL](https://www.pdok.nl/introductie/-/article/basisregistratie-topografie-brt-topnl)
  supplies the bundled context geometry in Dutch RD New coordinates. Land cover
  distinguishes woodland, settlements, and sand; it does not classify agriculture.
  Place labels use the source's population threshold of 50,000. Source dates,
  licence, selections, and archive checksum are recorded in
  [geography-sources.json](public/assets/files/herdlink/layers/geography-sources.json).
- [CBS agricultural census](https://www.cbs.nl/nl-nl/cijfers/detail/80781ned)
  supplies published COROP pig and holdings totals. Densities divide these totals
  by the same year's published land area, excluding water. The
  [census metadata](public/assets/data/pig-census.json) records source tables,
  reference dates, and land-area survey vintages.
- PDOK serves [BRT background tiles](https://www.pdok.nl/ogc-webservices/-/article/basisregistratie-topografie-achtergrondkaarten-brt-a-)
  and [aerial imagery](https://www.pdok.nl/ogc-webservices/-/article/pdok-luchtfoto-rgb-open-)
  on demand. They require an internet connection. Tiles are embedded in the SVG
  before PNG export, together with the layer legend.

The source data use CC BY 4.0. The application code's MIT licence does not replace
the data licences.

Rebuild the bundled data with Python 3:

```bash
python3 scripts/fetch-map-geography.py
python3 scripts/fetch-pig-census.py
```

Validate the bundled data and map calculations:

```bash
python3 scripts/fetch-map-geography.py --check
python3 scripts/fetch-pig-census.py --check
node --test tests/map-layers.test.js
```

## Cursors

The [cursor set](src/assets/cursors) contains six original SVGs with black fills,
rounded white outlines, and a pink and orange glow: arrow, hand, text, move, help, and unavailable.
[Cursor styles](src/styles/cursors.css) map them to the application controls using
native CSS. Each SVG has a 64 × 64 canvas and a defined click point. Touch devices
and forced colour mode retain system cursors. The artwork uses the project licence.
Open the [cursor preview](src/assets/cursors/preview.html) to inspect and try the set.

## Development

Install dependencies:

```bash
npm install
```

Start the local dev server:

```bash
npm run dev
```

Create a production build:

```bash
npm run build
```

Preview the build locally:

```bash
npm run preview
```

## License

This project is licensed under the **MIT License**. See [`LICENSE`](LICENSE) for details.
