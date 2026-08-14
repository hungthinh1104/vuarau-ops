import { spawnSync } from "node:child_process";

export type ReleaseManifest = {
  readonly releaseSha: string;
  readonly diffCheckPassed: boolean;
  readonly treeClean: boolean;
};

function git(
  args: readonly string[],
  cwd: string,
): { readonly status: number | null; readonly stdout: string } {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout };
}

/** One exact-SHA identity shared by release, rehearsal and evidence wrappers. */
export function currentReleaseManifest(cwd = process.cwd()): ReleaseManifest {
  const sha = git(["rev-parse", "HEAD"], cwd);
  const diff = git(["diff", "--check"], cwd);
  const status = git(["status", "--porcelain"], cwd);
  return {
    releaseSha: sha.status === 0 ? sha.stdout.trim() : "",
    diffCheckPassed: diff.status === 0,
    treeClean: status.status === 0 && status.stdout.trim().length === 0,
  };
}

export function requireCleanReleaseManifest(manifest: ReleaseManifest): void {
  if (!/^[0-9a-f]{40}$/.test(manifest.releaseSha)) {
    throw new Error("release manifest could not resolve an exact HEAD SHA.");
  }
  if (!manifest.diffCheckPassed || !manifest.treeClean) {
    throw new Error("release manifest requires a clean tree and passing git diff --check.");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const manifest = currentReleaseManifest();
  console.log(JSON.stringify(manifest, null, 2));
  if (!manifest.diffCheckPassed || !manifest.treeClean) process.exitCode = 1;
}
