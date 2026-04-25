const mapLayerEntries = [
  { label: "Map", iconClass: "fa-solid fa-map" },
  { label: "Roads", iconClass: "fa-solid fa-road" },
  { label: "Satellite", iconClass: "fa-solid fa-satellite-dish" },
];

export function NetworkPanel() {
  const assetBase = import.meta.env.BASE_URL;

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
      >
        <i className="fa-solid fa-layer-group"></i>
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
      <div id="mapLayerMenu" className="map-layer-menu">
        {mapLayerEntries.map((entry) => (
          <div key={entry.label} className="menu-entry">
            <i className={entry.iconClass}></i>
            <span className="menu-text">{entry.label}</span>
            <label className="switch">
              <input type="checkbox" className="menu-checkbox" />
              <span className="slider round"></span>
            </label>
          </div>
        ))}
      </div>
      <div
        className="toggle-button-container has-tip"
        data-tip="Switch to map view (M)"
        data-tip-placement="top"
      >
        <button
          id="toggleModeButton"
          className="btn graph-mode"
          type="button"
          disabled
          aria-label="Switch to map view (M)"
        >
          <span className="btn-text">
            <i className="fa-solid fa-map-location-dot"></i>
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
        data-tip="Export screenshot (S)"
        data-tip-placement="top"
        aria-label="Export screenshot (S)"
      >
        <i className="fa-solid fa-camera"></i>
      </button>
      <div id="networkTransRiskScore">
        <i className="fa-solid fa-virus"></i> Risk Score:
        <span className="current-sr">----</span>
        <span className="initial-sr">(----)</span>
      </div>
      <svg id="mainFigureSVG"></svg>
      <div className="watermark">
        <span className="watermark-text"></span>
        <img
          src={`${assetBase}assets/files/herdlink/WUR_ZW_standard_2021.svg`}
          className="watermark-logo"
          alt=""
        />
      </div>
      <div className="statsContainer"></div>
      <div className="hotspotLegend"></div>
      <div className="hotspotInfoButton"></div>
      <div id="timeControlsContainer"></div>
      <div id="currentDateWidget" className="current-date-widget">
        <span className="current-date-label"></span>
        <span className="current-date-value"></span>
      </div>
    </div>
  );
}
