import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";
import assert from "node:assert/strict";
import { runContext, TRACE_PATH } from "./context.ts";

const run = promisify(execFile);
const root = process.cwd();

async function context(...args: string[]): Promise<string> {
  const result = await run("node", ["scripts/context.ts", ...args], { cwd: root });
  return result.stdout;
}

test("exact IDs resolve trace context without archive files", async () => {
  const output = await context("UC-SALE-002");
  assert.match(output, /Trace entries: UC-SALE-002/);
  assert.match(output, /docs\/02-use-cases\/UC-SALE-002-post-sale\.md/);
  assert.doesNotMatch(output, /docs\/archive\//);
});

test("feature queries include active UI contracts and reasons", async () => {
  const output = await context("quick-sale");
  assert.match(output, /docs\/design\.md/);
  assert.match(output, /docs\/WEB-ADMIN\.md/);
  assert.match(output, /apps\/web\/src\/app/);
  assert.match(output, /filename match|body-text match|trace-linked/);
  assert.doesNotMatch(output, /docs\/archive\//);
});

test("folder queries preserve scope and exclude archive", async () => {
  const output = await context("docs/10-ai-coding");
  assert.match(output, /Scope: docs\/10-ai-coding/);
  assert.match(output, /docs\/10-ai-coding\/REPO_MAP\.md/);
  assert.doesNotMatch(output, /docs\/archive\//);
});

test("JSON output is stable for tooling", async () => {
  const output = await context("--json", "UC-SALE-002");
  const parsed = JSON.parse(output) as {
    exactIds: string[];
    docs: Array<{ path: string; reasons: string[] }>;
    validation: string[];
  };
  assert.deepEqual(parsed.exactIds, ["UC-SALE-002"]);
  assert.ok(parsed.docs.length > 0);
  assert.ok(parsed.docs[0]?.reasons.includes("exact ID"));
  assert.ok(parsed.validation.includes("pnpm trace:check"));
});

test("archive paths are excluded from free-text candidates by default", async () => {
  const result = await runContext(
    "bootstrap-progress",
    {},
    {
      trackedFiles: async () => ["docs/archive/bootstrap-progress.md", "docs/README.md"],
      searchContent: async (_query, candidates) => {
        assert.deepEqual(candidates, ["docs/README.md"]);
        return [];
      },
    },
  );
  assert.deepEqual(result.docs, []);
});

test("lockfiles and migration snapshots are not scanned", async () => {
  const readPaths: string[] = [];
  const result = await runContext(
    "migration",
    {},
    {
      trackedFiles: async () => [
        "pnpm-lock.yaml",
        "packages/db/migrations/meta/_journal.json",
        "docs/migration.md",
      ],
      searchContent: async (_query, candidates) => {
        assert.deepEqual(candidates, ["docs/migration.md"]);
        return ["docs/migration.md"];
      },
      readText: async (path) => {
        readPaths.push(path);
        return "# Migration\n";
      },
    },
  );
  assert.deepEqual(readPaths, ["docs/migration.md"]);
  assert.deepEqual(
    result.docs.map((item) => item.path),
    ["docs/migration.md"],
  );
});

test("exact-ID retrieval reads only trace data, never the repository", async () => {
  const readPaths: string[] = [];
  const result = await runContext(
    "UC-SALE-002",
    {},
    {
      readText: async (path) => {
        readPaths.push(path);
        assert.equal(path, TRACE_PATH);
        return `use_cases:\n  UC-SALE-002:\n    doc: docs/sale.md\n    tests: [TC-SALE-002]\n    implementation: [apps/api/src/sale.ts]\n`;
      },
      pathExists: () => true,
      searchTests: async (ids) => {
        assert.deepEqual(ids, ["UC-SALE-002", "TC-SALE-002"]);
        return ["apps/api/src/sale.app.test.ts"];
      },
    },
  );
  assert.deepEqual(readPaths, [TRACE_PATH]);
  assert.deepEqual(
    result.docs.map((item) => item.path),
    ["docs/sale.md"],
  );
  assert.deepEqual(
    result.implementation.map((item) => item.path),
    ["apps/api/src/sale.ts"],
  );
  assert.deepEqual(
    result.tests.map((item) => item.path),
    ["apps/api/src/sale.app.test.ts"],
  );
});

test("higher-relevance free-text matches appear first", async () => {
  const result = await runContext(
    "sale",
    {},
    {
      trackedFiles: async () => ["docs/sale.md", "src/sale-service.ts", "src/other.ts"],
      searchContent: async () => ["docs/sale.md", "src/sale-service.ts", "src/other.ts"],
      readText: async (path) => {
        if (path === "docs/sale.md") return "# Sale\n";
        if (path === "src/sale-service.ts") return "export function saleService() {}\n";
        return "// sale appears in a comment\n";
      },
    },
  );
  assert.deepEqual(
    result.docs.map((item) => item.path),
    ["docs/sale.md"],
  );
  assert.deepEqual(
    result.implementation.map((item) => item.path),
    ["src/sale-service.ts", "src/other.ts"],
  );
  assert.ok((result.implementation[0]?.score ?? 0) > (result.implementation[1]?.score ?? 0));
  assert.ok(result.implementation[0]?.reasons.includes("filename match"));
  assert.ok(result.implementation[1]?.reasons.includes("body-text match"));
});
