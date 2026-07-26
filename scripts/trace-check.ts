import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "yaml";

/**
 * Verifies the traceability chain in docs/08-qa/trace-map.yml:
 *
 *   use case → business rule → case → test → implementation
 *
 * It answers one question — *are these links real?* — and deliberately does not
 * become a requirements-management platform (ADR-0005). It cannot check whether
 * documentation is **true**; that is what the review checklist is for.
 */

const ROOT = process.cwd();
const TRACE_MAP = "docs/08-qa/trace-map.yml";

type Entry = {
  title?: string;
  risk?: string;
  doc?: string;
  file?: string;
  rules?: string[];
  cases?: string[];
  tests?: string[];
  implementation?: string[];
  /**
   * `planned` means: specified, agreed, and deliberately not yet built.
   *
   * Such a rule is exempt from "a P0 rule must have an automated test", because
   * the test would have nothing to run against. It is *not* exempt from having a
   * document that defines it — a planned rule with no prose is an idea, not a
   * specification. `planned_tests` names the tests that must exist before the
   * status may change; nothing verifies them until then, by definition.
   *
   * The point of the flag is that the gap is counted and printed on every build
   * instead of being invisible. See docs/08-qa/traceability.md.
   */
  status?: "implemented" | "planned";
  planned_tests?: string[];
};

type TraceMap = {
  use_cases: Record<string, Entry>;
  business_rules: Record<string, Entry>;
  cases: Record<string, Entry>;
  contract_tests?: Record<string, Entry>;
  deprecated?: string[];
};

const failures: string[] = [];
const fail = (message: string) => failures.push(message);

async function* walkTests(directory: string): AsyncGenerator<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      yield* walkTests(full);
    } else if (entry.name.endsWith(".test.ts")) {
      yield full;
    }
  }
}

function idsIn(text: string, prefix: string): Set<string> {
  const pattern = new RegExp(`${prefix}-[A-Z]+-\\d{3}`, "g");
  return new Set(text.match(pattern) ?? []);
}

async function main(): Promise<void> {
  const map = parse(readFileSync(join(ROOT, TRACE_MAP), "utf8")) as TraceMap;

  const useCases = map.use_cases ?? {};
  const rules = map.business_rules ?? {};
  const cases = map.cases ?? {};
  const contractTests = map.contract_tests ?? {};
  const deprecated = new Set(map.deprecated ?? []);

  // ---- 5. duplicate ids ----------------------------------------------------
  const allIds = [
    ...Object.keys(useCases),
    ...Object.keys(rules),
    ...Object.keys(cases),
    ...Object.keys(contractTests),
  ];
  const seen = new Set<string>();
  for (const id of allIds) {
    if (seen.has(id)) {
      fail(`Duplicate id declared in the trace map: ${id}`);
    }
    seen.add(id);
  }

  // ---- collect the TC ids that actually exist in test files ----------------
  const declaredTests = new Set<string>(Object.keys(contractTests));
  const testFileIds = new Map<string, string[]>();

  for (const directory of ["apps", "packages"]) {
    for await (const file of walkTests(join(ROOT, directory))) {
      const source = readFileSync(file, "utf8");
      const relativePath = relative(ROOT, file);
      for (const id of idsIn(source, "TC")) {
        declaredTests.add(id);
        testFileIds.set(id, [...(testFileIds.get(id) ?? []), relativePath]);
      }
      // ---- 4. a test may not name a rule or case that does not exist -------
      for (const ruleId of idsIn(source, "BR")) {
        if (rules[ruleId] === undefined) {
          fail(`${relativePath} names unknown business rule ${ruleId}`);
        }
      }
      for (const caseId of idsIn(source, "CASE")) {
        if (cases[caseId] === undefined) {
          fail(`${relativePath} names unknown case ${caseId}`);
        }
      }
    }
  }

  // ---- 1 & 2. referenced ids and files must exist --------------------------
  const checkRefs = (kind: string, id: string, entry: Entry): void => {
    for (const ruleId of entry.rules ?? []) {
      if (rules[ruleId] === undefined) fail(`${kind} ${id} references unknown rule ${ruleId}`);
    }
    for (const caseId of entry.cases ?? []) {
      if (cases[caseId] === undefined) fail(`${kind} ${id} references unknown case ${caseId}`);
    }
    for (const testId of entry.tests ?? []) {
      if (!declaredTests.has(testId)) {
        fail(`${kind} ${id} references ${testId}, which no test file declares`);
      }
    }
    for (const path of [...(entry.implementation ?? []), entry.doc, entry.file].filter(
      (value): value is string => typeof value === "string",
    )) {
      if (!existsSync(join(ROOT, path))) {
        fail(`${kind} ${id} references missing file ${path}`);
      }
    }
    // ---- 8. the id must actually appear in the document that claims it -----
    if (entry.doc !== undefined && existsSync(join(ROOT, entry.doc))) {
      const doc = readFileSync(join(ROOT, entry.doc), "utf8");
      if (!doc.includes(id)) {
        fail(`${kind} ${id} is not documented in ${entry.doc}`);
      }
    }
  };

  for (const [id, entry] of Object.entries(useCases)) {
    checkRefs("Use case", id, entry);
    // ---- 6. a use case must have at least one business rule ---------------
    if ((entry.rules ?? []).length === 0) {
      fail(`Use case ${id} has no business rule`);
    }
  }

  for (const [id, entry] of Object.entries(rules)) {
    checkRefs("Rule", id, entry);
    if (deprecated.has(id)) continue;

    if (entry.status === "planned") {
      // A planned rule owes prose and a named future test, not a passing one.
      if ((entry.planned_tests ?? []).length === 0) {
        fail(`Planned rule ${id} names no planned test — say what would prove it`);
      }
      if ((entry.implementation ?? []).length > 0) {
        fail(`Rule ${id} is marked planned but names an implementation file`);
      }
      continue;
    }

    // ---- 7. a rule must have at least one case or test --------------------
    if ((entry.cases ?? []).length === 0 && (entry.tests ?? []).length === 0) {
      fail(`Rule ${id} has neither a case nor a test`);
    }
    // ---- 3. every P0 rule must have an automated test ---------------------
    if (entry.risk === "P0" && (entry.tests ?? []).length === 0) {
      fail(`P0 rule ${id} has no automated test — see docs/08-qa/risk-classification.md`);
    }
  }

  for (const [id, entry] of Object.entries(cases)) {
    checkRefs("Case", id, entry);
  }

  // ---- every TC found in a test file must be claimed by the map ------------
  for (const [testId, files] of testFileIds) {
    const referenced =
      Object.values(rules).some((entry) => entry.tests?.includes(testId)) ||
      Object.values(cases).some((entry) => entry.tests?.includes(testId)) ||
      Object.values(useCases).some((entry) => entry.tests?.includes(testId)) ||
      contractTests[testId] !== undefined;
    if (!referenced) {
      fail(`${testId} exists in ${files.join(", ")} but nothing in the trace map references it`);
    }
  }

  const p0Count = Object.values(rules).filter((entry) => entry.risk === "P0").length;
  const plannedCount = Object.values(rules).filter((entry) => entry.status === "planned").length;

  if (failures.length > 0) {
    console.error(`✗ trace-check: ${failures.length} problem(s)\n`);
    for (const failure of failures) {
      console.error(`  • ${failure}`);
    }
    process.exit(1);
  }

  console.log(
    `✓ trace-check: ${Object.keys(useCases).length} use cases, ${Object.keys(rules).length} rules ` +
      `(${p0Count} P0, ${plannedCount} planned), ${Object.keys(cases).length} cases, ` +
      `${declaredTests.size} tests — all links resolve.`,
  );
}

await main();
