import assert from "node:assert/strict";
import { test } from "node:test";
import { PILOT_DRY_RUN_STEPS, validatePilotDatabaseSource } from "./pilot-dry-run.ts";

test("pilot dry-run builds the exact-SHA browser artifact before serving E2E", () => {
  assert.deepEqual(
    PILOT_DRY_RUN_STEPS.slice(-2).map((step) => step.name),
    ["production E2E build", "disposable browser/API/PostgreSQL workflow"],
  );
  assert.deepEqual(PILOT_DRY_RUN_STEPS.at(-2)?.command, ["web:e2e:build"]);
  assert.equal(PILOT_DRY_RUN_STEPS.at(-1)?.databaseMode, "caller-owned");
});

test("pilot dry-run accepts only a local disposable source database", () => {
  const result = validatePilotDatabaseSource(
    "postgres://postgres:postgres@127.0.0.1:55432/vuarau_test",
  );

  assert.equal(result.ok, true);
});

test("pilot dry-run refuses a development database", () => {
  const result = validatePilotDatabaseSource(
    "postgres://postgres:postgres@127.0.0.1:55432/vuarau_dev",
  );

  assert.deepEqual(result, {
    ok: false,
    error:
      "pilot:dry-run requires a source database whose name ends in _test; development databases are refused.",
  });
});

test("pilot dry-run refuses a remote database", () => {
  const result = validatePilotDatabaseSource(
    "postgres://postgres:postgres@db.example.test:5432/vuarau_test",
  );

  assert.deepEqual(result, {
    ok: false,
    error:
      "pilot:dry-run requires a local PostgreSQL source database; remote databases are refused.",
  });
});
