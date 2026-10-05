<h1><img src="public/assets/herdlink-logo.svg" alt="HerdLink — Livestock Trade Networks" width="560"></h1>

![Version](https://img.shields.io/badge/version-v0.9.9-2f6fed)
![Deployment](https://img.shields.io/badge/deployment-GitHub%20Pages-121013?logo=github)
![Website](https://img.shields.io/website?url=https%3A%2F%2Fherdlink.nl&label=HerdLink.nl)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

HerdLink Web is a browser-based tool for exploring livestock trade networks in the Netherlands. It combines regional graph views, map overlays, temporal metrics, partition summaries, and simulation panels so movement structure and disease spread scenarios can be inspected in one workspace.

The [graduate simulation guide](docs/simulation-teaching-guide.md) explains the engine, parameter units and intervention scenarios through equations, figures and worked exercises. The [LaTeX source](docs/simulation-teaching-guide.tex), [printable PDF](output/pdf/herdlink-simulation-teaching-guide.pdf) and [runnable two-region example](scripts/simulation-tutorial-example.mjs) accompany the guide.

|  |  |
| :--: | :--: |
| **Ledger mode, global view**<br>![Ledger mode, global view](public/assets/screenshots/ledger-global.png)<br><sub>`public/assets/screenshots/ledger-global.png`</sub> | **Ledger mode, focus view**<br>![Ledger mode, focus view](public/assets/screenshots/ledger-focus.png)<br><sub>`public/assets/screenshots/ledger-focus.png`</sub> |
| **Sim mode, global view**<br>![Sim mode, global view](public/assets/screenshots/sim-global.png)<br><sub>`public/assets/screenshots/sim-global.png`</sub> | **Sim mode, focus view**<br>![Sim mode, focus view](public/assets/screenshots/sim-focus.png)<br><sub>`public/assets/screenshots/sim-focus.png`</sub> |

## Live Application

- [https://herdlink.nl](https://herdlink.nl)

## Main Features

- Daily, weekly, monthly, and yearly trade summaries with timeline replay.
- Interactive maps and networks, with regional focus views for incoming and outgoing movements.
- Network metrics, trade concentration, distance patterns, communities, and hotspots.
- Uncalibrated [SIR/SIS/SEIR/SEIRS simulations](docs/simulation-model.md) with compartment charts and regional prevalence. Daily simulation dynamics are preserved across display resolutions.
- Movement controls and [intervention presets](docs/network-scenarios.md), with baseline and three-scenario comparisons.
- Light and dark themes that follow the system, plus built-in help and keyboard shortcuts.

## Shortcuts

| Key | Action |
| --- | --- |
| `E` | Switch between trade ledger and simulation modes |
| `M` | Switch between map and graph views |
| `T` | Switch between light and dark themes |
| `R` | Restore all links and node movement permissions |
| `Q` | Exit focus mode |
| `H` | Open or close the help overlay |
| `C` | Open or close the intervention comparison |
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
│   ├── assets/
│   │   ├── data/                 # Aggregated trade datasets
│   │   └── files/herdlink/       # GeoJSON and SVG assets
│   ├── components/               # Static layout components
│   ├── runtime/                  # Classic D3 helpers and HerdLink runtime
│   └── styles/herdlink.css       # Application styles
├── public/
│   ├── assets/
│   │   ├── js/                   # Graph and SVG helper assets
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
interpret holdings as business counts at that address. Census definitions follow
each reference year, while the displayed COROP boundaries are from 2024. These
layers provide spatial context. The disease model uses ledger routes and
simulation settings, and regional links connect origin and destination regions.

- [Kadaster TOP250NL](https://www.pdok.nl/introductie/-/article/basisregistratie-topografie-brt-topnl)
  supplies the bundled context geometry in Dutch RD New coordinates. Land cover
  displays woodland, settlement, and sand classes.
  Place labels use the source's population threshold of 50,000. Source dates,
  licence, selections, and archive checksum are recorded in
  [geography-sources.json](src/assets/files/herdlink/layers/geography-sources.json).
- [CBS agricultural census](https://www.cbs.nl/nl-nl/cijfers/detail/80781ned)
  supplies published COROP pig and holdings totals. Densities divide these totals
  by the same year's published land area, excluding water. The
  [census metadata](src/assets/data/pig-census.json) records source tables,
  reference dates, and land-area survey vintages.
- PDOK serves [BRT background tiles](https://www.pdok.nl/ogc-webservices/-/article/basisregistratie-topografie-achtergrondkaarten-brt-a-)
  and [aerial imagery](https://www.pdok.nl/ogc-webservices/-/article/pdok-luchtfoto-rgb-open-)
  on demand. They require an internet connection.

The source data use CC BY 4.0. The MIT licence applies to the application code.

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

## Deployment and caching

Vite gives the app, classic runtime scripts, styles, datasets, geography, and
logos filenames based on their contents. Each app build refers to its own asset
URLs. The runtime loads its classic scripts in dependency order and resolves
bundled data through `src/assetUrls.js`.

SimpleKeyboard JavaScript and CSS use release 3.8.187. D3 uses 6.7.0.
Bootstrap, Vivus, and LeaderLine also use exact release URLs. The FontAwesome
kit keeps its licensed icon selection; its release version is controlled in
the [kit settings](https://docs.fontawesome.com/web/setup/use-kit#additional-settings).

The Pages workflow stores published assets on `herdlink-pages-assets` and includes
them in each deployment. Open tabs load their runtime and data from this archive.
The archive is written before Pages publishes the site. A generated filename with different contents stops the
deployment. Files declared in `public/assets` keep their fixed paths and may
be replaced.

Initial archive creation requires the `github-pages` artifact from the latest
successful deployment. If that artifact is unavailable, deployment stops with
the run ID. Seed the archive from a trusted copy of the published assets before
deploying. The archive persists in Git storage. Keep the archive branch and its
asset files intact.
Its files count toward GitHub Pages' published site size limit.

GitHub Pages manages HTTP caching through its host-wide response headers.
Content hashing keeps asset versions separate; the entry HTML follows Pages'
cache policy. Per-file policies require a CDN or host with response-header
controls:

| Resource | Cache-Control |
| --- | --- |
| HTML | `no-cache` |
| Assets with content hashes | `public, max-age=31536000, immutable` |

`no-cache` requires validation before a cached response is reused. See the
[HTTP caching guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching)
and [GitHub's response about custom Pages headers](https://github.com/orgs/community/discussions/54257).

Check the build and deployment asset rules with:

```bash
node --test tests/*.test.js
npm run build
```

## License

This project is licensed under the **MIT License**. See [`LICENSE`](LICENSE) for details.
