import { readFileSync, writeFileSync } from "node:fs";
import {
  createDatabase,
  createUnitOfWork,
  ensureMembership,
  ensureWorkspace,
  listWorkspaces,
} from "@vuarau/db";
import type { ActorId, WorkspaceId, WorkspaceRole } from "@vuarau/domain-contracts";
import { WORKSPACE_ROLES, workspaceIdSchema } from "@vuarau/domain-contracts";
import { randomIdGenerator, systemClock } from "../infrastructure/clock.ts";
import type { CommandContext, CommandDeps } from "../modules/shared/command-pipeline.ts";
import { createCustomer } from "../modules/customer/create-customer.handler.ts";
import { formatReport, readCustomerCsv, type ImportRow } from "./pilot-csv.ts";

/**
 * Setting a depot up for a pilot session, from a shell.
 *
 * Three jobs, in the order a facilitator does them:
 *
 *   workspaces                        list what already exists
 *   workspace  --name …               create or select the pilot depot
 *   member     --workspace … --subject …   provision somebody who can sign in
 *   customers  --workspace … --file …     import the worker's own customers
 *
 * **The import is a dry run unless `--commit` is passed.** That is not caution
 * for its own sake: the file is somebody's real customer list, typed once, and
 * seeing exactly what would be created before anything is costs one extra command
 * and saves an afternoon of cleanup that the ledger design makes expensive.
 *
 * There is deliberately **no UI for any of this** (docs/00-product/scope.md). An
 * import screen is a second way to create customers, with its own validation and
 * its own bugs, for a job done once per depot by somebody with shell access.
 *
 * Reaching this needs shell access to the server, which is its own authorization
 * boundary — the same reasoning as the balance rebuild tool. Customer creation
 * still goes through the real `CreateCustomer` command, so every rule, every audit
 * record and every idempotency key applies exactly as they do from a browser
 * (BR-CUSTOMER-005).
 */

type Flags = Readonly<Record<string, string | true>>;

function parseFlags(argv: readonly string[]): Flags {
  const flags: Record<string, string | true> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (!token.startsWith("--")) continue;
    const name = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[name] = true;
    } else {
      flags[name] = next;
      index += 1;
    }
  }
  return flags;
}

function stringFlag(flags: Flags, name: string): string | null {
  const value = flags[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

const USAGE = `
usage: node src/operations/pilot-onboarding.ts <command> [flags]

  workspaces
      List every depot in the database, with its id.

  workspace --name "<tên vựa>" [--id <uuid>]
      Create the pilot depot, or report the one that already has that id.

  member --workspace <uuid> --subject <supabase-user-id> --name "<họ tên>"
         --role <${WORKSPACE_ROLES.join("|")}> [--actor <uuid>]
      Provision somebody who can sign in and act in that depot.
      --subject is the Supabase user id the token will carry (BR-AUTH-005).

  customers --workspace <uuid> --actor <uuid> --file <customers.csv>
            [--commit] [--report <path>]
      Import customers from a UTF-8 CSV. Dry run unless --commit is given.
      Columns: name/ten (required), phone/dien_thoai, note/ghi_chu.

DATABASE_URL must be set.
`.trim();

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

function requireWorkspaceId(flags: Flags): WorkspaceId {
  const raw = stringFlag(flags, "workspace");
  if (raw === null) fail("--workspace <uuid> is required.\n\n" + USAGE);
  const parsed = workspaceIdSchema.safeParse(raw);
  if (!parsed.success) fail(`--workspace is not a uuid: ${raw}`);
  return parsed.data;
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);

  if (command === undefined || command === "help" || flags["help"] === true) {
    console.warn(USAGE);
    process.exit(command === undefined ? 2 : 0);
  }

  const url = process.env["DATABASE_URL"];
  if (url === undefined || url.length === 0) fail("DATABASE_URL is not set.");

  const database = createDatabase(url, { max: 2 });
  try {
    switch (command) {
      case "workspaces":
        await runList(database);
        return;
      case "workspace":
        await runWorkspace(database, flags);
        return;
      case "member":
        await runMember(database, flags);
        return;
      case "customers":
        await runImport(database, flags);
        return;
      default:
        fail(`unknown command: ${command}\n\n${USAGE}`);
    }
  } finally {
    await database.sql.end();
  }
}

type Db = ReturnType<typeof createDatabase>;

async function runList(database: Db): Promise<void> {
  const rows = await listWorkspaces(database);
  if (rows.length === 0) {
    console.warn('No depots yet. Create one with: workspace --name "Vựa …"');
    return;
  }
  for (const row of rows) console.warn(`${row.workspaceId}  ${row.name}`);
}

async function runWorkspace(database: Db, flags: Flags): Promise<void> {
  const name = stringFlag(flags, "name");
  if (name === null) fail('--name "<tên vựa>" is required.\n\n' + USAGE);

  const idFlag = stringFlag(flags, "id");
  const workspaceId =
    idFlag === null
      ? (crypto.randomUUID() as WorkspaceId)
      : requireWorkspaceId({ workspace: idFlag });

  const result = await ensureWorkspace(database, workspaceId, name);
  console.warn(
    result.created
      ? `created depot ${result.workspaceId} — ${result.name}`
      : `depot ${result.workspaceId} already exists — ${result.name} (name left unchanged)`,
  );
}

async function runMember(database: Db, flags: Flags): Promise<void> {
  const workspaceId = requireWorkspaceId(flags);
  const subject = stringFlag(flags, "subject");
  const displayName = stringFlag(flags, "name");
  const role = stringFlag(flags, "role");

  if (subject === null) fail("--subject <supabase-user-id> is required.\n\n" + USAGE);
  if (displayName === null) fail('--name "<họ tên>" is required.\n\n' + USAGE);
  if (role === null || !(WORKSPACE_ROLES as readonly string[]).includes(role)) {
    fail(`--role must be one of: ${WORKSPACE_ROLES.join(", ")}`);
  }

  const result = await ensureMembership(database, {
    workspaceId,
    actorId: (stringFlag(flags, "actor") ?? crypto.randomUUID()) as ActorId,
    supabaseUserId: subject,
    displayName,
    role: role as WorkspaceRole,
  });

  console.warn(
    `actor ${result.actorId} ${result.actorCreated ? "created" : "already existed"}; ` +
      `membership ${result.membershipCreated ? "created" : "updated"} as ${result.role}` +
      (result.reactivated ? " (reactivated a revoked membership)" : ""),
  );
  // The role table is a developer's default beyond `debt.adjust` (ASM-017), and a
  // pilot is the first time anybody is given one in anger.
  if (result.role === "owner" || result.role === "accountant") {
    console.warn(
      "note: this role holds debt.adjust and sale.void — the two ways to move money " +
        "with no new trade. Confirm it is what the depot owner intended (ASM-017).",
    );
  }
}

async function runImport(database: Db, flags: Flags): Promise<void> {
  const workspaceId = requireWorkspaceId(flags);
  const file = stringFlag(flags, "file");
  const actor = stringFlag(flags, "actor");
  const commit = flags["commit"] === true;

  if (file === null) fail("--file <customers.csv> is required.\n\n" + USAGE);
  if (actor === null) fail("--actor <uuid> is required — every row names who imported it.");

  const parsed = readCustomerCsv(readFileSync(file, "utf8"), workspaceId);

  /*
   * All or nothing, and judged before anything is attempted.
   *
   * A file half-imported is worse than one refused: the facilitator has no way to
   * know where it stopped, and re-running it without ids would create the good
   * rows twice. So one bad row refuses the whole file, and the report says which
   * row and why (BR-CUSTOMER-005).
   */
  if (parsed.problems.length > 0) {
    const report = formatReport(parsed, {
      mode: commit ? "commit" : "dry-run",
      created: [],
      replayed: [],
      failed: [],
    });
    emit(report, flags);
    console.error(`\n${parsed.problems.length} problem(s). Nothing was written.`);
    process.exit(1);
  }

  if (!commit) {
    emit(formatReport(parsed, { mode: "dry-run", created: [], replayed: [], failed: [] }), flags);
    return;
  }

  const deps: CommandDeps = {
    uow: createUnitOfWork(database.db, randomIdGenerator) as CommandDeps["uow"],
    clock: systemClock,
  };
  const ctx: CommandContext = {
    deps,
    // A real principal, because `CreateCustomer` checks that the envelope's actor
    // is the authenticated one (BR-AUTH-002). The subject is unused by the command
    // itself — the resolution from token to actor already happened, out of band,
    // when the operator was given shell access.
    principal: { actorId: actor as ActorId, subject: `operator:${actor}` },
  };

  const created: { line: number; customerId: string }[] = [];
  const replayed: { line: number; customerId: string }[] = [];
  const failed: { line: number; code: string; message: string }[] = [];

  for (const row of parsed.rows) {
    const before = await customerExists(deps, workspaceId, row);
    const result = await createCustomer(ctx, {
      commandId: crypto.randomUUID(),
      idempotencyKey: row.idempotencyKey,
      workspaceId,
      actorId: actor,
      occurredAt: systemClock.now(),
      payload: {
        customerId: row.customerId,
        displayName: row.displayName,
        phone: row.phone,
        note: row.note,
      },
    });

    if (!result.ok) {
      failed.push({ line: row.line, code: result.error.code, message: result.error.message });
      break;
    }
    (before ? replayed : created).push({ line: row.line, customerId: row.customerId });
  }

  emit(formatReport(parsed, { mode: "commit", created, replayed, failed }), flags);

  if (failed.length > 0) {
    console.error(`\nImport stopped at line ${failed[0]!.line}. See the report above.`);
    process.exit(1);
  }
}

/** Was this row already imported by an earlier run of the same file? */
async function customerExists(
  deps: CommandDeps,
  workspaceId: WorkspaceId,
  row: ImportRow,
): Promise<boolean> {
  const found = await deps.uow.transaction((repos) =>
    repos.customers.findById(workspaceId, row.customerId),
  );
  return found !== null;
}

function emit(report: string, flags: Flags): void {
  console.warn(report);
  const path = stringFlag(flags, "report");
  if (path !== null) {
    writeFileSync(path, `${report}\n`, "utf8");
    console.warn(`\nreport written to ${path}`);
  }
}

await main();
