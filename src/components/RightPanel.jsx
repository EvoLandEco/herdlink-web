const globalMetrics = [
  { value: "totalNodes", label: "Active Regions" },
  { value: "totalEdges", label: "Trade Routes" },
  { value: "totalTradeVolume", label: "Total Volume" },
  { value: "avgTradeEdge", label: "Avg. Volume/Route" },
  { value: "avgTradeNode", label: "Avg. Volume/Area" },
  { value: "numPartitions", label: "Communities" },
  { value: "modularity", label: "Modularity" },
  { value: "spectralRadius", label: "Spectral Radius" },
];

const nodeMetrics = [
  { value: "pageRank", label: "Sink (by PageRank)" },
  { value: "betweenness", label: "Bottleneck (by Betweenness)" },
  { value: "eigenvector", label: "Amplifier (by Eigenvector)" },
  { value: "inDegree", label: "Vulnerable (by In-Degree)" },
  { value: "outDegree", label: "Seeding (by Out-Degree)" },
];

function InfoButton({ label, placement = "left", tipKey }) {
  return (
    <button
      className="panel-info-button has-tip"
      type="button"
      data-tip-key={tipKey}
      data-tip-placement={placement}
      aria-label={label}
    >
      <i className="fa-solid fa-circle-info" aria-hidden="true"></i>
    </button>
  );
}

export function RightPanel() {
  return (
    <div id="col3" className="col3">
      <div id="globalStats" className="global-stats-chart">
        <div id="globalStatsControls">
          <label htmlFor="statSelect">
            <i className="fa-regular fa-globe" aria-hidden="true"></i>
            <span>Global Metric:</span>
          </label>
          <select id="statSelect" defaultValue="totalTradeVolume">
            {globalMetrics.map((metric) => (
              <option key={metric.value} value={metric.value}>
                {metric.label}
              </option>
            ))}
          </select>
          <InfoButton label="Global metric guide" tipKey="globalMetric" />
        </div>
      </div>
      <div id="nodeStats" className="node-stats-chart">
        <div id="nodeStatsControls">
          <label htmlFor="nodeStatSelect">
            <i className="fa-regular fa-share-nodes" aria-hidden="true"></i>
            <span>Node Metric:</span>
          </label>
          <select id="nodeStatSelect" defaultValue="eigenvector">
            {nodeMetrics.map((metric) => (
              <option key={metric.value} value={metric.value}>
                {metric.label}
              </option>
            ))}
          </select>
          <InfoButton label="Node metric guide" tipKey="nodeMetric" />
        </div>
      </div>
      <div id="tradeInfo" className="trade-info-container">
        <div id="tradePanel" className="trade-panel"></div>
        <div id="inArboContainer" className="in-arbo-container">
          <div className="inArboTitle panel-title-label"></div>
        </div>
      </div>
    </div>
  );
}
