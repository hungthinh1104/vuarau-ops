import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const ROOT = process.cwd();
const REGISTRY_PATH = "docs/10-ai-coding/command-registry.yml";
const TRANSITION_PATH = "docs/03-state-machines/transition-catalog.md";

type CommandEntry = {
  id?: string;
  owner?: string;
  classification?: string;
};

type CommandRegistry = {
  commands?: CommandEntry[];
  catalog_aliases?: Record<string, string>;
};

const CLASSIFICATIONS = new Set([
  "lifecycle",
  "append_only",
  "projection",
  "recovery",
  "control",
  "evidence",
  "policy",
  "master_data",
]);

export function parseRuntimeCommandIds(
  composition: string,
  routerSources: Readonly<Record<string, string>>,
): string[] {
  const namespaceToVariable = new Map<string, string>();
  for (const match of composition.matchAll(/^\s{2}(\w+):\s*(\w+),$/gm)) {
    namespaceToVariable.set(match[2]!, match[1]!);
  }

  const ids: string[] = [];
  for (const source of Object.values(routerSources)) {
    for (const routerMatch of source.matchAll(
      /export const (\w+) = router\(\{([\s\S]*?)\n\}\);/g,
    )) {
      const namespace = namespaceToVariable.get(routerMatch[1]!);
      if (namespace === undefined) continue;
      for (const procedure of routerMatch[2]!.matchAll(/^\s{2}(\w+):\s*commandProcedure\b/gm)) {
        ids.push(`${namespace}.${procedure[1]!}`);
      }
    }
  }
  return [...new Set(ids)].sort();
}

export function transitionCommandNames(markdown: string): string[] {
  const names: string[] = [];
  for (const line of markdown.split("\n")) {
    if (!/^\|\s*T-[A-Z0-9-]+\s*\|/.test(line)) continue;
    const tokens = [...line.matchAll(/`([^`]+)`/g)].map((match) => match[1]!);
    // State cells are lower-case; effect cells can contain values such as
    // `+total`. Business command aliases are the PascalCase token.
    const command = [...tokens].reverse().find((token) => /^[A-Z][A-Za-z]+$/.test(token));
    if (command !== undefined) names.push(command);
  }
  return [...new Set(names)].sort();
}

export function checkCommandRegistry(args: {
  readonly registry: CommandRegistry;
  readonly runtimeCommandIds: readonly string[];
  readonly traceUseCaseIds: ReadonlySet<string>;
  readonly transitionMarkdown: string;
}): string[] {
  const failures: string[] = [];
  const entries = args.registry.commands ?? [];
  const entryById = new Map<string, CommandEntry>();

  for (const entry of entries) {
    if (typeof entry.id !== "string" || entry.id.length === 0) {
      failures.push("command registry has an entry without an id");
      continue;
    }
    if (entryById.has(entry.id)) failures.push(`command registry duplicates ${entry.id}`);
    entryById.set(entry.id, entry);
    if (typeof entry.owner !== "string" || entry.owner.length === 0) {
      failures.push(`${entry.id}: mutation command has no owning use case`);
    } else if (!args.traceUseCaseIds.has(entry.owner)) {
      failures.push(`${entry.id}: owner ${entry.owner} is absent from trace-map use_cases`);
    }
    if (typeof entry.classification !== "string" || !CLASSIFICATIONS.has(entry.classification)) {
      failures.push(`${entry.id}: missing or invalid mutation classification`);
    }
  }

  const runtime = new Set(args.runtimeCommandIds);
  for (const id of args.runtimeCommandIds) {
    if (!entryById.has(id)) failures.push(`runtime mutation ${id} has no command-registry owner`);
  }
  for (const id of entryById.keys()) {
    if (!runtime.has(id)) failures.push(`command registry names non-runtime mutation ${id}`);
  }

  const aliases = args.registry.catalog_aliases ?? {};
  for (const name of transitionCommandNames(args.transitionMarkdown)) {
    const target = aliases[name];
    if (target === undefined) {
      failures.push(`transition catalog command ${name} has no registry alias`);
    } else if (!runtime.has(target)) {
      failures.push(`transition catalog command ${name} aliases non-runtime mutation ${target}`);
    }
  }

  return failures;
}

function runtimeSources(): Record<string, string> {
  const directory = join(ROOT, "apps/api/src/infrastructure/trpc/routers");
  return Object.fromEntries(
    readdirSync(directory)
      .filter((name) => name.endsWith(".ts"))
      .map((name) => [name, readFileSync(join(directory, name), "utf8")]),
  );
}

function main(): void {
  const registry = parse(readFileSync(join(ROOT, REGISTRY_PATH), "utf8")) as CommandRegistry;
  const runtimeCommandIds = parseRuntimeCommandIds(
    readFileSync(join(ROOT, "apps/api/src/infrastructure/trpc/router.ts"), "utf8"),
    runtimeSources(),
  );
  const trace = parse(readFileSync(join(ROOT, "docs/08-qa/trace-map.yml"), "utf8")) as {
    use_cases?: Record<string, unknown>;
  };
  const failures = checkCommandRegistry({
    registry,
    runtimeCommandIds,
    traceUseCaseIds: new Set(Object.keys(trace.use_cases ?? {})),
    transitionMarkdown: readFileSync(join(ROOT, TRANSITION_PATH), "utf8"),
  });
  if (failures.length > 0) {
    console.error(`✗ command-registry-check: ${failures.length} failure(s)`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(
    `✓ command-registry-check: ${runtimeCommandIds.length} mutation commands, ` +
      `${transitionCommandNames(readFileSync(join(ROOT, TRANSITION_PATH), "utf8")).length} transition aliases resolve.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
