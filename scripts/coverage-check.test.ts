import assert from "node:assert/strict";
import { test } from "node:test";
import { changedLinesFromDiff, uncoveredChangedLines } from "./coverage-check.ts";

test("parses added lines from a zero-context git diff", () => {
  const changed = changedLinesFromDiff(
    "diff --git a/apps/api/src/example.ts b/apps/api/src/example.ts\n+++ b/apps/api/src/example.ts\n@@ -2,0 +3,2 @@\n+const a = 1;\n+const b = 2;",
  );
  assert.deepEqual([...changed.get("apps/api/src/example.ts")!], [3, 4]);
});

test("reports uncovered changed executable lines without imposing a global threshold", () => {
  const uncovered = uncoveredChangedLines(
    new Map([["packages/domain-kernel/src/example.ts", new Set([3, 4])]]),
    {
      "packages/domain-kernel/src/example.ts": {
        statementMap: { "0": { start: { line: 3 }, end: { line: 3 } } },
        s: { "0": 0 },
        fnMap: {},
        f: {},
        branchMap: {},
        b: {},
      },
    },
  );
  assert.deepEqual(uncovered, [{ file: "packages/domain-kernel/src/example.ts", line: 3 }]);
});
