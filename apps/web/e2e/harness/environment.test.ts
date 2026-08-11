import assert from "node:assert/strict";
import test from "node:test";
import { assertE2eDatabaseBoundary, parseE2EPort } from "./environment.ts";

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

test("E2E database boundary accepts only wrapper-owned disposable targets", () => {
  assert.doesNotThrow(() =>
    assertE2eDatabaseBoundary(
      "web-e2e-wrapper",
      "postgres://postgres:postgres@127.0.0.1:55432/vuarau_e2e_abcdef123456_123456789abc_test",
    ),
  );
  assert.doesNotThrow(() =>
    assertE2eDatabaseBoundary(
      "pilot-dry-run",
      "postgres://postgres:postgres@localhost:55432/vuarau_pilot_abcdef123456_123456789abc_test",
    ),
  );
});

test("E2E database boundary refuses direct shared or remote targets", () => {
  assert.throws(
    () =>
      assertE2eDatabaseBoundary(
        "web-e2e-wrapper",
        "postgres://postgres:postgres@127.0.0.1:55432/vuarau_test",
      ),
    /disposable local PostgreSQL/,
  );
  assert.throws(
    () =>
      assertE2eDatabaseBoundary(
        undefined,
        "postgres://postgres:postgres@127.0.0.1:55432/vuarau_e2e_abcdef123456_123456789abc_test",
      ),
    /E2E_DATABASE_OWNER/,
  );
  assert.throws(
    () =>
      assertE2eDatabaseBoundary(
        "web-e2e-wrapper",
        "postgres://postgres:postgres@db.example.test:5432/vuarau_e2e_abcdef123456_123456789abc_test",
      ),
    /disposable local PostgreSQL/,
  );
});
