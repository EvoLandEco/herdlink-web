import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { mergeAssets, retainPagesAssets } from "../scripts/retain-pages-assets.js";

function write(directory, relative, content) {
  const path = join(directory, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function temporary(t) {
  const directory = mkdtempSync(join(tmpdir(), "herdlink-pages-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function git(directory, ...args) {
  return execFileSync("git", args, { cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function repository(t) {
  const directory = temporary(t);
  const working = join(directory, "working");
  const origin = join(directory, "origin.git");
  git(directory, "init", "--bare", origin);
  git(directory, "init", "--initial-branch=main", working);
  write(working, "README.md", "HerdLink\n");
  git(working, "add", "README.md");
  git(working, "-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "-m", "Site source");
  git(working, "remote", "add", "origin", origin);
  git(working, "push", "origin", "main");
  return { directory, working, origin };
}

function artifactCommand(t, directory, artifact) {
  const bin = join(directory, "bin");
  const command = join(bin, "gh");
  write(directory, "bin/gh", `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
if (args[0] === "api") {
  process.stdout.write(JSON.stringify({workflow_runs: [{id: 7}]}));
} else if (args[0] === "run" && args[1] === "download" && process.env.TEST_PAGES_ARTIFACT) {
  fs.copyFileSync(process.env.TEST_PAGES_ARTIFACT, path.join(args[args.indexOf("--dir") + 1], "artifact.tar"));
} else process.exit(1);
`);
  chmodSync(command, 0o755);
  const priorPath = process.env.PATH;
  const priorArtifact = process.env.TEST_PAGES_ARTIFACT;
  process.env.PATH = `${bin}:${priorPath}`;
  process.env.TEST_PAGES_ARTIFACT = artifact || "";
  t.after(() => {
    process.env.PATH = priorPath;
    if (priorArtifact === undefined) delete process.env.TEST_PAGES_ARTIFACT;
    else process.env.TEST_PAGES_ARTIFACT = priorArtifact;
  });
}

test("asset union preserves hashes and compatibility files while replacing declared public files", (t) => {
  const directory = temporary(t);
  const site = join(directory, "dist");
  const archive = join(directory, "archive");
  const publicAssets = join(directory, "public");
  write(archive, "index-oldHash.js", "old application");
  write(archive, "js/herdlink-runtime.js", "old runtime");
  write(archive, "data/daily.csv", "old data");
  write(archive, "screenshots/site.png", "old image");
  write(site, "index-newHash.js", "new application");
  write(site, "screenshots/site.png", "new image");
  write(publicAssets, "screenshots/site.png", "new image");

  mergeAssets(site, archive, publicAssets);
  assert.equal(readFileSync(join(site, "index-oldHash.js"), "utf8"), "old application");
  assert.equal(readFileSync(join(site, "js/herdlink-runtime.js"), "utf8"), "old runtime");
  assert.equal(readFileSync(join(site, "data/daily.csv"), "utf8"), "old data");
  assert.equal(readFileSync(join(archive, "index-newHash.js"), "utf8"), "new application");
  assert.equal(readFileSync(join(archive, "screenshots/site.png"), "utf8"), "new image");

  write(site, "index-newHash.js", "different bytes at the same URL");
  assert.throws(() => mergeAssets(site, archive, publicAssets), /Immutable asset changed/);
  assert.equal(readFileSync(join(archive, "index-newHash.js"), "utf8"), "new application");
});

test("a durable archive survives successive builds without the bootstrap artifact", (t) => {
  const { directory, working, origin } = repository(t);
  const bootstrap = join(directory, "bootstrap");
  write(bootstrap, "assets/index-firstHash.js", "first application");
  write(bootstrap, "assets/js/herdlink-runtime.js", "legacy runtime");
  const artifact = join(directory, "artifact.tar");
  execFileSync("tar", ["-cf", artifact, "-C", bootstrap, "."]);
  artifactCommand(t, directory, artifact);
  write(working, "dist/assets/index-nextHash.js", "next application");
  retainPagesAssets("test/herdlink", working);
  assert.equal(git(origin, "show", "codex/pages-assets:assets/js/herdlink-runtime.js"), "legacy runtime");

  process.env.TEST_PAGES_ARTIFACT = "";
  rmSync(join(working, "dist"), { recursive: true });
  write(working, "dist/assets/index-finalHash.js", "final application");
  retainPagesAssets("test/herdlink", working);
  for (const hash of ["firstHash", "nextHash", "finalHash"]) {
    assert.ok(existsSync(join(working, `dist/assets/index-${hash}.js`)));
    assert.ok(git(origin, "show", `codex/pages-assets:assets/index-${hash}.js`));
  }
  const head = git(origin, "rev-parse", "codex/pages-assets");
  retainPagesAssets("test/herdlink", working);
  assert.equal(git(origin, "rev-parse", "codex/pages-assets"), head);

  write(working, "dist/assets/index-nextHash.js", "conflicting application");
  assert.throws(() => retainPagesAssets("test/herdlink", working), /Immutable asset changed/);
  assert.equal(git(origin, "rev-parse", "codex/pages-assets"), head);
});

test("missing bootstrap artifacts stop deployment before an empty archive can be published", (t) => {
  const { directory, working, origin } = repository(t);
  artifactCommand(t, directory);
  write(working, "dist/assets/index-newHash.js", "new application");
  assert.throws(() => retainPagesAssets("test/herdlink", working), /Cannot retain assets from Pages run 7/);
  assert.equal(git(origin, "branch", "--list", "codex/pages-assets"), "");
});
