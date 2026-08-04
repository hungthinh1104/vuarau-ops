import assert from "node:assert/strict";
import { test } from "node:test";
import { migrationDrift } from "./db-generate-check.ts";

test("migration drift ignores an empty porcelain result", () => {
  assert.deepEqual(migrationDrift("\n"), []);
});

test("migration drift reports tracked and untracked migration changes", () => {
  assert.deepEqual(
    migrationDrift(
      " M packages/db/migrations/0053_example.sql\n?? packages/db/migrations/meta/0053_snapshot.json\n",
    ),
    [
      "M packages/db/migrations/0053_example.sql",
      "?? packages/db/migrations/meta/0053_snapshot.json",
    ],
  );
});
