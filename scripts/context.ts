import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { parse } from "yaml";

const ROOT = process.cwd();
const TRACE_PATH = "docs/08-qa/trace-map.yml";
const ID_PATTERN = /\b(?:ADR-\d{4}|(?:UC|BR|CASE|TC|ASM|T)-[A-Z0-9]+-\d{3})\b/g;
const SOURCE_EXTENSIONS = new Set([".md", ".yml", ".yaml", ".ts", ".tsx", ".json"]);
const ARCHIVE_PREFIX = "docs/archive/";

type TraceEntry = {
  readonly title?: string;
  readonly doc?: string;
  readonly rules?: readonly string[];
  readonly cases?: readonly string[];
  readonly tests?: readonly string[];
  readonly implementation?: readonly string[];
};

type TraceMap = Record<string, Record<string, TraceEntry>>;

async function filesUnder(directory: string, includeArchive: boolean): Promise<string[]> {
  const output: string[] = [];
  const walk = async (current: string): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(current, entry.name);
      const path = relative(ROOT, full).replaceAll("\\", "/");
      if (entry.isDirectory()) {
        if (
          entry.name === "node_modules" ||
          entry.name === "dist" ||
          entry.name === ".next" ||
          entry.name === "test-results" ||
          entry.name === "playwright-report" ||
          entry.name === "storybook-static"
        )
          continue;
        if (!includeArchive && path === "docs/archive") continue;
        await walk(full);
        continue;
      }
      const extension = entry.name.slice(entry.name.lastIndexOf("."));
      if (
        SOURCE_EXTENSIONS.has(extension) &&
        (includeArchive || !path.startsWith(ARCHIVE_PREFIX))
      ) {
        output.push(path);
      }
    }
  };
  await walk(directory);
  return output.sort();
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function idsIn(value: string): string[] {
  return unique(value.match(ID_PATTERN) ?? []);
}

function pathExists(path: string): boolean {
  return existsSync(join(ROOT, path));
}

function entryIds(entry: TraceEntry): string[] {
  return unique([
    ...(entry.rules ?? []),
    ...(entry.cases ?? []),
    ...(entry.tests ?? []),
    ...idsIn(entry.doc ?? ""),
  ]);
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
  if (joined.includes("apps/api/") && !joined.includes(".db.test.")) {
    commands.add("pnpm test:application");
  }
  if (joined.includes("packages/db/") || joined.includes(".db.test.")) commands.add("pnpm test:db");
  if (joined.includes("apps/web/e2e/")) commands.add("pnpm web:e2e");
  if (joined.includes("apps/web/") && joined.includes("stories"))
    commands.add("pnpm web:storybook");
  return [...commands];
}

const args = process.argv.slice(2);
const includeArchive = args.includes("--include-archive");
const jsonOutput = args.includes("--json");
const query = args
  .filter((arg) => arg !== "--include-archive" && arg !== "--json")
  .join(" ")
  .trim();

if (query.length === 0) {
  console.error("Usage: pnpm context [--include-archive] <query>");
  process.exit(1);
}

const trace = parse(await readFile(join(ROOT, TRACE_PATH), "utf8")) as TraceMap;
const traceEntries = new Map<string, TraceEntry>();
for (const section of Object.values(trace)) {
  for (const [id, entry] of Object.entries(section ?? {})) traceEntries.set(id, entry);
}

const requestedIds = idsIn(query.toUpperCase());
const matchedTraceIds = new Set<string>();
const matchedEntries: TraceEntry[] = [];
for (const id of requestedIds) {
  const direct = traceEntries.get(id);
  if (direct !== undefined) {
    matchedTraceIds.add(id);
    matchedEntries.push(direct);
  }
  for (const [entryId, entry] of traceEntries) {
    if (entryIds(entry).includes(id)) {
      matchedTraceIds.add(entryId);
      matchedEntries.push(entry);
    }
  }
}

const relatedIds = unique([...requestedIds, ...matchedEntries.flatMap(entryIds)]);
const relatedEntries = new Map<string, TraceEntry>();
for (const id of relatedIds) {
  const entry = traceEntries.get(id);
  if (entry !== undefined) relatedEntries.set(id, entry);
}
const allFiles = await filesUnder(ROOT, includeArchive);
const contents = new Map<string, string>();
for (const file of allFiles) {
  try {
    contents.set(file, await readFile(join(ROOT, file), "utf8"));
  } catch {
    // Ignore a generated or concurrently removed file.
  }
}

const normalizedQueryPath = query.replaceAll("\\", "/").replace(/\/$/, "");
const folderQuery =
  existsSync(join(ROOT, normalizedQueryPath)) && !normalizedQueryPath.includes(".")
    ? normalizedQueryPath
    : null;
const scopedFiles =
  folderQuery === null
    ? allFiles
    : allFiles.filter((file) => file === folderQuery || file.startsWith(`${folderQuery}/`));
const folderIds =
  folderQuery === null
    ? []
    : unique(scopedFiles.flatMap((file) => idsIn(contents.get(file) ?? "")));
const searchIds = unique([...requestedIds, ...folderIds]);
for (const id of folderIds) {
  const direct = traceEntries.get(id);
  if (direct !== undefined) {
    matchedTraceIds.add(id);
    matchedEntries.push(direct);
    relatedEntries.set(id, direct);
  }
  for (const [entryId, entry] of traceEntries) {
    if (entryIds(entry).includes(id)) {
      matchedTraceIds.add(entryId);
      matchedEntries.push(entry);
      relatedEntries.set(entryId, entry);
    }
  }
}

const traceDocs = unique(
  [...matchedEntries, ...relatedEntries.values()].flatMap((entry) =>
    entry.doc ? [entry.doc] : [],
  ),
).filter(pathExists);
const directImplementation = unique(
  [...matchedEntries, ...relatedEntries.values()].flatMap((entry) => entry.implementation ?? []),
).filter(pathExists);
const directTests = unique(
  [...matchedEntries, ...relatedEntries.values()].flatMap((entry) => entry.tests ?? []),
);
const idHits = scopedFiles.filter((file) => {
  const source = contents.get(file) ?? "";
  return searchIds.some((id) => new RegExp(`\\b${id}\\b`).test(source));
});
const queryLower = query.toLocaleLowerCase("vi");
const pathHits = scopedFiles.filter((file) => file.toLocaleLowerCase("vi").includes(queryLower));
const textHits = scopedFiles.filter((file) =>
  (contents.get(file) ?? "").toLocaleLowerCase("vi").includes(queryLower),
);
const featureHits = unique([...pathHits, ...textHits]);
const uiDesignDocs = allFiles.filter((file) =>
  /^docs\/(?:design|WEB-ADMIN|MOBILE-POS)\.md$/.test(file),
);
const surfaceDocs =
  folderQuery === null && featureHits.some((file) => file.startsWith("apps/web/"))
    ? uiDesignDocs
    : [];

const docs =
  folderQuery !== null && folderQuery.startsWith("docs/")
    ? scopedFiles.filter((file) => /\.(md|ya?ml)$/.test(file))
    : unique([
        ...traceDocs,
        ...surfaceDocs,
        ...(requestedIds.length > 0
          ? idHits.filter(
              (file) =>
                file.startsWith("docs/") &&
                requestedIds.some((id) => (contents.get(file) ?? "").includes(id)),
            )
          : featureHits.filter((file) => file.startsWith("docs/"))),
      ]).slice(0, 20);
const implementations =
  folderQuery !== null && !folderQuery.startsWith("docs/")
    ? scopedFiles.filter((file) => !file.includes(".test.") && !file.startsWith("docs/"))
    : unique([
        ...directImplementation,
        ...(requestedIds.length > 0
          ? idHits.filter((file) => !file.startsWith("docs/") && !file.includes(".test."))
          : featureHits.filter((file) => !file.startsWith("docs/") && !file.includes(".test."))),
      ]).slice(0, 24);
const tests =
  folderQuery !== null
    ? scopedFiles.filter((file) => file.includes(".test.") || file.includes("/e2e/"))
    : unique([
        ...idHits.filter((file) => file.includes(".test.") || file.includes("/e2e/")),
        ...featureHits.filter((file) => file.includes(".test.") || file.includes("/e2e/")),
        ...directTests,
      ])
        .filter(pathExists)
        .slice(0, 24);
const retrievalFiles = unique([...docs, ...implementations, ...tests]);
const validationFiles = folderQuery === null ? retrievalFiles : scopedFiles;
const commands = validationCommands(
  validationFiles,
  matchedTraceIds.size > 0 || queryLower.includes("trace"),
);

const result = {
  query,
  archive: includeArchive ? "included" : "excluded by default",
  scope: folderQuery,
  exactIds: requestedIds,
  traceEntries: [...matchedTraceIds],
  docs,
  tests,
  implementation: implementations,
  validation: commands,
};

if (jsonOutput) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`Context: ${query}`);
  console.log(`Archive: ${includeArchive ? "included" : "excluded by default"}`);
  console.log(`Scope: ${folderQuery ?? "repository"}`);
  console.log(`\nExact IDs: ${requestedIds.length > 0 ? requestedIds.join(", ") : "none"}`);
  console.log(
    `Trace entries: ${matchedTraceIds.size > 0 ? [...matchedTraceIds].join(", ") : "none"}`,
  );
  console.log(`\nRelevant docs (${docs.length}):`);
  for (const file of docs) console.log(`  ${file}`);
  console.log(`\nTests (${tests.length}):`);
  for (const file of tests) console.log(`  ${file}`);
  console.log(`\nImplementation (${implementations.length}):`);
  for (const file of implementations) console.log(`  ${file}`);
  console.log(`\nValidation:`);
  for (const command of commands) console.log(`  ${command}`);
}
