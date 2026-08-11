import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSyntheticDatabaseName,
  validateSyntheticDatabaseSource,
} from "./synthetic-depot-day.ts";

test("synthetic depot day accepts only a local disposable test database", () => {
  assert.equal(
    validateSyntheticDatabaseSource("postgres://postgres:postgres@127.0.0.1:55432/vuarau_test").ok,
    true,
  );
  assert.equal(
    validateSyntheticDatabaseSource("postgres://postgres:postgres@db.example.com/vuarau_test").ok,
    false,
  );
  assert.equal(
    validateSyntheticDatabaseSource("postgres://postgres:postgres@127.0.0.1:55432/vuarau_dev").ok,
    false,
  );
});

test("synthetic database names are unique per run and remain disposable", () => {
  const first = buildSyntheticDatabaseName("a".repeat(40), "11111111");
  const second = buildSyntheticDatabaseName("a".repeat(40), "22222222");
  assert.notEqual(first, second);
  assert.match(first, /^vuarau_synthetic_a{12}_11111111_test$/);
  assert.match(second, /^vuarau_synthetic_a{12}_22222222_test$/);
});
