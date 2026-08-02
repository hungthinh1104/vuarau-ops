import assert from "node:assert/strict";
import test from "node:test";
import { parseE2EPort } from "./environment.ts";

test("E2E port defaults when the override is absent or empty", () => {
  assert.equal(parseE2EPort(undefined, 3102), 3102);
  assert.equal(parseE2EPort("", 3102), 3102);
  assert.equal(parseE2EPort("  ", 3102), 3102);
});

test("E2E port accepts an explicit safe TCP port", () => {
  assert.equal(parseE2EPort("3202", 3102), 3202);
});

test("E2E port rejects values that could not safely configure a server", () => {
  assert.throws(() => parseE2EPort("3102; rm -rf /", 3102), /must be an integer/);
  assert.throws(() => parseE2EPort("80", 3102), /between 1024 and 65535/);
  assert.throws(() => parseE2EPort("65536", 3102), /between 1024 and 65535/);
});
