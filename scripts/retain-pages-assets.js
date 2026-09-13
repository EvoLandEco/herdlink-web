import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const archiveBranch = "codex/pages-assets";

function files(directory, prefix = "") {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = join(prefix, entry.name);
    if (entry.isDirectory()) return files(join(directory, entry.name), relative);
    if (!entry.isFile()) throw new Error(`Asset must be a regular file: ${relative}`);
    return [relative];
  });
}

export function mergeAssets(siteAssets, archivedAssets, publicAssets) {
  const mutablePaths = new Set(files(publicAssets));
  const currentFiles = files(siteAssets);
  if (!currentFiles.length) throw new Error("The production build has no assets.");

  for (const relative of currentFiles) {
    const source = join(siteAssets, relative);
    const destination = join(archivedAssets, relative);
    if (existsSync(destination) && !readFileSync(source).equals(readFileSync(destination))) {
      if (!mutablePaths.has(relative)) {
        throw new Error(`Immutable asset changed at the same URL: assets/${relative}`);
      }
    }
  }

  // Public files keep their paths; generated files retain every published hash.
  for (const relative of currentFiles) {
    const destination = join(archivedAssets, relative);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(siteAssets, relative), destination);
  }
  cpSync(archivedAssets, siteAssets, { recursive: true });
}

function run(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function bootstrapArchive(repository, directory) {
  const result = JSON.parse(run("gh", [
    "api", `repos/${repository}/actions/workflows/deploy-pages.yml/runs?branch=main&status=success&per_page=1`,
  ]));
  const previous = result.workflow_runs[0];
  if (!previous) throw new Error("No successful Pages deployment is available to seed the asset archive.");
  try {
    run("gh", ["run", "download", String(previous.id), "--repo", repository, "--name", "github-pages", "--dir", directory]);
  } catch (error) {
    throw new Error(`Cannot retain assets from Pages run ${previous.id}. Restore its github-pages artifact before deploying; it may have expired.`, { cause: error });
  }
  run("tar", ["-xf", join(directory, "artifact.tar"), "-C", directory]);
  if (!files(join(directory, "assets")).length) {
    throw new Error(`Pages run ${previous.id} has no assets to retain.`);
  }
}

export function retainPagesAssets(repository, cwd = process.cwd()) {
  if (!repository) throw new Error("GITHUB_REPOSITORY is required.");
  const temporary = mkdtempSync(join(tmpdir(), "herdlink-pages-assets-"));
  const archive = join(temporary, "archive");
  const git = (args, directory = cwd) => run("git", args, directory);
  let worktreeCreated = false;

  try {
    const remoteBranch = git(["ls-remote", "--heads", "origin", `refs/heads/${archiveBranch}`]);
    if (remoteBranch) {
      git(["fetch", "--depth=1", "origin", `refs/heads/${archiveBranch}`]);
      git(["worktree", "add", "--detach", archive, "FETCH_HEAD"]);
      worktreeCreated = true;
      if (!files(join(archive, "assets")).length) throw new Error("The published asset archive is empty.");
    } else {
      const bootstrap = join(temporary, "bootstrap");
      mkdirSync(bootstrap);
      bootstrapArchive(repository, bootstrap);
      git(["worktree", "add", "--detach", archive, "HEAD"]);
      worktreeCreated = true;
      git(["switch", "--orphan", archiveBranch], archive);
      cpSync(join(bootstrap, "assets"), join(archive, "assets"), { recursive: true });
    }

    mergeAssets(join(cwd, "dist/assets"), join(archive, "assets"), join(cwd, "public/assets"));
    git(["add", "assets"], archive);
    if (git(["status", "--porcelain"], archive)) {
      git(["-c", "user.name=github-actions[bot]", "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com", "commit", "-m", "Retain published site assets"], archive);
    }
    // Persist the complete asset set before a deployment can reference it.
    git(["push", "origin", `HEAD:refs/heads/${archiveBranch}`], archive);
  } finally {
    if (worktreeCreated) git(["worktree", "remove", "--force", archive]);
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  retainPagesAssets(process.env.GITHUB_REPOSITORY);
}
