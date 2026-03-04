# HerdLink Web

![Version](https://img.shields.io/badge/version-v0.5--alpha-2f6fed)
![Deployment](https://img.shields.io/badge/deployment-GitHub%20Pages-121013?logo=github)
![Website](https://img.shields.io/website?url=https%3A%2F%2Fherdlink.nl&label=HerdLink.nl)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

HerdLink Web is an interactive web application for **livestock trade network visualization and analysis**. It helps users explore movement patterns, network structures, and spatialtemporal dynamics in livestock trade data through a browser-first experience. The ultimate goal is to provide epidemiological insights and practical decision support.

## Live Application

This repository is automatically deployed using **GitHub Pages** and published at:

- **https://herdlink.nl**

For deployment details, see your repository's GitHub Pages settings and workflow configuration in GitHub.

## Key Capabilities

- Interactive network rendering for livestock trade relations.
- Temporal aggregation views (daily, weekly, monthly, yearly).
- Regional geospatial overlays for contextual interpretation.
- Export support for generated visual assets (e.g., SVG).
- Front-end architecture suitable for iterative analytics enhancements.

## Project Structure

```text
.
├── index.html                  # Main application entry
├── assets/
│   ├── css/                    # Styling
│   ├── data/                   # Aggregated trade datasets
│   ├── files/herdlink/         # Geo and map resources
│   ├── icon/                   # Branding assets
│   └── js/                     # Visualization and graph logic
├── favicon.ico
└── CNAME                       # Custom domain for GitHub Pages
```

## Local Development

Because this is a static web application, you can run it locally with any simple HTTP server.

Example using Python:

```bash
python3 -m http.server 8080
```

Then open:

- http://localhost:8080

## Technology Highlights

- **D3 ecosystem and helper libraries** for visualization and annotation.
- **Graph tooling** for network construction and layout.
- **GeoJSON-based map layers** for regional context.
- **Static deployment model** for fast delivery via GitHub Pages.

## License

This project is licensed under the **MIT License**. See [`LICENSE`](LICENSE) for details.
