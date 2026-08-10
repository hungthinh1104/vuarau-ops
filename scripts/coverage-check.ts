import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

type CoverageFile = {
  readonly statementMap: Record<
    string,
    { readonly start: { readonly line: number }; readonly end: { readonly line: number } }
  >;
  readonly s: Record<string, number>;
  readonly fnMap: Record<string, { readonly name: string }>;
  readonly f: Record<string, number>;
  readonly branchMap: Record<string, unknown>;
  readonly b: Record<string, readonly number[]>;
};

type CoverageSummary = {
  readonly total: {
    readonly branches: { readonly pct: number };
    readonly functions: { readonly pct: number };
  };
};

export function changedLinesFromDiff(diff: string): ReadonlyMap<string, ReadonlySet<number>> {
  const changed = new Map<string, Set<number>>();
  let currentFile: string | null = null;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ b/")) {
      currentFile = line.slice("+++ b/".length);
      if (currentFile === "/dev/null") currentFile = null;
      if (currentFile !== null && !changed.has(currentFile)) changed.set(currentFile, new Set());
      continue;
    }
    if (!line.startsWith("@@") || currentFile === null) continue;
    const match = /\+(\d+)(?:,(\d+))?/.exec(line);
    if (match === null) continue;
    const start = Number(match[1]);
    const count = Number(match[2] ?? "1");
    const lines = changed.get(currentFile)!;
    for (let offset = 0; offset < count; offset += 1) lines.add(start + offset);
  }
  return changed;
}

function sourceFileForCoverage(path: string): string {
  return relative(process.cwd(), resolve(path)).replaceAll("\\", "/");
}

function isChangedProductionSource(path: string): boolean {
  return (
    /^(?:apps\/[^/]+\/src|packages\/[^/]+\/src)\//.test(path) &&
    /\.(ts|tsx)$/.test(path) &&
    !/(?:\.test|\.spec)\.tsx?$/.test(path) &&
    !path.endsWith(".d.ts") &&
    // Performance rehearsals are executable release evidence, not product
    // runtime. They are exercised by perf:production-scale and the release
    // gate, not by the Vitest coverage process.
    !path.startsWith("packages/db/src/performance/")
  );
}

function changedBase(): string {
  const configured = process.env["COVERAGE_BASE"]?.trim();
  return configured === undefined || configured === "" || /^0+$/.test(configured)
    ? "HEAD^"
    : configured;
}

function gitDiff(): string {
  try {
    return execFileSync("git", ["diff", "--unified=0", "--no-ext-diff", changedBase(), "--"], {
      encoding: "utf8",
    });
  } catch (error) {
    throw new Error(`Cannot compute coverage base ${changedBase()}: ${String(error)}`);
  }
}

export function uncoveredChangedLines(
  changed: ReadonlyMap<string, ReadonlySet<number>>,
  coverage: Readonly<Record<string, CoverageFile>>,
): readonly { file: string; line: number }[] {
  const uncovered: { file: string; line: number }[] = [];
  for (const [file, lines] of changed) {
    if (!isChangedProductionSource(file)) continue;
    const normalized = sourceFileForCoverage(file);
    const entry =
      coverage[file] ??
      coverage[normalized] ??
      coverage[resolve(file)] ??
      Object.entries(coverage).find(([key]) => sourceFileForCoverage(key) === normalized)?.[1];
    if (entry === undefined) {
      for (const line of lines) uncovered.push({ file, line });
      continue;
    }
    for (const line of lines) {
      const statements = Object.entries(entry.statementMap).filter(
        ([, range]) => range.start.line <= line && range.end.line >= line,
      );
      if (statements.length > 0 && statements.every(([id]) => (entry.s[id] ?? 0) === 0)) {
        uncovered.push({ file, line });
      }
    }
  }
  return uncovered;
}

export function runCoverageCheck(): void {
  const summaryPath = resolve("coverage/coverage-summary.json");
  const finalPath = resolve("coverage/coverage-final.json");
  if (!existsSync(summaryPath) || !existsSync(finalPath)) {
    throw new Error("Coverage artefacts are missing. Run pnpm coverage:report first.");
  }

  const summary = JSON.parse(readFileSync(summaryPath, "utf8")) as CoverageSummary;
  const coverage = JSON.parse(readFileSync(finalPath, "utf8")) as Record<string, CoverageFile>;
  console.log(
    `✓ coverage report: branches ${summary.total.branches.pct}%, functions ${summary.total.functions.pct}% ` +
      "(report-only global metrics)",
  );

  const uncovered = uncoveredChangedLines(changedLinesFromDiff(gitDiff()), coverage);
  if (uncovered.length > 0) {
    console.error("✗ changed production lines are not covered by the collected tests:");
    for (const item of uncovered) console.error(`  • ${item.file}:${item.line}`);
    process.exitCode = 1;
    return;
  }
  console.log("✓ changed-code coverage: every changed executable line has a covered statement");
}

if (import.meta.url === `file://${process.argv[1]}`) runCoverageCheck();
