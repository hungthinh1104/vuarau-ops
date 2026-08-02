import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";
import assert from "node:assert/strict";

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

test("feature queries include the active UI surface contracts", async () => {
  const output = await context("quick-sale");
  assert.match(output, /docs\/design\.md/);
  assert.match(output, /docs\/WEB-ADMIN\.md/);
  assert.match(output, /apps\/web\/src\/app/);
  assert.doesNotMatch(output, /docs\/archive\//);
});

test("folder queries return the complete active folder scope", async () => {
  const output = await context("docs/10-ai-coding");
  assert.match(output, /Scope: docs\/10-ai-coding/);
  assert.match(output, /docs\/10-ai-coding\/REPO_MAP\.md/);
  assert.doesNotMatch(output, /docs\/archive\//);
});

test("JSON output is stable for tooling", async () => {
  const output = await context("--json", "UC-SALE-002");
  const parsed = JSON.parse(output) as { exactIds: string[]; docs: string[]; validation: string[] };
  assert.deepEqual(parsed.exactIds, ["UC-SALE-002"]);
  assert.ok(parsed.docs.length > 0);
  assert.ok(parsed.validation.includes("pnpm trace:check"));
});
