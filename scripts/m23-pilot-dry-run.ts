import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

type EvidenceStep = {
  readonly name: string;
  readonly command: readonly string[];
  readonly proves: readonly string[];
};

const steps: readonly EvidenceStep[] = [
  {
    name: "pilot contracts and operator imports",
    command: [
      "exec",
      "vitest",
      "run",
      "--project",
      "application",
      "apps/api/src/operations/pilot-config.app.test.ts",
      "apps/api/src/operations/pilot-csv.app.test.ts",
      "apps/api/src/infrastructure/request-guard.app.test.ts",
      "apps/api/src/infrastructure/readiness.app.test.ts",
    ],
    proves: [
      "fail-closed owner/provider declarations",
      "Customer/Product validation and deterministic identity",
      "oversized request, rate limiting, PostgreSQL-unavailable readiness",
    ],
  },
  {
    name: "real PostgreSQL provisioning and import",
    command: [
      "exec",
      "vitest",
      "run",
      "--project",
      "db",
      "packages/db/src/provisioning.db.test.ts",
      "apps/api/src/infrastructure/persistence/drizzle/pilot-onboarding.db.test.ts",
    ],
    proves: [
      "atomic audited owner bootstrap",
      "duplicate-safe Customer/Product command replay",
      "workspace isolation and no partial invalid-file mutation",
    ],
  },
  {
    name: "public and authenticated trust boundaries",
    command: ["security:m22"],
    proves: ["authenticated command/query inventory and fixed public route inventory"],
  },
  {
    name: "disposable browser/API/PostgreSQL workflow",
    command: ["web:e2e"],
    proves: [
      "sign-in, Quick Sale, payment/reversal/correction",
      "supplier/purchase/receiving/inventory/delivery/return",
      "documents/share, reports, backup/restore/integrity/reconciliation",
      "duplicate tap, dropped response, stale version, permission and inactive-member failures",
    ],
  },
];

for (const required of [
  "apps/web/e2e/quick-sale.spec.ts",
  "apps/web/e2e/m9-account-ledger.spec.ts",
  "apps/web/e2e/m16-m18-goods-truth.spec.ts",
  "apps/web/e2e/m19-m21-depot-operations.spec.ts",
  "apps/web/e2e/m14-operations.spec.ts",
]) {
  if (!existsSync(required)) {
    console.error(`M23 dry-run evidence source missing: ${required}`);
    process.exit(2);
  }
}

const release = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
if (release.status !== 0) {
  console.error(release.stderr);
  process.exit(2);
}
const tree = spawnSync("git", ["status", "--porcelain"], { encoding: "utf8" });
if (tree.status !== 0 || tree.stdout.trim().length > 0) {
  console.error(
    "M23 dry-run requires a clean committed tree; otherwise the reported release SHA " +
      "does not identify the code under test.",
  );
  process.exit(2);
}

const evidence: Array<{
  name: string;
  status: "pass" | "fail";
  proves: readonly string[];
}> = [];
for (const step of steps) {
  console.warn(`\nM23 dry-run: ${step.name}`);
  const result = spawnSync("pnpm", step.command, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  evidence.push({
    name: step.name,
    status: result.status === 0 ? "pass" : "fail",
    proves: step.proves,
  });
  if (result.status !== 0) break;
}

const report = {
  kind: "M23_DISPOSABLE_DRY_RUN",
  releaseSha: release.stdout.trim(),
  database: process.env["DATABASE_URL"] ? "configured" : "missing",
  generatedAt: new Date().toISOString(),
  evidence,
  repositoryReadiness:
    evidence.length === steps.length && evidence.every((row) => row.status === "pass")
      ? "PASS"
      : "FAIL",
  fieldValidation: "NOT_RUN_BY_AUTOMATION",
};
console.warn(`\n${JSON.stringify(report, null, 2)}`);
process.exit(report.repositoryReadiness === "PASS" ? 0 : 1);
