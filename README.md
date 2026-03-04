# HerdLink Web

HerdLink Web is an interactive, browser-based application for exploring the **Dutch livestock trade network** across time. It combines network visualization, geospatial context, and time-based analytics so users can examine how trade connections evolve between regions and identify structural patterns in movement flows.

## Why HerdLink

Livestock movement systems are dynamic and highly connected. HerdLink helps researchers, analysts, and policy stakeholders move from raw movement tables to an interpretable network view by offering:

- Multi-resolution temporal analysis (daily, weekly, monthly, yearly)
- Interactive graph and map views of the same underlying network
- Region-level focus mode for detailed in/out flow and structural metrics
- Built-in visual cues for communities, trade intensity, and trend behavior

## Core Features

- **Temporal switching**: Seamlessly switch among daily, weekly, monthly, and yearly aggregated datasets.
- **Dual visualization modes**: Toggle between force-directed network view and geo-anchored map layout.
- **Focus mode**: Click a node to inspect region-specific network behavior and detailed trade context.
- **Network analytics overlays**: View centrality-style metrics, connectivity cues, and community structure.
- **Trade structure exploration**: Inspect incoming, outgoing, and self-trade composition for selected regions.
- **Interactive guidance**: In-app overlay and keyboard shortcuts support fast exploratory workflows.
- **Export support**: Save the current visualization as an image for reporting and presentation.

## Data Inputs

HerdLink currently reads pre-aggregated CSV files from `assets/data/`:

- `daily_aggregation.csv`
- `weekly_aggregation.csv`
- `monthly_aggregation.csv`
- `yearly_aggregation.csv`

Expected key columns:

- `time` – date key for temporal filtering
- `COROP_LEV` – origin region code
- `COROP_AFN` – destination region code
- `AANTAL` – trade volume/weight

Geospatial support files and map shapes are located under `assets/files/herdlink/`.

## Tech Stack

This project is a static web application powered by:

- **HTML/CSS/JavaScript**
- **D3.js** for visualization and interaction
- **Bootstrap 5** for UI structure
- **jLouvain** for community detection
- Additional client-side libraries for annotation, export, and UI enhancement

No backend service is required for local exploration of the included datasets.

## Getting Started

### 1) Clone the repository

```bash
git clone <your-repo-url>
cd herdlink-web
```

### 2) Start a local static server

Because the app loads local data files via browser requests, use a local server instead of opening `index.html` directly.

Using Python:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Usage Quick Start

1. Choose a **time resolution** (daily/weekly/monthly/yearly).
2. Use the mode toggle to switch between **Graph** and **Map**.
3. Click a node to enter **focus mode** and inspect trade/metric details.
4. Step through time or replay temporal progression where available.
5. Export a screenshot when needed for documentation.

## Project Structure

```text
herdlink-web/
├── index.html                  # Main app UI, visualization logic, and interactions
├── assets/
│   ├── css/
│   │   └── herdlink.css        # Styling and layout
│   ├── data/                   # Aggregated trade datasets by temporal resolution
│   ├── files/herdlink/         # GeoJSON and map/vector assets
│   ├── icon/                   # App icons/graphics
│   └── js/                     # Local JS libraries and helpers
├── favicon.ico
└── README.md
```

## Deployment

This repository is well suited for static hosting (e.g., GitHub Pages, Netlify, Vercel static output). Ensure all `assets/` paths remain relative and intact during deployment.

## Contributing

Contributions are welcome, especially around:

- Data pipeline and ingestion improvements
- Additional epidemiological/network metrics
- UX refinements for expert and policy workflows
- Documentation and reproducible analysis support

If you plan larger changes, consider opening an issue first to align on scope.

## License

No explicit license file is currently included in this repository. Add a license before reuse in external projects.
