# HerdLink Web

![Version](https://img.shields.io/badge/version-v0.9.0-2f6fed)
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
- Help overlay with quick start notes, keyboard shortcuts, and interactive illustrations of regions, trade volume, and network paths.
- PNG export of the whole app, including controls, networks, and statistics panels.

Seed region selects the single region that starts infected, with CR35 selected by
default. Initial % sets the infected share in that region before the first time
step. Choosing a seed region recomputes the simulation from the beginning.

Trade ledger and simulation modes share one network and two controls for movement:

- Link availability changes an individual directed route for the displayed time
  step. Local Trades in ledger mode and Local Transmission in simulation mode
  share the same checkbox setting. It controls recorded movements within the
  region and local contact transmission in the simulation, including time steps
  without recorded local trades.
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
  controls for individual links. Both sets of edits remain active when switching
  between control panels or between ledger and simulation modes.
  The All exports and All imports switches apply to every region, including
  regions outside the search results. A teal thumb on the right allows movement;
  a coral thumb on the left blocks it. A centered amber thumb means some regions
  are allowed and others are blocked. Selecting a mixed control allows every region.

A route between regions can operate when its link is available, its source can
export, and its destination can import. Ledger mode measures allowed routes by
recorded movement volume, while simulation mode calculates disease pressure on
the same routes. The ledger route list keeps recorded volumes visible for blocked
routes, with the reason shown beside the partner name. Its bars show partner
distance and community; simulation bars show the partner's infectious share.

Trade communities use an undirected network with the allowed volumes in both
directions added together. Modularity measures the returned partition on that
same network. The trade matrix retains the direction of each movement.

Ledger hotspot scores use allowed routes between regions and exclude local
trades. Rings mark up to three positive eligible scores per metric at the
displayed date. Blocking exports removes a region's Seeding and Bottleneck
marks; incoming routes can still support Vulnerable, Sink, or Amplifier marks.
Sink requires imports, while Amplifier considers connections in either
direction. Simulation rings show incoming exposure, outgoing pressure,
prevalence, infectious burden, and pressure per infectious animal. Infection can
persist after movement stops; local transmission is separate from import and
export pressure.

Edits made in either mode can change disease outcomes from the selected step
onward. Earlier simulated states, regional holdings, and initial infections stay
fixed. Replay shows the controls active at each date. Restore all in either mode
clears both kinds of edits across every date; the simulation uses this restored
network when it runs.

Dated edits survive settings and time resolution changes. Link availability edits
apply only to matching dates in the selected resolution. Node restrictions apply
to every step on or after their start date until a later permission change.
The schedules stay active when switching between ledger and simulation modes.

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
holdings are not individual farm sites. Census definitions follow each reference
year, while the displayed COROP boundaries are from 2024. These layers do not
change the disease model or identify the vehicle routes behind regional flows.

- [Kadaster TOP250NL](https://www.pdok.nl/introductie/-/article/basisregistratie-topografie-brt-topnl)
  supplies the bundled context geometry in Dutch RD New coordinates. Land cover
  distinguishes woodland, settlements, and sand; it does not classify agriculture.
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

## Deployment and caching

Vite gives the app, classic runtime scripts, styles, datasets, geography, and
logos filenames based on their contents. Each app build refers to its own asset
URLs. The runtime loads its classic scripts in dependency order and resolves
bundled data through `src/assetUrls.js`. Asset contents determine the URLs;
release dates and version labels do not.

SimpleKeyboard JavaScript and CSS use release 3.8.187. D3 uses 6.7.0.
Bootstrap, Vivus, and LeaderLine also use exact release URLs. The FontAwesome
kit keeps its licensed icon selection; its release version is controlled in
the [kit settings](https://docs.fontawesome.com/web/setup/use-kit#additional-settings).

The Pages workflow stores published assets on `herdlink-pages-assets` and includes
them in each deployment. This lets open tabs load their runtime, data, and
screenshot code after another release. The archive is written before Pages
publishes the site. A generated filename with different contents stops the
deployment. Files declared in `public/assets` keep their fixed paths and may
be replaced.

Initial archive creation requires the `github-pages` artifact from the latest
successful deployment. If that artifact is unavailable, deployment stops with
the run ID. Seed the archive from a trusted copy of the published assets before
deploying. Once the archive exists, retention uses Git storage rather than
expiring Actions artifacts. Keep the archive branch and its asset files intact.
Its files count toward GitHub Pages' published site size limit.

GitHub Pages controls its HTTP response headers and has no setting for per-file
cache policies. Content hashing prevents mixed asset contents, but Pages can
still cache the entry HTML. A CDN or host with response-header controls is
required for these policies:

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
