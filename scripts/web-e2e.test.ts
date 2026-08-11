import assert from "node:assert/strict";
import { test } from "node:test";
import { buildWebE2eDatabaseName, validateWebE2eDatabaseSource } from "./web-e2e.ts";

test("web E2E accepts only a local disposable source database", () => {
  assert.equal(
    validateWebE2eDatabaseSource("postgres://postgres:postgres@127.0.0.1:55432/vuarau_test").ok,
    true,
  );
  assert.equal(
    validateWebE2eDatabaseSource("postgres://postgres:postgres@db.example.com/vuarau_test").ok,
    false,
  );
  assert.equal(
    validateWebE2eDatabaseSource("postgres://postgres:postgres@127.0.0.1/vuarau_dev").ok,
    false,
  );
});

test("web E2E target names identify the exact release and remain disposable", () => {
  const name = buildWebE2eDatabaseName("b".repeat(40), "123456789abc");
  assert.match(name, /^vuarau_e2e_b{12}_123456789abc_test$/);
});
