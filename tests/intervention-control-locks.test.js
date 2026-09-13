import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(
  new URL("../public/assets/js/herdlink-runtime.js", import.meta.url), "utf8",
);
function extractFunction(name) {
  const match = source.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"));
  assert.ok(match, `Runtime function ${name} exists`);
  return match[0];
}

function input() {
  return { disabled: true, checked: true, dataset: {}, nextElementSibling: {}, setAttribute() {} };
}

function runtime() {
  const rowInputs = { exports: input(), imports: input() };
  const bulkInputs = { exports: input(), imports: input() };
  const elements = {
    ".panel-info-button": { dataset: {} },
    '.simulation-node-bulk[data-direction="exports"]': bulkInputs.exports,
    '.simulation-node-bulk[data-direction="imports"]': bulkInputs.imports,
    "#simulationNodeSearch": { value: "cr01" },
    "#simulationNodeCount": {},
  };
  const panel = {
    dataset: { selectedNode: "CR01" },
    querySelector: (selector) => elements[selector],
    isConnected: false,
  };
  const row = {
    querySelector: (selector) => rowInputs[selector.includes("exports") ? "exports" : "imports"],
  };
  const selection = new Proxy({}, {
    get: (_, key) => key === "each" ? (callback) => {
      callback.call(row, "CR01");
      return selection;
    } : () => selection,
  });
  const controls = { dataset: {}, addEventListener() {} };
  const tradePanel = { childNodes: [], insertAdjacentHTML() {} };
  panel.parentElement = tradePanel;
  const context = vm.createContext({
    selectedNodeData: { id: "CR01", statnaam: "Region 1" },
    simulationControlView: "nodes", loadedCSVData: [], allNodes: [], allLinks: [],
    simulationState: { status: "ready" }, appModeSwitchLocked: false,
    window: { isPlaying: false, isSwitchingCSV: false },
    ensureSimulationNodeControls: () => panel,
    getCurrentSliderDate: () => new Date("2020-01-01"),
    collectSimulationRegionIds: () => ["CR01"],
    getSimulationNodePermissions: () => new Map(),
    getSimulationLinkAvailability: () => new Set(),
    renderSimulationRestrictionTimeline() {},
    isSimulationModeActive: () => false,
    getStatnaam: (id) => id,
    getCoordinatesForStatcode() {},
    getLinkKey: (a, b) => `${a}-${b}`,
    formatCount: String,
    attachTradeCheckboxListeners() {},
    checkboxDisableCalls: 0,
    disableAllCheckboxes() { context.checkboxDisableCalls += 1; },
    document: { getElementById: (id) => id === "tradePanel" ? tradePanel : controls },
    d3: { timeFormat: () => () => "2020-01-01", select: () => selection, max: () => 0, sum: () => 0 },
  });
  vm.runInContext([
    "areNetworkControlsLocked", "renderSimulationNodeControls", "updateTradeTable",
  ].map(extractFunction).join("\n"), context);
  return { context, inputs: [...Object.values(rowInputs), ...Object.values(bulkInputs)] };
}

test("search and panel rendering preserve intervention locks throughout busy states", () => {
  const { context, inputs } = runtime();
  const states = [
    () => { context.window.isSwitchingCSV = true; },
    () => { context.appModeSwitchLocked = true; },
    () => { context.window.isPlaying = true; },
    () => { context.simulationState.status = "running"; },
  ];
  for (const setBusy of states) {
    context.window.isSwitchingCSV = false;
    context.appModeSwitchLocked = false;
    context.window.isPlaying = false;
    context.simulationState.status = "ready";
    context.renderSimulationNodeControls();
    assert.ok(inputs.every((item) => !item.disabled));

    setBusy();
    context.renderSimulationNodeControls();
    assert.ok(inputs.every((item) => item.disabled));
    const calls = context.checkboxDisableCalls;
    context.updateTradeTable();
    assert.equal(context.checkboxDisableCalls, calls + 1);
    assert.ok(inputs.every((item) => item.disabled));
  }
});
