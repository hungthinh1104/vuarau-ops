import { readFileSync } from "node:fs";
import {
  createDatabase,
  createUnitOfWork,
  customerCensus,
  databaseReachable,
  findWorkspace,
  listMembers,
  migrationState,
} from "@vuarau/db";
import { roleHasPermission } from "@vuarau/domain-contracts";
import { randomIdGenerator, systemClock } from "../infrastructure/clock.ts";
import { readServerConfig } from "../infrastructure/config.ts";
import type { CommandContext, CommandDeps } from "../modules/shared/command-pipeline.ts";
import { listActorWorkspaces } from "../modules/session/session.queries.ts";
import { EXAMPLE_PILOT_CONFIG, readPilotConfig, type PilotConfig } from "./pilot-config.ts";

/**
 * One command that answers: **may an observed pilot session start?**
 *
 *   pnpm --filter @vuarau/api ops:pilot-readiness --config pilot.json
 *
 * Twelve checks, each pass or fail, none of them optional and none of them
 * inferred. It exists because the alternative is a checklist somebody reads on the
 * morning of the session, and the items that get skipped are always the ones about
 * data that looks fine.
 *
 * It **only reads**. Nothing here creates a workspace, grants a membership or
 * writes a confirmation — `ops:pilot` does the first two, and the third is a
 * person's signature on a worksheet. A readiness command that could fix what it
 * found would be a readiness command whose green result meant nothing.
 *
 * Exit codes are the interface: 0 means the checks passed, 1 means at least one
 * failed, 2 means it could not run.
 */

type CheckStatus = "pass" | "fail";

type Check = {
  readonly name: string;
  readonly status: CheckStatus;
  /** One line. What was found, never a value that identifies a customer. */
  readonly detail: string;
};

const pass = (name: string, detail: string): Check => ({ name, status: "pass", detail });
const fail = (name: string, detail: string): Check => ({ name, status: "fail", detail });

const USAGE = `
usage: node src/operations/pilot-readiness.ts --config <pilot.json>
       node src/operations/pilot-readiness.ts --example

  --config   the operator's declaration: which depot, which person, which role,
             and the depot owner's recorded answer on debt recognition (ASM-023).
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

  // 11. Mode. Checked first because it decides whether the rest is even the right
  //     set of questions — an operational pilot needs four things that do not
  //     exist (docs/00-product/pilot-mode.md).
  checks.push(
    config.mode === "shadow"
      ? pass("pilot mode is shadow", "mode: shadow")
      : fail(
          "pilot mode is shadow",
          `mode: ${config.mode} — only a shadow pilot is supported. An operational ` +
            "one needs a void/replacement UI, a rehearsed restore, real role " +
            "assignment and an incident runbook. None exists.",
        ),
  );

  // 10. ASM-023. Second, because a rejection stops everything regardless of how
  //     healthy the database is.
  const confirmation = config.debtRecognitionConfirmation;
  if (confirmation.decision === "rejected") {
    checks.push(
      fail(
        "ASM-023 debt recognition confirmed",
        `${confirmation.ownerName} rejected posting-time recognition on ${confirmation.date}. ` +
          "STOP. Every sale_posting entry would carry a transactionTime the owner " +
          "says is wrong, on an append-only ledger, with no repair the design allows.",
      ),
    );
  } else {
    checks.push(
      pass(
        "ASM-023 debt recognition confirmed",
        `accepted by ${confirmation.ownerName} on ${confirmation.date} ` +
          `(worksheet: ${confirmation.worksheetReference})`,
      ),
    );
  }

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

  console.warn(`pilot readiness — ${config.workspaceName}\n`);
  for (const check of checks) {
    console.warn(`  ${check.status === "pass" ? "✓" : "✗"} ${check.name}`);
    console.warn(`      ${check.detail}`);
  }

  console.warn(`\n${checks.length - failed.length}/${checks.length} checks passed.`);

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
