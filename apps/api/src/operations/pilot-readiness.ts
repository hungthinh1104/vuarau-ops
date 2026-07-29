import { readFileSync } from "node:fs";
import {
  createDatabase,
  createUnitOfWork,
  customerCensus,
  databaseReachable,
  findWorkspace,
  listMembers,
  migrationState,
  productCensus,
} from "@vuarau/db";
import { roleHasPermission } from "@vuarau/domain-contracts";
import { randomIdGenerator, systemClock } from "../infrastructure/clock.ts";
import { readServerConfig } from "../infrastructure/config.ts";
import type { CommandContext, CommandDeps } from "../modules/shared/command-pipeline.ts";
import { listActorWorkspaces } from "../modules/session/session.queries.ts";
import { EXAMPLE_PILOT_CONFIG, readPilotConfig, type PilotConfig } from "./pilot-config.ts";

/**
 * Read-only M23 gate. Repository checks inspect runtime/database state; external
 * checks require explicit owner/provider evidence. The command never repairs what
 * it finds. Exit 0 means every gate passed, 1 means blocked, 2 means unusable
 * input/environment.
 */

type CheckStatus = "pass" | "fail";

type Check = {
  readonly name: string;
  readonly status: CheckStatus;
  readonly gate: "repository" | "external";
  /** One line. What was found, never a value that identifies a customer. */
  readonly detail: string;
};

const pass = (name: string, detail: string, gate: Check["gate"] = "repository"): Check => ({
  name,
  status: "pass",
  gate,
  detail,
});
const fail = (name: string, detail: string, gate: Check["gate"] = "repository"): Check => ({
  name,
  status: "fail",
  gate,
  detail,
});

const USAGE = `
usage: node src/operations/pilot-readiness.ts --config <pilot.json>
       node src/operations/pilot-readiness.ts --example

  --config   the operator's declaration: depot, actor, exact release, owner
             semantics, role/owner review, data policy and recovery evidence.
  --example  print a blank one to fill in.

DATABASE_URL must be set. The file is never written to and never committed.
`.trim();

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  return value === undefined || value.startsWith("--") ? "" : value;
}

async function main(): Promise<void> {
  if (process.argv.includes("--example")) {
    console.warn(JSON.stringify(EXAMPLE_PILOT_CONFIG, null, 2));
    return;
  }

  const configPath = flag("config");
  if (configPath === null || configPath.length === 0) {
    console.error(`--config <pilot.json> is required.\n\n${USAGE}`);
    process.exit(2);
  }

  const parsed = readPilotConfig(readFileSync(configPath, "utf8"));
  if (!parsed.ok) {
    console.error("✗ the pilot declaration is not usable:\n");
    for (const problem of parsed.problems) console.error(`  ${problem}`);
    console.error("\nRun with --example for the shape.");
    process.exit(2);
  }

  const serverConfig = readServerConfig(process.env);
  if (!serverConfig.ok) {
    console.error("✗ the environment is not usable — run ops:check-env:\n");
    for (const problem of serverConfig.problems) {
      console.error(`  ${problem.variable}: ${problem.problem}`);
    }
    process.exit(2);
  }

  const database = createDatabase(serverConfig.config.databaseUrl, { max: 2 });
  try {
    const checks = await runChecks(database, parsed.config);
    report(checks, parsed.config);
    process.exit(checks.some((check) => check.status === "fail") ? 1 : 0);
  } finally {
    await database.sql.end();
  }
}

type Db = ReturnType<typeof createDatabase>;

async function runChecks(database: Db, config: PilotConfig): Promise<readonly Check[]> {
  const checks: Check[] = [];

  const deployedSha = process.env["APP_RELEASE_SHA"]?.trim() ?? "";
  checks.push(
    deployedSha === config.releaseSha
      ? pass("deployed release matches frozen pilot SHA", config.releaseSha)
      : fail(
          "deployed release matches frozen pilot SHA",
          deployedSha.length === 0
            ? "APP_RELEASE_SHA is absent; evidence cannot be attributed to an exact build"
            : `runtime ${deployedSha} differs from declaration ${config.releaseSha}`,
        ),
  );

  checks.push(
    config.mode === "shadow"
      ? pass("pilot mode is shadow", "mode: shadow")
      : fail(
          "pilot mode is shadow",
          `mode: ${config.mode} — M23 authorizes shadow observation only; operational ` +
            "replacement is not part of the frozen pilot contract.",
        ),
  );

  const confirmation = config.debtRecognitionConfirmation;
  if (confirmation.decision === "rejected") {
    checks.push(
      fail(
        "ASM-023 debt recognition confirmed",
        `${confirmation.ownerName} rejected posting-time recognition on ${confirmation.date}. ` +
          "STOP. Every sale_posting entry would carry a transactionTime the owner " +
          "says is wrong, on an append-only ledger, with no repair the design allows.",
        "external",
      ),
    );
  } else {
    checks.push(
      pass(
        "ASM-023 debt recognition confirmed",
        `accepted by ${confirmation.ownerName} on ${confirmation.date} ` +
          `(worksheet: ${confirmation.worksheetReference})`,
        "external",
      ),
    );
  }

  for (const [name, decision] of [
    ["ASM-024 PostSale meaning", config.commercialRecognitionConfirmation],
    ["ASM-025 supplier payable recognition", config.supplierPayableRecognitionConfirmation],
  ] as const) {
    checks.push(
      decision.decision === "accepted"
        ? pass(
            `${name} confirmed`,
            `accepted by ${decision.ownerName} on ${decision.date} ` +
              `(worksheet: ${decision.worksheetReference})`,
            "external",
          )
        : fail(
            `${name} confirmed`,
            `rejected by ${decision.ownerName} on ${decision.date}; current semantics ` +
              "cannot enter the shadow pilot",
            "external",
          ),
    );
  }

  for (const [name, review] of [
    ["ASM-017 role-permission review", config.rolePermissionReview],
    ["ASM-018 owner-membership review", config.ownerMembershipReview],
    ["ASM-030 sharing and retention review", config.dataSharingRetentionReview],
  ] as const) {
    checks.push(
      review.decision === "accepted"
        ? pass(
            `${name} accepted`,
            `reviewed by ${review.reviewerName} on ${review.date} ` +
              `(worksheet: ${review.worksheetReference})`,
            "external",
          )
        : fail(
            `${name} accepted`,
            `rejected by ${review.reviewerName} on ${review.date}`,
            "external",
          ),
    );
  }

  checks.push(
    config.recoveryEvidence.status === "passed"
      ? pass(
          "provider recovery evidence attached",
          `provider: ${config.recoveryEvidence.providerEvidenceReference}; ` +
            `drill: ${config.recoveryEvidence.restoreDrillReference}`,
          "external",
        )
      : fail(
          "provider recovery evidence attached",
          `pending — owner: ${config.recoveryEvidence.owner}; ` +
            `trigger: ${config.recoveryEvidence.trigger}`,
          "external",
        ),
  );

  // 1. Database reachable.
  const reachable = await databaseReachable(database);
  checks.push(
    reachable
      ? pass("database reachable", "select 1 answered")
      : fail("database reachable", "no answer — nothing below could be checked"),
  );
  if (!reachable) return checks;

  // 2. Migrations current.
  const migrations = await migrationState(database);
  if (migrations.missing.length > 0) {
    checks.push(
      fail(
        "migrations current",
        `${migrations.applied}/${migrations.expected} applied; missing ` +
          `${migrations.missing.join(", ")} — the code is ahead of the database. ` +
          "Run pnpm db:migrate.",
      ),
    );
  } else if (migrations.unknown > 0) {
    checks.push(
      fail(
        "migrations current",
        `all ${migrations.expected} applied, plus ${migrations.unknown} this checkout ` +
          "does not have — the database is ahead of the code, or belongs to a " +
          "different deployment.",
      ),
    );
  } else {
    checks.push(pass("migrations current", `${migrations.applied}/${migrations.expected} applied`));
  }

  // 3. The pilot workspace exists, and is the one the operator meant.
  const workspace = await findWorkspace(database, config.workspaceId);
  if (workspace === null) {
    checks.push(fail("pilot workspace exists", "no workspace with that id"));
    return checks;
  }
  checks.push(
    workspace.name === config.workspaceName
      ? pass("pilot workspace exists", `“${workspace.name}”`)
      : fail(
          "pilot workspace exists",
          `id resolves to “${workspace.name}”, declaration says “${config.workspaceName}” — ` +
            "one of them is the wrong depot",
        ),
  );

  const members = await listMembers(database, config.workspaceId);
  const active = members.filter((member) => member.isActive);

  // 4. No unintended owners. ASM-018 backfilled every membership as `owner`, and
  //    `owner` carries debt.adjust and sale.void — the two ways to move money
  //    with no new trade.
  const unintendedOwners = active.filter(
    (member) => member.role === "owner" && !config.allowedOwnerActorIds.includes(member.actorId),
  );
  checks.push(
    unintendedOwners.length === 0
      ? pass(
          "no unintended owner memberships",
          `${active.filter((m) => m.role === "owner").length} owner(s), all declared`,
        )
      : fail(
          "no unintended owner memberships",
          `${unintendedOwners.length} undeclared owner(s): ` +
            unintendedOwners.map((member) => member.actorId).join(", ") +
            " — each holds debt.adjust and sale.void (ASM-017, ASM-018)",
        ),
  );

  // 5. The observed worker: active, and in the role somebody chose.
  const actor = active.find((member) => member.actorId === config.actor.expectedActorId);
  if (actor === undefined) {
    const inactive = members.some((member) => member.actorId === config.actor.expectedActorId);
    checks.push(
      fail(
        "pilot actor has an active membership",
        inactive ? "membership exists but is revoked" : "not a member of this depot",
      ),
    );
  } else {
    checks.push(
      actor.role === config.actor.expectedRole
        ? pass("pilot actor has an active membership", `role: ${actor.role}, as declared`)
        : fail(
            "pilot actor has an active membership",
            `role is ${actor.role}, declaration says ${config.actor.expectedRole} — ` +
              "a role nobody chose is what ASM-018 left behind",
          ),
    );
  }

  // 6 & 7. The worker's own customers, and nobody else's.
  const census = await customerCensus(database, config.workspaceId);
  checks.push(
    census.active > 0
      ? pass("customers imported", `${census.active} active customer(s)`)
      : fail(
          "customers imported",
          "none — a worker searching an empty list measures nothing (ops:pilot customers)",
        ),
  );
  checks.push(
    census.suspicious.length === 0
      ? pass("no demo or fixture customers", "none found")
      : fail(
          "no demo or fixture customers",
          `${census.suspicious.length} found, including “${census.suspicious[0]}” — ` +
            "a name the worker does not recognise is a reason to distrust every other one",
        ),
  );

  const catalog = await productCensus(database, config.workspaceId);
  checks.push(
    catalog.active > 0
      ? pass("Products imported", `${catalog.active} active Product(s)`)
      : fail("Products imported", "none — Product lookup cannot be validated"),
  );
  checks.push(
    catalog.suspicious.length === 0
      ? pass("no fixture Products", "none found")
      : fail(
          "no fixture Products",
          `${catalog.suspicious.length} fixture-shaped Product name(s) found`,
        ),
  );

  // 8 & 9. What the worker's own token will actually resolve to.
  const deps: CommandDeps = {
    uow: createUnitOfWork(database.db, randomIdGenerator) as CommandDeps["uow"],
    clock: systemClock,
  };
  const resolved = await deps.uow.transaction((repos) =>
    repos.actors.findBySupabaseUserId(config.actor.supabaseUserId),
  );

  if (resolved === null) {
    checks.push(
      fail(
        "Supabase subject resolves to the expected actor",
        "no actor carries that supabase user id — signing in would give ACTOR_NOT_FOUND",
      ),
    );
  } else {
    checks.push(
      resolved.actorId === config.actor.expectedActorId
        ? pass("Supabase subject resolves to the expected actor", resolved.actorId)
        : fail(
            "Supabase subject resolves to the expected actor",
            `resolves to ${resolved.actorId}, declaration says ${config.actor.expectedActorId}`,
          ),
    );
  }

  // The picker, exercised through the real read rather than inferred from rows.
  const ctx: CommandContext = {
    deps,
    principal: {
      actorId: config.actor.expectedActorId,
      subject: config.actor.supabaseUserId,
    },
  };
  const discovery = await listActorWorkspaces(ctx);
  if (!discovery.ok) {
    checks.push(fail("workspace discovery returns only this depot", discovery.error.code));
  } else {
    const ids = discovery.value.workspaces.map((entry) => entry.workspaceId);
    checks.push(
      ids.length === 1 && ids[0] === config.workspaceId
        ? pass("workspace discovery returns only this depot", `1 depot: “${workspace.name}”`)
        : fail(
            "workspace discovery returns only this depot",
            `returns ${ids.length}: ${ids.join(", ")} — the picker would offer a choice ` +
              "nobody meant to give",
          ),
    );
  }

  // 12. Somebody can undo a mistake. Not a UI — an operator at a shell
  //     (ops:correct-sale) — but somebody in this depot must hold `sale.void`,
  //     or a wrong sale during the session cannot be corrected at all.
  const correctors = active.filter((member) => roleHasPermission(member.role, "sale.void"));
  checks.push(
    correctors.length > 0
      ? pass(
          "a correction path exists",
          `${correctors.length} active member(s) hold sale.void; ops:correct-sale runs it`,
        )
      : fail(
          "a correction path exists",
          "no active member holds sale.void — a sale entered wrongly during the " +
            "session could not be undone by anybody",
        ),
  );

  return checks;
}

function report(checks: readonly Check[], config: PilotConfig): void {
  const failed = checks.filter((check) => check.status === "fail");
  const repositoryFailed = failed.filter((check) => check.gate === "repository");
  const externalFailed = failed.filter((check) => check.gate === "external");

  console.warn(`pilot readiness — ${config.workspaceName}\n`);
  for (const check of checks) {
    console.warn(`  ${check.status === "pass" ? "✓" : "✗"} [${check.gate}] ${check.name}`);
    console.warn(`      ${check.detail}`);
  }

  console.warn(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
  console.warn(
    `Repository readiness: ${repositoryFailed.length === 0 ? "PASS" : "FAIL"}; ` +
      `pilot readiness: ${failed.length === 0 ? "PASS" : "BLOCKED/PENDING"} ` +
      `(${externalFailed.length} external gate(s) open).`,
  );

  if (failed.length === 0) {
    console.warn(
      "\nThe technical gate is open. It is not evidence about the product: nothing " +
        "here measures whether a worker can record a sale (H2). Run the device smoke " +
        "check on a real phone next — docs/11-operations/device-smoke-check.md.",
    );
    return;
  }

  console.error(`\n✗ ${failed.length} check(s) failed. Do not start the session.`);
  if (config.debtRecognitionConfirmation.decision === "rejected") {
    console.error(
      "\nThe owner rejected posting-time debt recognition. That is a stop, not a " +
        "fix: see docs/09-decisions/ASM-002-debt-recognition-worksheet.md.",
    );
  }
}

await main();
