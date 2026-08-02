import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { parse } from "yaml";

const execFile = promisify(execFileCallback);
const ROOT = process.cwd();
export const TRACE_PATH = "docs/08-qa/trace-map.yml";
const ID_PATTERN = /\b(?:ADR-\d{4}|(?:UC|BR|CASE|TC|ASM|T)-[A-Z0-9]+-\d{3})\b/g;
const ARCHIVE_PREFIX = "docs/archive/";
const GENERATED_SEGMENTS = [
  "/node_modules/",
  "/dist/",
  "/.next/",
  "/test-results/",
  "/playwright-report/",
  "/storybook-static/",
  "/coverage/",
];
const EXCLUDED_PATHS = ["pnpm-lock.yaml", "packages/db/migrations/meta/"];
const LIMITS = { docs: 8, implementation: 12, tests: 12 } as const;

type TraceEntry = {
  readonly title?: string;
  readonly doc?: string;
  readonly rules?: readonly string[];
  readonly cases?: readonly string[];
  readonly tests?: readonly string[];
  readonly implementation?: readonly string[];
};

type TraceMap = Record<string, Record<string, TraceEntry>>;
type MatchReason =
  | "exact ID"
  | "exact path"
  | "filename match"
  | "heading/symbol match"
  | "surface-context"
  | "body-text match"
  | "trace-linked";

export type ContextResult = {
  readonly path: string;
  readonly reasons: readonly MatchReason[];
  readonly score: number;
};

export type ContextOutput = {
  readonly query: string;
  readonly archive: "included" | "excluded by default";
  readonly scope: string | null;
  readonly exactIds: readonly string[];
  readonly traceEntries: readonly string[];
  readonly docs: readonly ContextResult[];
  readonly tests: readonly ContextResult[];
  readonly implementation: readonly ContextResult[];
  readonly validation: readonly string[];
};

type ContextOptions = { readonly includeArchive?: boolean; readonly all?: boolean };
type ContextDeps = {
  readonly readText?: (path: string) => Promise<string>;
  readonly trackedFiles?: () => Promise<readonly string[]>;
  readonly searchTests?: (ids: readonly string[]) => Promise<readonly string[]>;
  readonly searchContent?: (
    query: string,
    candidates: readonly string[],
  ) => Promise<readonly string[]>;
  readonly pathExists?: (path: string) => boolean;
};

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

export function idsIn(value: string): string[] {
  return unique(value.match(ID_PATTERN) ?? []);
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function isExcluded(path: string, includeArchive: boolean): boolean {
  const normalized = normalizePath(path);
  if (!includeArchive && normalized.startsWith(ARCHIVE_PREFIX)) return true;
  if (EXCLUDED_PATHS.some((excluded) => normalized === excluded || normalized.startsWith(excluded)))
    return true;
  return GENERATED_SEGMENTS.some((segment) => normalized.includes(segment));
}

function isTest(path: string): boolean {
  return /(?:\.test\.|\.spec\.|\/e2e\/)/.test(path);
}

function isDoc(path: string): boolean {
  return /\.(?:md|ya?ml)$/.test(path);
}

function entryIds(entry: TraceEntry): string[] {
  return unique([
    ...(entry.rules ?? []),
    ...(entry.cases ?? []),
    ...(entry.tests ?? []),
    ...idsIn(entry.doc ?? ""),
  ]);
}

function traceIndex(trace: TraceMap): Map<string, TraceEntry> {
  const entries = new Map<string, TraceEntry>();
  for (const section of Object.values(trace)) {
    for (const [id, entry] of Object.entries(section ?? {})) entries.set(id, entry);
  }
  return entries;
}

function addResult(
  map: Map<string, ContextResult>,
  path: string,
  reasons: readonly MatchReason[],
): void {
  const existing = map.get(path);
  const merged = unique([...(existing?.reasons ?? []), ...reasons]);
  const rank: Record<MatchReason, number> = {
    "exact ID": 100,
    "exact path": 90,
    "trace-linked": 80,
    "filename match": 70,
    "heading/symbol match": 50,
    "surface-context": 40,
    "body-text match": 30,
  };
  map.set(path, {
    path,
    reasons: merged,
    score: Math.max(...merged.map((reason) => rank[reason])),
  });
}

function sortResults(results: Iterable<ContextResult>): ContextResult[] {
  return [...results].sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
}

function limited(results: Iterable<ContextResult>, limit: number, all: boolean): ContextResult[] {
  const sorted = sortResults(results);
  if (all) return sorted;

  // Generic UI contracts provide useful context, but a directly matching
  // feature document must get its place before surface context fills slots.
  const direct = sorted.filter((result) => !result.reasons.includes("surface-context"));
  const surface = sorted.filter((result) => result.reasons.includes("surface-context"));
  return [...direct.slice(0, limit), ...surface].slice(0, limit);
}

async function defaultReadText(path: string): Promise<string> {
  return readFile(join(ROOT, path), "utf8");
}

async function defaultTrackedFiles(): Promise<readonly string[]> {
  const { stdout } = await execFile("git", ["ls-files", "-z"], {
    cwd: ROOT,
    maxBuffer: 4 * 1024 * 1024,
  });
  return stdout
    .split("\0")
    .filter(Boolean)
    .filter((path) => existsSync(join(ROOT, path)))
    .map(normalizePath);
}

async function defaultSearchTests(ids: readonly string[]): Promise<readonly string[]> {
  if (ids.length === 0) return [];
  const args = [
    "-l",
    "--fixed-strings",
    "--hidden",
    "--glob",
    "!docs/archive/**",
    "--glob",
    "!packages/db/migrations/meta/**",
  ];
  for (const id of ids) args.push("-e", id);
  args.push("--glob", "*.test.*", "--glob", "*.spec.*", "--glob", "**/e2e/**", ".");
  try {
    const { stdout } = await execFile("rg", args, { cwd: ROOT, maxBuffer: 2 * 1024 * 1024 });
    return stdout
      .split("\n")
      .filter(Boolean)
      .map((path) => normalizePath(path));
  } catch (error) {
    const exitCode = (error as { code?: number }).code;
    if (exitCode === 1) return [];
    throw error;
  }
}

async function defaultSearchContent(
  query: string,
  candidates: readonly string[],
): Promise<readonly string[]> {
  if (candidates.length === 0) return [];
  try {
    const { stdout } = await execFile("rg", ["-l", "--fixed-strings", "--", query, ...candidates], {
      cwd: ROOT,
      maxBuffer: 4 * 1024 * 1024,
    });
    return stdout.split("\n").filter(Boolean).map(normalizePath);
  } catch (error) {
    if ((error as { code?: number }).code === 1) return [];
    throw error;
  }
}

function validationCommands(files: readonly string[], hasTrace: boolean): string[] {
  const commands = new Set<string>();
  const joined = files.join("\n");
  if (hasTrace) commands.add("pnpm trace:check");
  if (files.some((file) => file.startsWith("docs/"))) commands.add("pnpm docs:check");
  if (joined.includes("apps/web/")) {
    commands.add("pnpm typecheck");
    commands.add("pnpm test:web");
  }
  if (joined.includes("packages/domain-kernel/")) commands.add("pnpm test:domain");
  if (joined.includes("apps/api/") && !joined.includes(".db.test."))
    commands.add("pnpm test:application");
  if (joined.includes("packages/db/") || joined.includes(".db.test.")) commands.add("pnpm test:db");
  if (joined.includes("apps/web/e2e/")) commands.add("pnpm web:e2e");
  if (joined.includes("apps/web/") && joined.includes("stories"))
    commands.add("pnpm web:storybook");
  return [...commands];
}

function classifyFreeText(path: string, query: string, content: string): MatchReason[] {
  const normalizedQuery = query.toLocaleLowerCase("vi");
  const lowerPath = path.toLocaleLowerCase("vi");
  const reasons: MatchReason[] = [];
  if (lowerPath === normalizedQuery) reasons.push("exact path");
  if (lowerPath.split("/").at(-1)?.includes(normalizedQuery)) reasons.push("filename match");
  const lines = content.split("\n");
  if (
    lines.some(
      (line) =>
        /^(?:#|\s*(?:export\s+)?(?:function|class|const|type|interface)\b)/.test(line) &&
        line.toLocaleLowerCase("vi").includes(normalizedQuery),
    )
  ) {
    reasons.push("heading/symbol match");
  }
  if (content.toLocaleLowerCase("vi").includes(normalizedQuery)) reasons.push("body-text match");
  return reasons;
}

function formatTraceResults(
  paths: readonly string[],
  reason: MatchReason,
  existing: Map<string, ContextResult>,
): void {
  for (const path of paths) addResult(existing, normalizePath(path), [reason]);
}

export async function runContext(
  query: string,
  options: ContextOptions = {},
  deps: ContextDeps = {},
): Promise<ContextOutput> {
  const includeArchive = options.includeArchive ?? false;
  const all = options.all ?? false;
  const readText = deps.readText ?? defaultReadText;
  const pathExists = deps.pathExists ?? ((path: string) => existsSync(join(ROOT, path)));
  const exactIds = idsIn(query.toUpperCase());
  const isExact = exactIds.length > 0;
  const docs = new Map<string, ContextResult>();
  const tests = new Map<string, ContextResult>();
  const implementation = new Map<string, ContextResult>();
  const matchedTraceIds = new Set<string>();
  let scope: string | null = null;

  if (isExact) {
    const trace = parse(await readText(TRACE_PATH)) as TraceMap;
    const entries = traceIndex(trace);
    const matchedEntries = new Map<string, TraceEntry>();
    for (const requestedId of exactIds) {
      for (const [entryId, entry] of entries) {
        if (entryId === requestedId || entryIds(entry).includes(requestedId)) {
          matchedTraceIds.add(entryId);
          matchedEntries.set(entryId, entry);
        }
      }
    }
    for (const entry of matchedEntries.values()) {
      if (entry.doc && pathExists(entry.doc) && !isExcluded(entry.doc, includeArchive))
        addResult(docs, entry.doc, ["exact ID"]);
      formatTraceResults(
        (entry.implementation ?? []).filter(
          (path) => pathExists(path) && !isExcluded(path, includeArchive),
        ),
        "exact ID",
        implementation,
      );
    }
    const relatedIds = unique([...exactIds, ...[...matchedEntries.values()].flatMap(entryIds)]);
    const searchTests = deps.searchTests ?? defaultSearchTests;
    for (const path of await searchTests(relatedIds)) {
      if (!isExcluded(path, includeArchive)) addResult(tests, path, ["exact ID"]);
    }
  } else {
    const tracked = (await (deps.trackedFiles ?? defaultTrackedFiles)()).filter(
      (path) => !isExcluded(path, includeArchive),
    );
    const normalizedQuery = query.replaceAll("\\", "/").replace(/\/$/, "");
    const folder = tracked.some((path) => path.startsWith(`${normalizedQuery}/`))
      ? normalizedQuery
      : null;
    scope = folder;
    const candidates = folder
      ? tracked.filter((path) => path === folder || path.startsWith(`${folder}/`))
      : tracked;
    const pathCandidates = candidates.filter((path) =>
      path.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi")),
    );
    const contentMatches = new Set(
      await (deps.searchContent ?? defaultSearchContent)(query, candidates),
    );
    const candidatePaths = unique([...pathCandidates, ...contentMatches]);
    for (const path of candidatePaths) {
      const content = await readText(path);
      const reasons = classifyFreeText(path, query, content);
      if (reasons.length === 0 && pathCandidates.includes(path)) reasons.push("filename match");
      if (reasons.length === 0) continue;
      const resultMap = isDoc(path) ? docs : isTest(path) ? tests : implementation;
      addResult(resultMap, path, reasons);
    }
    if (!folder && candidatePaths.some((path) => path.startsWith("apps/web/"))) {
      for (const path of ["docs/design.md", "docs/WEB-ADMIN.md", "docs/MOBILE-POS.md"]) {
        if (pathExists(path) && !isExcluded(path, includeArchive))
          addResult(docs, path, ["surface-context"]);
      }
    }
  }

  const exhaustiveScope = all || scope !== null;
  const limitedDocs = limited(docs.values(), LIMITS.docs, exhaustiveScope);
  const limitedTests = limited(tests.values(), LIMITS.tests, exhaustiveScope);
  const limitedImplementation = limited(
    implementation.values(),
    LIMITS.implementation,
    exhaustiveScope,
  );
  const files = [...limitedDocs, ...limitedTests, ...limitedImplementation].map(
    (result) => result.path,
  );
  return {
    query,
    archive: includeArchive ? "included" : "excluded by default",
    scope,
    exactIds,
    traceEntries: [...matchedTraceIds],
    docs: limitedDocs,
    tests: limitedTests,
    implementation: limitedImplementation,
    validation: validationCommands(
      files,
      matchedTraceIds.size > 0 || query.toLocaleLowerCase("vi").includes("trace"),
    ),
  };
}

function printResult(result: ContextOutput, jsonOutput: boolean): void {
  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Context: ${result.query}`);
  console.log(`Archive: ${result.archive}`);
  console.log(`Scope: ${result.scope ?? "repository"}`);
  console.log(`\nExact IDs: ${result.exactIds.length ? result.exactIds.join(", ") : "none"}`);
  console.log(
    `Trace entries: ${result.traceEntries.length ? result.traceEntries.join(", ") : "none"}`,
  );
  for (const [label, values] of [
    ["Relevant docs", result.docs],
    ["Tests", result.tests],
    ["Implementation", result.implementation],
  ] as const) {
    console.log(`\n${label} (${values.length}):`);
    for (const value of values) console.log(`  ${value.path} — ${value.reasons.join(", ")}`);
  }
  console.log("\nValidation:");
  for (const command of result.validation) console.log(`  ${command}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const includeArchive = args.includes("--include-archive");
  const jsonOutput = args.includes("--json");
  const all = args.includes("--all");
  const query = args
    .filter((arg) => !arg.startsWith("--"))
    .join(" ")
    .trim();
  if (!query) {
    console.error("Usage: pnpm context [--all] [--include-archive] [--json] <query>");
    process.exitCode = 1;
    return;
  }
  printResult(await runContext(query, { includeArchive, all }), jsonOutput);
}

if (import.meta.url === `file://${process.argv[1]}`) void main();
