import assert from "node:assert/strict";
import test from "node:test";
import { DESKTOP_GOLDEN_SPECS } from "./projects.ts";

test("desktop keeps the golden cross-device workflow set bounded", () => {
  assert.deepEqual(DESKTOP_GOLDEN_SPECS, [
    "**/payment.spec.ts",
    "**/quick-sale.spec.ts",
    "**/goods-flow.spec.ts",
    "**/depot-operations.spec.ts",
    "**/workflow-hardening.spec.ts",
    "**/ui-shell.spec.ts",
  ]);
  assert.ok(DESKTOP_GOLDEN_SPECS.length < 18);
});
