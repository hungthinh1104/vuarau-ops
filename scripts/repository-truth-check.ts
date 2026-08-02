import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const failures: string[] = [];
const fail = (message: string) => failures.push(message);
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

function parseRouterSurface() {
  const composition = read("apps/api/src/infrastructure/trpc/router.ts");
  const namespaceToVariable = new Map<string, string>();
  for (const match of composition.matchAll(/^\s{2}(\w+):\s*(\w+),$/gm)) {
    namespaceToVariable.set(match[1]!, match[2]!);
  }

  const commands = new Map<string, string[]>();
  const reads = new Map<string, string[]>();
  const routerDir = join(ROOT, "apps/api/src/infrastructure/trpc/routers");
  for (const name of readdirSync(routerDir).filter((entry) => entry.endsWith(".ts"))) {
    const source = readFileSync(join(routerDir, name), "utf8");
    for (const routerMatch of source.matchAll(
      /export const (\w+) = router\(\{([\s\S]*?)\n\}\);/g,
    )) {
      const variable = routerMatch[1]!;
      const namespace = [...namespaceToVariable].find(([, value]) => value === variable)?.[0];
      if (namespace === undefined) continue;
      const body = routerMatch[2]!;
      const commandNames: string[] = [];
      const readNames: string[] = [];
      for (const procedure of body.matchAll(
        /^\s{2}(\w+):\s*(commandProcedure|authenticatedProcedure)/gm,
      )) {
        (procedure[2] === "commandProcedure" ? commandNames : readNames).push(procedure[1]!);
      }
      commands.set(namespace, commandNames);
      reads.set(namespace, readNames);
    }
  }
  return { commands, reads };
}

function parseMarkdownSurface(path: string, heading: string): Map<string, string[]> {
  const markdown = read(path);
  const start = markdown.indexOf(heading);
  if (start < 0) {
    fail(`${path}: missing ${heading}`);
    return new Map();
  }
  const tail = markdown.slice(start + heading.length);
  const next = tail.search(/\n##\s/);
  const block = next < 0 ? tail : tail.slice(0, next);
  const surface = new Map<string, string[]>();
  for (const line of block.split("\n")) {
    if (!/^\|\s*`/.test(line)) continue;
    const cells = line
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.trim());
    const namespace = cells[0]?.replaceAll("`", "");
    if (!namespace || cells[1] === undefined) continue;
    surface.set(
      namespace,
      [...cells[1].matchAll(/`([^`]+)`/g)].map((match) => match[1]!),
    );
  }
  return surface;
}

function compareSurface(
  label: string,
  actual: Map<string, string[]>,
  documented: Map<string, string[]>,
) {
  const namespaces = new Set([...actual.keys(), ...documented.keys()]);
  for (const namespace of [...namespaces].sort()) {
    const left = actual.get(namespace) ?? [];
    const right = documented.get(namespace) ?? [];
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      fail(`${label} ${namespace}: runtime [${left.join(", ")}] != docs [${right.join(", ")}]`);
    }
  }
}

function checkApiCatalogs() {
  const runtime = parseRouterSurface();
  compareSurface(
    "command catalog",
    runtime.commands,
    parseMarkdownSurface(
      "docs/06-api-contracts/command-contracts.md",
      "## Current command surface",
    ),
  );
  compareSurface(
    "read catalog",
    runtime.reads,
    parseMarkdownSurface("docs/06-api-contracts/read-models.md", "## Current read surface"),
  );
}

function checkDataModelTables() {
  const schemaDir = join(ROOT, "packages/db/src/schema");
  const runtime = new Set<string>();
  for (const name of readdirSync(schemaDir).filter((entry) => entry.endsWith(".ts"))) {
    const source = readFileSync(join(schemaDir, name), "utf8");
    for (const match of source.matchAll(/pgTable\(\s*["']([^"']+)/g)) runtime.add(match[1]!);
  }
  const documented = new Set(
    [...read("docs/07-data/data-model.md").matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map(
      (match) => match[1]!,
    ),
  );
  const missing = [...runtime].filter((table) => !documented.has(table)).sort();
  const extra = [...documented].filter((table) => !runtime.has(table)).sort();
  if (missing.length > 0) fail(`data-model missing schema tables: ${missing.join(", ")}`);
  if (extra.length > 0) fail(`data-model names non-schema tables: ${extra.join(", ")}`);
}

function checkNavigationRoutes() {
  const source = read("apps/web/src/ui/patterns/layout/pilot-navigation.ts");
  const hrefs = new Set([...source.matchAll(/href:\s*"(\/[^"]*)"/g)].map((match) => match[1]!));
  for (const href of hrefs) {
    const page = join(ROOT, "apps/web/src/app/(app)", href.slice(1), "page.tsx");
    if (!existsSync(page)) fail(`navigation href ${href} has no app page: ${page}`);
  }
}

function checkKnownStaleClaims() {
  const guards: readonly [string, RegExp, string][] = [
    [
      "docs/06-api-contracts/ui-state-catalog.md",
      /email field and a code|never a password/i,
      "OTP-era auth copy",
    ],
    [
      "docs/06-api-contracts/command-contracts.md",
      /seven money commands|five lifecycle commands/i,
      "vertical-slice command catalog",
    ],
    [
      "docs/06-api-contracts/read-models.md",
      /nine procedures a first UI needs/i,
      "vertical-slice read catalog",
    ],
    [
      "docs/07-data/data-model.md",
      /only the tables the first vertical slice needs/i,
      "vertical-slice data model",
    ],
  ];
  for (const [path, pattern, label] of guards) {
    if (pattern.test(read(path))) fail(`${path}: stale ${label}`);
  }

  for (const path of [
    "docs/00-product/scope.md",
    "docs/01-domain/glossary.md",
    "docs/00-product/product-invariants.md",
    "docs/02-use-cases/depot-operations-use-cases.md",
    "docs/04-business-rules/goods-flow-rules.md",
    "docs/06-api-contracts/read-models.md",
    "docs/07-data/data-model.md",
  ]) {
    if (/inventory by Product\/unit|per-Product\/unit projection/i.test(read(path))) {
      fail(`${path}: current Goods Truth still describes inventory without QualityGrade`);
    }
  }
}

function checkM25WorkflowClaims() {
  const activeDocPaths = [
    "docs/00-product/product-brief.md",
    "docs/00-product/roadmap.md",
    "docs/00-product/scope.md",
    "docs/02-use-cases/use-case-catalog.md",
    "docs/02-use-cases/use-case-completeness-audit.md",
    "docs/04-business-rules/goods-flow-rules.md",
    "docs/09-decisions/decision-backlog.md",
  ];
  const activeDocs = activeDocPaths.map((path) => [path, read(path)] as const);
  const adr0025 = read("docs/09-decisions/ADR-0025-cashbook-separate-from-debt.md");
  const adr0026 = read("docs/09-decisions/ADR-0026-inspected-intake-and-quality-disposition.md");

  if (
    !/employee-held accounts?\s+name|employee-held accounts?\s+.*CashTransfer|Driver collection does not need a second money system/i.test(
      adr0025,
    )
  ) {
    fail("ADR-0025: missing employee-held cash handover model");
  }
  if (!/GoodsArrival[\s\S]*QualityInspection[\s\S]*QualityDisposition/i.test(adr0026)) {
    fail("ADR-0026: missing Arrival → Inspection → Disposition workflow");
  }

  for (const [path, source] of activeDocs) {
    if (
      /no\s+(?:arrival|inspection|disposition)\s+workflow|arrival[\s\S]{0,100}(?:not|never)\s+(?:implemented|modelled)/i.test(
        source,
      )
    ) {
      fail(`${path}: stale claim that inspected intake is not implemented`);
    }
    if (/driver handover has no cash model|delivery cannot record payment/i.test(source)) {
      fail(`${path}: stale claim that driver cash has no model`);
    }
    if (
      path === "docs/01-domain/glossary.md" &&
      /condition\s*\|\s*\*\*not modelled\*\*|defect\s*\|\s*\*\*not modelled\*\*|disposition\s*\|\s*\*\*not modelled\*\*/i.test(
        source,
      )
    ) {
      fail(`${path}: stale claim that inspected-intake evidence is not modelled`);
    }
  }
}

function checkDecisionRegister() {
  const ids = [
    ...read("docs/09-decisions/decision-backlog.md").matchAll(/^\| ASM-(\d{3})\s*\|/gm),
  ].map((match) => Number(match[1]));
  if (ids.length === 0) {
    fail("decision backlog contains no ASM rows");
    return;
  }
  const unique = new Set(ids);
  if (unique.size !== ids.length) fail("decision backlog contains duplicate ASM identifiers");
  const max = Math.max(...ids);
  const missing = Array.from({ length: max }, (_, index) => index + 1).filter(
    (id) => !unique.has(id),
  );
  if (missing.length > 0)
    fail(
      `decision backlog has gaps: ${missing.map((id) => `ASM-${String(id).padStart(3, "0")}`).join(", ")}`,
    );
}

function checkNextPhasePolicyGates() {
  const backlog = read("docs/09-decisions/decision-backlog.md");
  const requiredIds = Array.from({ length: 10 }, (_, index) => index + 39);
  for (const id of requiredIds) {
    const token = `ASM-${String(id).padStart(3, "0")}`;
    const row = backlog.match(new RegExp(`^\\| ${token} \\|.*$`, "m"))?.[0];
    if (row === undefined) {
      fail(`decision backlog is missing next-phase policy gate ${token}`);
      continue;
    }
    if (!row.includes("**policy-blocked**")) {
      fail(`${token} must remain policy-blocked until field evidence exists`);
    }
    if (!row.includes("m24-policy-closure-worksheet.md")) {
      fail(`${token} is missing the next-phase field worksheet link`);
    }
  }

  for (const path of [
    "docs/00-product/scope.md",
    "docs/00-product/roadmap.md",
    "docs/00-product/validation-plan.md",
    "docs/02-use-cases/use-case-completeness-audit.md",
  ]) {
    const source = read(path);
    if (
      !source.includes("ASM-039") ||
      !(source.includes("ASM-048") || source.includes("ASM-039–048"))
    ) {
      fail(`${path}: next-phase policy gates ASM-039–048 are not represented`);
    }
  }
}

function checkScreenStoryCoverage() {
  const docPath = "docs/08-qa/ui-screen-coverage.md";
  const markdown = read(docPath);
  const rows = [...markdown.matchAll(/^- \[([ x])\] (.+?) — `([^`]+)`$/gm)];
  if (rows.length < 8) fail(`${docPath}: expected a substantive critical-screen checklist`);
  let pending = 0;
  for (const row of rows) {
    const checked = row[1] === "x";
    const label = row[2]!;
    const path = row[3]!;
    if (checked && !existsSync(join(ROOT, path)))
      fail(`${docPath}: checked screen ${label} has no story at ${path}`);
    if (!checked) pending += 1;
  }
  if (
    pending > 0 &&
    !/Repository readiness remains \*\*PENDING\*\*/.test(read("docs/00-product/roadmap.md"))
  ) {
    fail(
      `roadmap claims repository readiness beyond PENDING while ${pending} critical screen stories remain unchecked`,
    );
  }
}

checkApiCatalogs();
checkDataModelTables();
checkNavigationRoutes();
checkKnownStaleClaims();
checkM25WorkflowClaims();
checkDecisionRegister();
checkNextPhasePolicyGates();
checkScreenStoryCoverage();

if (failures.length > 0) {
  console.error(`✗ repository-truth-check: ${failures.length} failure(s)`);
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}
console.warn(
  "✓ repository-truth-check: API/data/docs/navigation/decision/UI coverage mirrors agree.",
);
