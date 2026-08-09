import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyTestFile, inspectTestFiles, styleAssertionFiles } from "./test-architecture.ts";

test("rejects fixed sleeps in browser tests", () => {
  const issues = inspectTestFiles([
    { path: "apps/web/e2e/example.spec.ts", source: "await page.waitForTimeout(100);" },
  ]);
  assert.equal(
    issues.some((issue) => issue.severity === "error"),
    true,
  );
});

test("enforces an explicit budget for oversized tests", () => {
  const issues = inspectTestFiles([
    {
      path: "apps/web/e2e/example.spec.ts",
      source: Array.from({ length: 551 }, () => "line").join("\n"),
    },
  ]);
  assert.deepEqual(
    issues.map((issue) => issue.message),
    ["551 lines exceeds the 550-line test budget"],
  );
});

test("classifies class-name assertions as style-contract tests", () => {
  assert.deepEqual(
    styleAssertionFiles([
      { path: "apps/web/src/ui/button.style.test.tsx", source: "expect(x).toHaveClass('a')" },
      { path: "apps/web/src/ui/behavior.test.tsx", source: "expect(x).toBeVisible()" },
    ]),
    ["apps/web/src/ui/button.style.test.tsx"],
  );
  assert.equal(classifyTestFile("expect(x).toHaveClass('a')"), "style-contract");
  assert.equal(classifyTestFile("expect(x).toBeVisible()"), "behavioral");
});
