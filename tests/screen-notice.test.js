import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../src/components/ScreenSizeNotice.jsx", import.meta.url), "utf8");
const copyHandler = source.match(/const copyPageUrl = async \(\) => \{[\s\S]*?\n  };/)[0];

test("copy reports denied or unavailable clipboard access and can succeed on retry", async () => {
  const address = "https://herdlink.nl/?view=trade";
  let label;
  let copied;
  const context = vm.createContext({
    navigator: {}, window: { location: { href: address } },
    setCopyLabel: (value) => { label = value; },
  });
  vm.runInContext(`${copyHandler}\nglobalThis.copyPageUrl = copyPageUrl;`, context);
  await context.copyPageUrl();
  assert.equal(label, "Copy failed. Try again");
  context.navigator.clipboard = { writeText: async () => { throw new Error("NotAllowedError"); } };
  await context.copyPageUrl();
  assert.equal(label, "Copy failed. Try again");
  context.navigator.clipboard.writeText = async (value) => { copied = value; };
  await context.copyPageUrl();
  assert.equal(label, "URL copied");
  assert.equal(copied, address);
});
