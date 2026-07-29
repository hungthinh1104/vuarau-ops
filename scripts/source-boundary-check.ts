import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const WARN_LINES = 450;
const FAIL_LINES = 700;
const COMPOSITION_MAX_LINES = 250;

const COMPOSITION_FILES = new Set([
  "packages/db/src/repositories/index.ts",
  "packages/db/src/repositories/read-queries.ts",
  "apps/api/src/infrastructure/persistence/in-memory/in-memory-unit-of-work.ts",
  "apps/api/src/infrastructure/persistence/in-memory/index.ts",
  "apps/api/src/infrastructure/persistence/in-memory/transaction.ts",
  "apps/api/src/infrastructure/trpc/router.ts",
]);

const ALLOWLIST_SEGMENTS = [
  "/migrations/",
  "/generated/",
  "/fixtures/",
  "/e2e/",
  "/storybook-static/",
  "/.next/",
];

function isAllowlisted(path: string): boolean {
  const normalized = `/${path}`;
  return (
    ALLOWLIST_SEGMENTS.some((segment) => normalized.includes(segment)) ||
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

async function main(): Promise<void> {
  const failures: string[] = [];
  const warnings: string[] = [];
  let checked = 0;

  for (const root of ["apps", "packages"]) {
    for await (const file of sourceFiles(join(ROOT, root))) {
      const path = relative(ROOT, file);
      if (isAllowlisted(path)) continue;
      checked += 1;
      const source = await readFile(file, "utf8");
      const lines = source.split(/\r?\n/).length;
      if (lines > FAIL_LINES) failures.push(`${path}: ${lines} lines (maximum ${FAIL_LINES})`);
      else if (lines > WARN_LINES) warnings.push(`${path}: ${lines} lines`);

      if (COMPOSITION_FILES.has(path)) {
        if (lines > COMPOSITION_MAX_LINES)
          failures.push(
            `${path}: composition file has ${lines} lines (maximum ${COMPOSITION_MAX_LINES})`,
          );
        if (containsRawSql(source)) failures.push(`${path}: composition file contains raw SQL`);
      }
    }
  }

  for (const warning of warnings) console.warn(`⚠ source-boundary-check: ${warning}`);
  if (failures.length > 0) {
    console.error(`✗ source-boundary-check: ${failures.length} violation(s)`);
    for (const failure of failures) console.error(`  ${failure}`);
    process.exit(1);
  }
  console.log(
    `✓ source-boundary-check: ${checked} hand-written files checked; ${warnings.length} warning(s).`,
  );
}

await main();
