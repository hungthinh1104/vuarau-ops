import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
      "test:release",
      "web:build",
      "web:storybook",
      "web:e2e:build",
      "web:e2e",
    ],
  );
  assert.equal(RELEASE_STEPS[3]?.env, "release-performance");
});

test("release Vitest entry point isolates the Postgres project", () => {
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { scripts?: Record<string, string> };
  const releaseTest = packageJson.scripts?.["test:release"] ?? "";

  assert.match(releaseTest, /--project domain/);
  assert.match(releaseTest, /--project web/);
  assert.match(releaseTest, /pnpm test:db/);
  assert.doesNotMatch(releaseTest, /--project db/);
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

test("CI runs the repository-owned synthetic and pilot rehearsals", () => {
  const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

  assert.match(workflow, /- name: Static checks\s+run: pnpm check:static/);
  assert.match(workflow, /- name: Synthetic depot day\s+run: pnpm synthetic:depot-day/);
  assert.match(workflow, /- name: Pilot dry-run\s+run: pnpm pilot:dry-run/);

  const browserGate = workflow.indexOf("- name: End-to-end tests");
  const syntheticGate = workflow.indexOf("- name: Synthetic depot day");
  const pilotGate = workflow.indexOf("- name: Pilot dry-run");
  assert.ok(browserGate >= 0 && browserGate < syntheticGate);
  assert.ok(syntheticGate < pilotGate);
});
