import wurLogoUrl from "../assets/files/herdlink/WUR_ZW_standard_2021.svg?url";

const mapContextLayers = [
  { id: "mapRoads", label: "Major roads" },
  { id: "mapWater", label: "Water" },
  { id: "mapProvinces", label: "Province boundaries" },
  { id: "mapPlaces", label: "Place labels" },
  { id: "mapLandCover", label: "Land cover" },
];

export function NetworkPanel() {
  return (
    <div id="col2">
      <button
        id="mapLayerButton"
        className="map-layer-button has-tip"
        type="button"
        disabled
        data-tip="Map layers"
        data-tip-placement="top"
        aria-label="Map layers"
        aria-controls="mapLayerMenu"
        aria-expanded="false"
      >
        <i className="fa-solid fa-layer-group" aria-hidden="true"></i>
      </button>
      <button
        id="helpOverlayButton"
        className="help-overlay-button has-tip"
        type="button"
        data-tip="Open help (H)"
        data-tip-placement="left"
        aria-label="Open help (H)"
      >
        <i className="fa-solid fa-question"></i>
      </button>
      <div
        id="mapLayerMenu"
        className="map-layer-menu"
        role="region"
        aria-labelledby="mapLayerHeading"
      >
        <h2 id="mapLayerHeading">Map layers</h2>
        <div className="map-layer-field">
          <label htmlFor="mapBackground">Background</label>
          <select id="mapBackground" defaultValue="plain">
            <option value="plain">Plain</option>
            <option value="light">Light map</option>
            <option value="aerial">Aerial imagery</option>
          </select>
        </div>
        <fieldset className="map-layer-context">
          <legend>Context overlays</legend>
          {mapContextLayers.map((layer) => (
            <label key={layer.id} htmlFor={layer.id}>
              <input id={layer.id} type="checkbox" defaultChecked={false} />
              <span>{layer.label}</span>
            </label>
          ))}
        </fieldset>
        <div className="map-layer-field">
          <label htmlFor="mapRegionFill">Region colouring</label>
          <select id="mapRegionFill" defaultValue="metric">
            <option value="metric">Analytical metric</option>
            <option value="pigs">Pig density</option>
            <option value="holdings">Pig holdings density</option>
          </select>
        </div>
        <div className="map-layer-opacity">
          <label htmlFor="mapLayerOpacity">Layer opacity</label>
          <output id="mapLayerOpacityValue" htmlFor="mapLayerOpacity">55%</output>
          <input id="mapLayerOpacity" type="range" min="0" max="100" defaultValue="55" />
        </div>
        <button id="mapLayerReset" className="map-layer-reset" type="button">
          Reset to default
        </button>
        <div id="mapLayerStatus" role="status" aria-live="polite"></div>
      </div>
      <div
        className="toggle-button-container has-tip"
        data-tip="Switch to graph view (M)"
        data-tip-placement="top"
      >
        <button
          id="toggleModeButton"
          className="btn map-mode"
          type="button"
          disabled
          aria-label="Switch to graph view (M)"
        >
          <span className="btn-text">
            <i className="fa-solid fa-hexagon-nodes"></i>
          </span>
        </button>
      </div>
      <button
        id="restoreButton"
        className="restore-button has-tip"
        type="button"
        disabled
        data-tip="Restore links (R)"
        data-tip-placement="top"
        aria-label="Restore links (R)"
      >
        <i className="fa-solid fa-arrows-rotate"></i>
      </button>
      <button
        id="screenshotButton"
        className="screenshot-button has-tip"
        type="button"
        disabled
        data-tip="Export whole app screenshot (S)"
        data-tip-placement="top"
        aria-label="Export whole app screenshot (S)"
      >
        <i className="fa-solid fa-camera"></i>
      </button>
      <div className="network-score-toolbar">
        <div id="networkTransRiskScore">
          <i className="fa-solid fa-virus"></i> Risk Score:
          <span className="current-sr">----</span>
          <span className="initial-sr">(----)</span>
        </div>
        <button
          className="hotspotInfoButton has-tip"
          type="button"
          aria-label="Show hotspot details"
          aria-haspopup="dialog"
          data-tip="Show hotspot details"
          data-tip-placement="right"
        >
          <i className="fa-solid fa-circle-info" aria-hidden="true"></i>
        </button>
      </div>
      <svg id="mainFigureSVG"></svg>
      <div className="watermark">
        <span className="watermark-text"></span>
        <img
          src={wurLogoUrl}
          className="watermark-logo"
          alt=""
        />
      </div>
      <div className="statsContainer"></div>
      <div className="hotspotLegend"></div>
      <div id="timeControlsContainer"></div>
      <div id="currentDateWidget" className="current-date-widget">
        <span className="current-date-label"></span>
        <span className="current-date-value"></span>
      </div>
      <div id="timeAuthorCredit" className="time-author-credit">
        Author: Tianjian Qin
      </div>
    </div>
  );
}
