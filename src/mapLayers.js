const geographyPath = "assets/files/herdlink/layers/";
const landCoverColors = { woodland: "#759970", urban: "#b1a394", sand: "#dcc990" };
const overlays = [
  { id: "mapLandCover", file: "land-cover", label: "Land cover" },
  { id: "mapWater", file: "water", label: "Water" },
  { id: "mapRoads", file: "roads", label: "Major roads" },
  { id: "mapProvinces", file: "provinces", label: "Province boundaries" },
  { id: "mapPlaces", file: "places", label: "Place labels" },
];
const backgrounds = {
  light: {
    url: "https://service.pdok.nl/kadaster/brt-achtergrondkaart/wmts/v2_0?service=WMTS&request=GetCapabilities",
    layer: "grijs",
  },
  aerial: {
    url: "https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0?service=WMTS&request=GetCapabilities",
    layer: "2022_ortho25",
  },
};

export function wmtsTiles(matrices, bounds, metresPerPixel) {
  const sorted = [...matrices].sort((a, b) => b.resolution - a.resolution);
  const matrix = sorted.find((item) => item.resolution <= metresPerPixel) || sorted.at(-1);
  const tileWidth = matrix.resolution * matrix.tileWidth;
  const tileHeight = matrix.resolution * matrix.tileHeight;
  const firstCol = Math.max(0, Math.floor((bounds[0] - matrix.origin[0]) / tileWidth));
  const lastCol = Math.min(matrix.width - 1, Math.ceil((bounds[2] - matrix.origin[0]) / tileWidth) - 1);
  const firstRow = Math.max(0, Math.floor((matrix.origin[1] - bounds[3]) / tileHeight));
  const lastRow = Math.min(matrix.height - 1, Math.ceil((matrix.origin[1] - bounds[1]) / tileHeight) - 1);
  const tiles = [];
  for (let row = firstRow; row <= lastRow; row += 1) {
    for (let col = firstCol; col <= lastCol; col += 1) {
      tiles.push({
        matrix: matrix.id, row, col,
        x: matrix.origin[0] + col * tileWidth,
        y: matrix.origin[1] - row * tileHeight,
        width: tileWidth, height: tileHeight,
      });
    }
  }
  return tiles;
}

export function censusValue(census, year, code, metric) {
  const value = census?.years?.[year]?.[code]?.[metric === "pigs" ? "pigsPerKm2" : "holdingsPerKm2"];
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function readWMTS(xml, layerId) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const child = (node, name) => [...node.children].find((item) => item.localName === name);
  const value = (node, name) => child(node, name)?.textContent.trim();
  const contents = child(document.documentElement, "Contents");
  if (!contents) throw new Error("The map service returned invalid capabilities.");
  const layer = [...contents.children].find((item) => item.localName === "Layer" && value(item, "Identifier") === layerId);
  const matrixSet = [...contents.children].find((item) => item.localName === "TileMatrixSet" && value(item, "Identifier") === "EPSG:28992");
  const template = layer && [...layer.children].find((item) => item.localName === "ResourceURL" && item.getAttribute("resourceType") === "tile")?.getAttribute("template");
  if (!template || !matrixSet) throw new Error("The map service does not provide the requested RD New layer.");
  const matrices = [...matrixSet.children].filter((item) => item.localName === "TileMatrix").map((item) => ({
    id: value(item, "Identifier"),
    resolution: Number(value(item, "ScaleDenominator")) * 0.00028,
    origin: value(item, "TopLeftCorner").split(/\s+/).map(Number),
    tileWidth: Number(value(item, "TileWidth")),
    tileHeight: Number(value(item, "TileHeight")),
    width: Number(value(item, "MatrixWidth")),
    height: Number(value(item, "MatrixHeight")),
  }));
  return { template, matrices };
}

export function createMapLayers({ svg, theme, fetchAsset, refreshRegions }) {
  const d3 = window.d3;
  const button = document.getElementById("mapLayerButton");
  const menu = document.getElementById("mapLayerMenu");
  const status = document.getElementById("mapLayerStatus");
  const background = document.getElementById("mapBackground");
  const fill = document.getElementById("mapRegionFill");
  const opacity = document.getElementById("mapLayerOpacity");
  const panel = document.getElementById("col2");
  const imageCache = new Map();
  let context = null;
  let census = null;
  let year = null;
  let generation = 0;
  let pending = Promise.resolve();

  function close() {
    menu.classList.remove("active");
    button.setAttribute("aria-expanded", "false");
  }

  function showError(error) {
    status.textContent = `Map layers: ${error.message}`;
    menu.classList.add("active");
    button.setAttribute("aria-expanded", "true");
  }

  button.addEventListener("click", () => {
    const open = !menu.classList.contains("active");
    menu.classList.toggle("active", open);
    button.setAttribute("aria-expanded", String(open));
    if (open) background.focus();
  });
  button.addEventListener("keydown", (event) => {
    if (event.key === " ") event.stopPropagation();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!menu.contains(event.target) && !button.contains(event.target)) close();
  });
  menu.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      close();
      button.focus();
    }
  });
  menu.addEventListener("focusout", (event) => {
    if (event.relatedTarget && !menu.contains(event.relatedTarget) && event.relatedTarget !== button) close();
  });

  function imageData(url) {
    if (!imageCache.has(url)) {
      const request = fetchAsset(url, "blob").then((blob) => {
        if (!blob.type.startsWith("image/")) throw new Error("The map service returned a tile that is not an image.");
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error("Could not read a map tile."));
          reader.onload = () => {
            const image = new Image();
            image.src = reader.result;
            image.decode().then(() => resolve(reader.result), reject);
          };
          reader.readAsDataURL(blob);
        });
      });
      imageCache.set(url, request);
      request.catch(() => imageCache.delete(url));
    }
    return imageCache.get(url);
  }

  async function loadBackground(selected, projection, width, height) {
    if (selected === "plain") return [];
    const source = backgrounds[selected];
    const capabilities = readWMTS(await fetchAsset(source.url, "text"), source.layer);
    const bottomLeft = projection.invert([0, height]);
    const topRight = projection.invert([width, 0]);
    const tiles = wmtsTiles(capabilities.matrices, [...bottomLeft, ...topRight], 1 / projection.scale());
    return Promise.all(tiles.map(async (tile) => {
      const parameters = { TileMatrixSet: "EPSG:28992", TileMatrix: tile.matrix, TileCol: tile.col, TileRow: tile.row };
      const url = capabilities.template.replace(/\{(\w+)\}/g, (_, key) => parameters[key]);
      return { ...tile, href: await imageData(url) };
    }));
  }

  function drawOverlay(group, layer, data, path) {
    if (layer.file === "places") {
      group.selectAll("text").data(data.features).join("text")
        .attr("transform", (feature) => `translate(${path.centroid(feature)})`)
        .attr("text-anchor", "middle").attr("font-size", 10)
        .attr("font-weight", 550).attr("fill", theme.text)
        .attr("stroke", theme.canvas).attr("stroke-width", 3)
        .attr("paint-order", "stroke").text((feature) => feature.properties.name);
      return;
    }
    group.selectAll("path").data(data.features).join("path").attr("d", path)
      .attr("fill", (feature) => layer.file === "land-cover" ? landCoverColors[feature.properties.class] : layer.file === "water" && /Polygon/.test(feature.geometry.type) ? "#5aafc9" : "none")
      .attr("stroke", layer.file === "roads" ? "#d7b274" : layer.file === "water" ? "#5aafc9" : layer.file === "provinces" ? theme.text : "none")
      .attr("stroke-width", layer.file === "provinces" ? 1.6 : layer.file === "roads" ? 1.1 : 0.65)
      .attr("stroke-dasharray", layer.file === "provinces" ? "5 3" : null)
      .attr("stroke-linejoin", "round");
  }

  function densityScale() {
    const values = Object.entries(census?.years || {}).flatMap(([dataYear, regions]) =>
      Object.keys(regions).map((code) => censusValue(census, dataYear, code, fill.value)).filter((value) => value !== null));
    return d3.scaleSequential(d3.interpolateRgb("#e1f0dc", "#287449")).domain([0, d3.max(values) || 1]);
  }

  function drawLegend() {
    svg.selectAll(".map-layer-legend").remove();
    panel.style.removeProperty("--map-layer-legend-height");
    if (!context || !context.group.node().isConnected) return;
    const density = fill.value !== "metric";
    const landCover = document.getElementById("mapLandCover").checked;
    if (!density && !landCover) return;
    const group = svg.append("g").attr("class", "map-layer-legend").attr("pointer-events", "none");
    const width = Math.min(270, context.width - 32);
    const legendRowsHeight = (density ? 54 : 0) + (landCover ? 20 : 0);
    panel.style.setProperty("--map-layer-legend-height", `${legendRowsHeight}px`);
    group.attr("transform", `translate(16, ${context.height - 110 - legendRowsHeight})`);
    group.append("rect").attr("width", width)
      .attr("height", 16 + legendRowsHeight)
      .attr("rx", 5).attr("fill", theme.canvas).attr("fill-opacity", 0.92);
    if (density) {
      const scale = densityScale();
      const max = scale.domain()[1];
      const unit = fill.value === "pigs" ? "Pigs / km² of land" : "Pig holdings / km² of land";
      group.append("text").attr("x", 8).attr("y", 15).attr("fill", theme.text).attr("font-size", 11)
        .text(`${unit} · ${year ?? "—"}`);
      group.selectAll("rect.density-step").data(d3.range(40)).join("rect")
        .attr("class", "density-step").attr("x", (i) => 8 + i * 3).attr("y", 23)
        .attr("width", 3).attr("height", 8).attr("fill", (i) => scale(max * i / 39));
      group.append("text").attr("x", 8).attr("y", 44).attr("fill", theme.text).attr("font-size", 10).text("0");
      group.append("text").attr("x", 128).attr("y", 44).attr("text-anchor", "end").attr("fill", theme.text).attr("font-size", 10).text(max >= 10 ? d3.format(",.0f")(max) : d3.format(".2f")(max));
      group.append("rect").attr("x", 150).attr("y", 23).attr("width", 12).attr("height", 8).attr("fill", "url(#map-census-missing)");
      group.append("text").attr("x", 168).attr("y", 31).attr("fill", theme.text).attr("font-size", 10).text("No data");
    }
    if (landCover) {
      Object.entries(landCoverColors).forEach(([name, color], index) => {
        const x = 8 + index * 83;
        const y = (density ? 54 : 0) + 5;
        group.append("rect").attr("x", x).attr("y", y).attr("width", 9).attr("height", 9).attr("fill", color);
        group.append("text").attr("x", x + 13).attr("y", y + 8).attr("font-size", 10).attr("fill", theme.text).text(name[0].toUpperCase() + name.slice(1));
      });
    }
  }

  function render() {
    if (!context) return;
    const current = ++generation;
    const selectedBackground = background.value;
    const selectedLayers = overlays.filter((layer) => document.getElementById(layer.id).checked);
    const target = context;
    target.group.selectAll(".map-context-content").remove();
    svg.selectAll(".map-layer-legend").remove();
    status.textContent = "Loading map layers…";
    pending = (async () => {
      const [tiles, data, censusData] = await Promise.all([
        loadBackground(selectedBackground, target.projection, target.width, target.height),
        Promise.all(selectedLayers.map((layer) => fetchAsset(`${geographyPath}${layer.file}.geojson`))),
        fill.value === "metric" ? Promise.resolve(census) : fetchAsset("assets/data/pig-census.json"),
      ]);
      if (current !== generation || !target.group.node().isConnected) return;
      census = censusData;
      const content = target.group.append("g").attr("class", "map-context-content").attr("opacity", Number(opacity.value) / 100);
      content.append("g").attr("class", "map-background").selectAll("image").data(tiles).join("image")
        .attr("x", (tile) => target.projection([tile.x, tile.y])[0])
        .attr("y", (tile) => target.projection([tile.x, tile.y])[1])
        .attr("width", (tile) => tile.width * target.projection.scale())
        .attr("height", (tile) => tile.height * target.projection.scale())
        .attr("preserveAspectRatio", "none").attr("href", (tile) => tile.href);
      selectedLayers.forEach((layer, index) => drawOverlay(
        content.append("g").attr("class", `map-context-${layer.file}`), layer, data[index], target.path));
      status.textContent = "";
      refreshRegions();
      drawLegend();
    })();
    pending.catch((error) => { if (current === generation) showError(error); });
  }

  menu.addEventListener("change", (event) => {
    if (event.target !== opacity) render();
  });
  document.getElementById("mapLayerReset").addEventListener("click", () => {
    background.value = "plain";
    fill.value = "metric";
    overlays.forEach((layer) => { document.getElementById(layer.id).checked = false; });
    opacity.value = opacity.defaultValue;
    document.getElementById("mapLayerOpacityValue").value = `${opacity.value}%`;
    render();
  });
  opacity.addEventListener("input", () => {
    document.getElementById("mapLayerOpacityValue").value = `${opacity.value}%`;
    svg.selectAll(".map-context-content").attr("opacity", Number(opacity.value) / 100);
    refreshRegions();
  });

  return {
    mount({ projection, geometry, width, height }) {
      svg.selectAll(".map-context, .map-layer-legend, #map-layer-defs").remove();
      if (svg.select(":scope > defs").empty()) svg.append("defs");
      const group = svg.insert("g", ":first-child").attr("class", "map-context").attr("pointer-events", "none");
      const path = d3.geoPath().projection(projection);
      const defs = svg.append("defs").attr("id", "map-layer-defs");
      defs.append("clipPath").attr("id", "map-country-clip").append("path").attr("d", path(geometry));
      const pattern = defs.append("pattern").attr("id", "map-census-missing").attr("width", 6).attr("height", 6).attr("patternUnits", "userSpaceOnUse");
      pattern.append("rect").attr("width", 6).attr("height", 6).attr("fill", "#586371");
      pattern.append("path").attr("d", "M0,6L6,0").attr("stroke", "#abb5c0").attr("stroke-width", 1);
      group.attr("clip-path", "url(#map-country-clip)");
      context = { projection, path, width, height, group };
      render();
    },
    unmount() {
      generation += 1;
      context = null;
      pending = Promise.resolve();
      svg.selectAll(".map-context, .map-layer-legend, #map-layer-defs").remove();
      panel.style.removeProperty("--map-layer-legend-height");
      close();
    },
    applyRegionFill(paths, tradeYear) {
      const changed = year !== tradeYear;
      year = tradeYear;
      if (fill.value === "metric") {
        paths.selectAll("title.map-census-title").remove();
        if (changed) drawLegend();
        return false;
      }
      const scale = densityScale();
      paths.attr("fill", (feature) => {
        const value = censusValue(census, year, feature.properties.statcode, fill.value);
        return value === null ? "url(#map-census-missing)" : scale(value);
      }).attr("fill-opacity", Number(opacity.value) / 100);
      paths.each(function (feature) {
        const value = censusValue(census, year, feature.properties.statcode, fill.value);
        d3.select(this).selectAll("title.map-census-title").data([feature]).join("title")
          .attr("class", "map-census-title").text(`${feature.properties.statnaam} · ${year}: ${value === null ? "No census data" : `${d3.format(",.2f")(value)} ${fill.value === "pigs" ? "pigs" : "pig holdings"} / km² of land`}`);
      });
      if (changed) drawLegend();
      return true;
    },
    async ready() {
      for (;;) {
        const current = pending;
        try {
          await current;
        } catch (error) {
          if (current === pending) throw error;
        }
        if (current === pending) return;
      }
    },
    close,
    showError,
  };
}
