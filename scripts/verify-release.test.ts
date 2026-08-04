import assert from "node:assert/strict";
import { test } from "node:test";
import { RELEASE_STEPS, requireReleaseEnvironment } from "./verify-release.ts";

test("release gate includes schema drift, performance, recovery and production E2E", () => {
  assert.deepEqual(
    RELEASE_STEPS.map((step) => step.args[0]),
    [
      "check:static",
      "db:migrate",
      "db:generate:check",
      "perf:production-scale",
      "rehearse:migrations",
      "test",
      "web:build",
      "web:storybook",
      "web:e2e:build",
      "web:e2e",
    ],
  );
  assert.equal(RELEASE_STEPS[3]?.env, "release-performance");
});

test("release gate requires a separate performance database", () => {
  assert.throws(
    () =>
      requireReleaseEnvironment({
        databaseUrl: "postgres://localhost/vuarau_test",
        releasePerformanceDatabaseUrl: "postgres://localhost/vuarau_test",
      }),
    /must differ/,
  );
  assert.throws(
    () => requireReleaseEnvironment({ databaseUrl: "postgres://localhost/vuarau_test" }),
    /RELEASE_PERF_DATABASE_URL is required/,
  );
});
