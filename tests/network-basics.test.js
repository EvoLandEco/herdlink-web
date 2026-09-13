import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL("../src/components/NetworkBasics.jsx", import.meta.url))],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  jsx: "automatic",
  loader: { ".css": "empty" },
});
const { getNetworkExample } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`
);

test("region selection reports direct trading partners", () => {
  assert.deepEqual(getNetworkExample("B", true).partners, ["A", "C", "D"]);
  for (const region of ["A", "C", "D"]) {
    assert.deepEqual(getNetworkExample(region, true).partners, ["B"]);
  }
});

test("removing the bridge disconnects C and D from A but preserves C to D", () => {
  const connected = getNetworkExample("B", true);
  assert.deepEqual([...connected.reachable], ["A", "B", "C", "D"]);
  assert.deepEqual(connected.routeLinks, [["A", "B"], ["B", "C"], ["C", "D"]]);

  const disconnected = getNetworkExample("B", false);
  assert.deepEqual([...disconnected.reachable], ["A", "B"]);
  assert.deepEqual(disconnected.routeLinks, [["A", "B"], ["C", "D"]]);
  assert.deepEqual(disconnected.partners, connected.partners);
  assert.deepEqual([...getNetworkExample("B", true).reachable], ["A", "B", "C", "D"]);
});
