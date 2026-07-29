import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import type { SourceBoundaryManifest } from "./source-boundary-manifest.ts";

export interface SourceBoundaryResult {
  readonly checked: number;
  readonly failures: readonly string[];
  readonly warnings: readonly string[];
}

function isAllowlisted(path: string, manifest: SourceBoundaryManifest): boolean {
  const normalized = `/${path}`;
  return (
    manifest.allowlistSegments.some((segment) => normalized.includes(segment)) ||
    path.includes(".generated.") ||
    path.endsWith("_snapshot.json") ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(path)
  );
}

async function* sourceFiles(directory: string): AsyncGenerator<string> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* sourceFiles(fullPath);
    } else if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
      yield fullPath;
    }
  }
}

function containsRawSql(source: string): boolean {
  return (
    /\bsql\s*`/.test(source) ||
    /\b(?:select|insert|update|delete)\s+[\s\S]{0,40}\b(?:from|into|set)\b/i.test(source)
  );
}

export async function checkSourceBoundaries(
  root: string,
  manifest: SourceBoundaryManifest,
): Promise<SourceBoundaryResult> {
  const failures: string[] = [];
  const warnings: string[] = [];
  const compositionFiles = new Set(manifest.compositionFiles);
  let checked = 0;

  for (const sourceRoot of manifest.sourceRoots) {
    for await (const file of sourceFiles(join(root, sourceRoot))) {
      const path = relative(root, file);
      if (isAllowlisted(path, manifest)) continue;
      checked += 1;
      const source = await readFile(file, "utf8");
      const lines = source.split(/\r?\n/).length;

      if (compositionFiles.has(path)) {
        if (lines > manifest.compositionMaximumLines) {
          failures.push(
            `${path}: composition file has ${lines} lines (maximum ${manifest.compositionMaximumLines})`,
          );
        }
        if (containsRawSql(source)) failures.push(`${path}: composition file contains raw SQL`);
        continue;
      }

      if (lines > manifest.failureLines) {
        failures.push(`${path}: ${lines} lines (maximum ${manifest.failureLines})`);
      } else if (lines > manifest.warningLines) {
        warnings.push(`${path}: ${lines} lines`);
      }
    }
  }

  return { checked, failures, warnings };
}
