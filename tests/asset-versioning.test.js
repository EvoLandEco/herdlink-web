import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, mkdtemp, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";
import { build } from "vite";

const root = new URL("../", import.meta.url);

test("bundled asset resolution uses the build URLs and preserves remote URLs", async () => {
  const source = await readFile(new URL("src/runtime/herdlink-runtime.js", root), "utf8");
  const fn = source.match(/^([ ]*)function resolveAssetUrl\([^]*?^\1}/m)[0];
  const context = vm.createContext({
    URL,
    window: {
      location: { href: "https://example.org/herdlink/" },
      HERDLINK_ASSET_URLS: { "assets/data/weekly_aggregation.csv": "/herdlink/assets/weekly_aggregation-12345678.csv" },
    },
  });
  vm.runInContext(fn, context);
  for (const prefix of ["", "/", "./"]) {
    assert.equal(context.resolveAssetUrl(`${prefix}assets/data/weekly_aggregation.csv`),
      "https://example.org/herdlink/assets/weekly_aggregation-12345678.csv");
  }
  assert.equal(context.resolveAssetUrl("https://tiles.example.org/map"), "https://tiles.example.org/map");
  assert.throws(() => context.resolveAssetUrl("assets/data/missing.csv"), /Unknown bundled asset/);
});

test("production output hashes every runtime script and bundled dataset", async (t) => {
  const outDir = await mkdtemp(path.join(tmpdir(), "herdlink-assets-"));
  t.after(() => rm(outDir, { recursive: true, force: true }));
  const result = await build({
    root: root.pathname,
    base: "/herdlink/",
    logLevel: "silent",
    build: { outDir, emptyOutDir: true },
  });
  const entry = result.output.find((item) => item.type === "chunk" && item.isEntry);
  const files = ["runtime/herdlink-runtime.js", "runtime/jLouvain.js", "runtime/d3anno.js"];
  for (const folder of ["assets/data", "assets/files"]) {
    const entries = await readdir(new URL(`src/${folder}/`, root), { recursive: true, withFileTypes: true });
    for (const entry of entries.filter((item) => item.isFile() && !item.name.startsWith("."))) {
      const parent = entry.parentPath ?? entry.path;
      files.push(path.relative(new URL("src/", root).pathname, path.join(parent, entry.name)));
    }
  }
  for (const file of files) {
    const name = path.basename(file);
    const asset = result.output.find((item) => item.type === "asset" && item.name === name);
    assert.ok(asset, `Emitted ${file}`);
    assert.match(asset.fileName, /-[\w-]{8}\.[\w]+$/);
    assert.ok(entry.code.includes(`/herdlink/${asset.fileName}`), `Entry references ${file}`);
    assert.deepEqual(await readFile(path.join(outDir, asset.fileName)), await readFile(new URL(`src/${file}`, root)));
  }
  for (const file of ["assets/js/herdlink-runtime.js", "assets/js/jLouvain.js", "assets/js/d3anno.js", "assets/data/weekly_aggregation.csv"]) {
    await assert.rejects(access(path.join(outDir, file)), { code: "ENOENT" });
  }
});
