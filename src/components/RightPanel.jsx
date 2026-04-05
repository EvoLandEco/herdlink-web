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

export function RightPanel() {
  return (
    <div id="col3" className="col3">
      <div id="globalStats" className="global-stats-chart"></div>
      <div id="globalStatsControls">
        <label htmlFor="statSelect">
          <i className="fa-regular fa-globe"></i> Global Metric:
        </label>
        <select id="statSelect" defaultValue="totalNodes">
          {globalMetrics.map((metric) => (
            <option key={metric.value} value={metric.value}>
              {metric.label}
            </option>
          ))}
        </select>
      </div>
      <div id="nodeStats" className="node-stats-chart"></div>
      <div id="nodeStatsControls">
        <label htmlFor="nodeStatSelect">
          <i className="fa-regular fa-share-nodes"></i> Node Metric:
        </label>
        <select id="nodeStatSelect" defaultValue="pageRank">
          {nodeMetrics.map((metric) => (
            <option key={metric.value} value={metric.value}>
              {metric.label}
            </option>
          ))}
        </select>
      </div>
      <div id="tradeInfo" className="trade-info-container">
        <div id="tradePanel" className="trade-panel"></div>
        <div id="inArboContainer" className="in-arbo-container">
          <div className="inArboTitle">
            <i className="fa-solid fa-sitemap"></i> Major Export Structure
          </div>
        </div>
      </div>
    </div>
  );
}
