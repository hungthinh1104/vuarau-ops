import assert from "node:assert/strict";
import { test } from "node:test";
import { collectTraceTestsFromSource, testLayerForPath } from "./trace-collector.ts";

test("collects a trace id from a real test title and classifies its Vitest layer", () => {
  const collected = collectTraceTestsFromSource(
    'describe("TC-DEMO-001", () => it("runs", () => undefined));',
    "packages/domain-kernel/src/demo.test.ts",
  );
  assert.deepEqual(
    collected.map(({ id, layer, evidence }) => ({ id, layer, evidence })),
    [{ id: "TC-DEMO-001", layer: "domain", evidence: "test-title" }],
  );
});

test("only accepts an attached trace comment when the following call is a collected test", () => {
  const collected = collectTraceTestsFromSource(
    '// TC-DEMO-002\nit("runs", () => undefined);\nconst note = "TC-DEMO-003";',
    "apps/api/src/modules/demo/demo.app.test.ts",
  );
  assert.deepEqual(
    collected.map(({ id, evidence }) => ({ id, evidence })),
    [{ id: "TC-DEMO-002", evidence: "attached-test-comment" }],
  );
});

test("collects IDs from decorated suites and deduplicates title/comment evidence", () => {
  const collected = collectTraceTestsFromSource(
    '// TC-DEMO-004\ndescribe.skipIf(false)("TC-DEMO-005", () => undefined);',
    "apps/api/src/infrastructure/demo/demo.app.test.ts",
  );
  assert.deepEqual(
    collected.map(({ id, evidence, layer }) => ({ id, evidence, layer })),
    [
      { id: "TC-DEMO-005", evidence: "test-title", layer: "application" },
      { id: "TC-DEMO-004", evidence: "attached-test-comment", layer: "application" },
    ],
  );
});

test("classifies every configured execution layer explicitly", () => {
  assert.equal(
    testLayerForPath("apps/api/src/infrastructure/trpc/router.contract.test.ts"),
    "contract",
  );
  assert.equal(
    testLayerForPath("apps/api/src/infrastructure/persistence/drizzle/full.db.test.ts"),
    "db",
  );
  assert.equal(testLayerForPath("apps/web/e2e/payment.spec.ts"), "e2e");
  assert.equal(testLayerForPath("apps/web/src/ui/button.test.tsx"), "web");
  assert.equal(testLayerForPath("scripts/docs-check.test.ts"), "check");
});
