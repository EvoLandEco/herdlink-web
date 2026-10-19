import { flowMetrics } from "../../src/pooledFlows.js";

export const emptyFlow = () => ({
  imports: { observed: 0, permitted: 0, blocked: 0, unassigned: 0 },
  exports: { observed: 0, permitted: 0, blocked: 0, unassigned: 0 },
  regions: {}, unmappedDomestic: 0,
});
export const pooledRuntime = {
  hoveredPooledFlow: null,
  clearPooledFlowHover() {},
  renderPooledFlowCallout() {},
  getPooledFlowSummary: emptyFlow,
  renderPooledFlowPositions() {},
  refreshPooledFlows() {},
  updateNodeHoverLinks() {},
  handleNetworkNodeEnter() {},
  handleNetworkNodeLeave() {},
};
export const pooledTools = { flowMetrics };
