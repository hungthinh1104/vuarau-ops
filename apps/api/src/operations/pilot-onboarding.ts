import { readFileSync, writeFileSync } from "node:fs";
import {
  bootstrapPilotWorkspace,
  createDatabase,
  createUnitOfWork,
  existingCustomerNames,
  existingProductNames,
  listMembers,
  listWorkspaces,
} from "@vuarau/db";
import type { ActorId, AuditRecordId, CommandId, WorkspaceId } from "@vuarau/domain-contracts";
import { permissionsForRole, workspaceIdSchema } from "@vuarau/domain-contracts";
import { randomIdGenerator, systemClock } from "../infrastructure/clock.ts";
import { deterministicUuid } from "../infrastructure/deterministic-id.ts";
import type { CommandContext, CommandDeps } from "../modules/shared/command-pipeline.ts";
import { createCustomer } from "../modules/customer/create-customer.handler.ts";
import { createProduct } from "../modules/product/product.handlers.ts";
import {
  formatReport,
  readCustomerCsv,
  readProductCsv,
  type ImportRow,
  type ProductImportRow,
} from "./pilot-csv.ts";

/**
 * Shell-only M23 workspace bootstrap, role review and Customer/Product import.
 * Bootstrap is audited and imports are dry-run by default. Canonical master data
 * still goes through CreateCustomer/CreateProduct with deterministic identities;
 * later membership changes go through authenticated application commands.
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

  bootstrap --workspace <uuid> --name "<tên vựa>" --actor <uuid>
            --subject <supabase-user-id> --owner-name "<họ tên>" [--commit]
      Dry-run by default. Atomically creates the depot and its first owner, with
      one audit record. A replay uses the same deterministic command identity.
      Later membership changes must use the authenticated workspace UI/API.

  review --workspace <uuid>
      Print active/revoked roles and their effective permissions for owner review.

  customers --workspace <uuid> --actor <uuid> --file <customers.csv>
            [--commit] [--report <path>]
      Import customers from a UTF-8 CSV. Dry run unless --commit is given.
      Columns: name/ten (required), phone/dien_thoai, note/ghi_chu.

  products --workspace <uuid> --actor <uuid> --file <products.csv>
           [--commit] [--report <path>]
      Import Products through CreateProduct. Dry run unless --commit is given.
      Columns: name/ten (required), aliases/ten_khac (separate with |), unit/don_vi.

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
      case "bootstrap":
        await runBootstrap(database, flags);
        return;
      case "review":
        await runReview(database, flags);
        return;
      case "customers":
        await runCustomerImport(database, flags);
        return;
      case "products":
        await runProductImport(database, flags);
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

async function runBootstrap(database: Db, flags: Flags): Promise<void> {
  const workspaceId = requireWorkspaceId(flags);
  const workspaceName = stringFlag(flags, "name");
  const subject = stringFlag(flags, "subject");
  const displayName = stringFlag(flags, "owner-name");
  const actorId = stringFlag(flags, "actor");
  if (workspaceName === null) fail('--name "<tên vựa>" is required.\n\n' + USAGE);
  if (subject === null) fail("--subject <supabase-user-id> is required.\n\n" + USAGE);
  if (displayName === null) fail('--owner-name "<họ tên>" is required.\n\n' + USAGE);
  if (actorId === null) fail("--actor <uuid> is required.\n\n" + USAGE);
  const demoPattern = /\b(demo|fixture|example|test)\b/i;
  if (
    demoPattern.test(subject) ||
    demoPattern.test(displayName) ||
    demoPattern.test(workspaceName)
  ) {
    fail("Pilot bootstrap refuses demo, fixture, example, or test identities.");
  }

  const identity = `${workspaceId}:${actorId}:${subject}`;
  const plan = {
    workspaceId,
    workspaceName,
    actorId: actorId as ActorId,
    supabaseUserId: subject,
    actorDisplayName: displayName,
    commandId: deterministicUuid("vuarau:m23:pilot-bootstrap:command", identity) as CommandId,
    auditRecordId: deterministicUuid("vuarau:m23:pilot-bootstrap:audit", identity) as AuditRecordId,
    occurredAt: new Date(systemClock.now()),
  };
  if (flags["commit"] !== true) {
    console.warn(
      [
        "mode: dry-run",
        `workspace: ${workspaceId} — ${workspaceName}`,
        `first owner: ${actorId} — ${displayName}`,
        `command: ${plan.commandId}`,
        "Nothing was written. Re-run with --commit after owner review.",
      ].join("\n"),
    );
    return;
  }

  const result = await bootstrapPilotWorkspace(database, plan);
  if (result.kind === "conflict") {
    fail(`Pilot bootstrap refused: ${result.reason}`);
  }
  console.warn(
    `${result.kind === "created" ? "created" : "replayed"} depot ${workspaceId} and first owner ` +
      `${actorId}; command ${plan.commandId}`,
  );
}

async function runReview(database: Db, flags: Flags): Promise<void> {
  const workspaceId = requireWorkspaceId(flags);
  const members = await listMembers(database, workspaceId);
  if (members.length === 0) {
    console.warn("No memberships.");
    return;
  }
  for (const member of members) {
    console.warn(
      `${member.actorId}  ${member.role}  ${member.isActive ? "active" : "revoked"}\n` +
        `  permissions: ${permissionsForRole(member.role).join(", ")}`,
    );
  }
}

function importArgs(flags: Flags): {
  workspaceId: WorkspaceId;
  file: string;
  actor: ActorId;
  commit: boolean;
} {
  const workspaceId = requireWorkspaceId(flags);
  const file = stringFlag(flags, "file");
  const actor = stringFlag(flags, "actor");
  const commit = flags["commit"] === true;

  if (file === null) fail("--file <import.csv> is required.\n\n" + USAGE);
  if (actor === null) fail("--actor <uuid> is required — every row names who imported it.");
  return { workspaceId, file, actor: actor as ActorId, commit };
}

function commandContext(
  database: Db,
  actor: ActorId,
): {
  deps: CommandDeps;
  ctx: CommandContext;
} {
  const deps: CommandDeps = {
    uow: createUnitOfWork(database.db, randomIdGenerator) as CommandDeps["uow"],
    clock: systemClock,
  };
  return {
    deps,
    ctx: {
      deps,
      principal: { actorId: actor, subject: `operator:${actor}` },
    },
  };
}

async function runCustomerImport(database: Db, flags: Flags): Promise<void> {
  const { workspaceId, file, actor, commit } = importArgs(flags);

  const parsed = withExistingNameWarnings(
    readCustomerCsv(readFileSync(file, "utf8"), workspaceId),
    await existingCustomerNames(database, workspaceId),
  );

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

  const { deps, ctx } = commandContext(database, actor);

  const created: { line: number; customerId: string }[] = [];
  const replayed: { line: number; customerId: string }[] = [];
  const failed: { line: number; code: string; message: string }[] = [];

  for (const row of parsed.rows) {
    const before = await customerExists(deps, workspaceId, row);
    const result = await createCustomer(ctx, {
      commandId: row.commandId,
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
      continue;
    }
    (before ? replayed : created).push({ line: row.line, customerId: row.customerId });
  }

  emit(formatReport(parsed, { mode: "commit", created, replayed, failed }), flags);

  if (failed.length > 0) {
    console.error(`\n${failed.length} row(s) rejected. Every row outcome is listed above.`);
    process.exit(1);
  }
}

async function runProductImport(database: Db, flags: Flags): Promise<void> {
  const { workspaceId, file, actor, commit } = importArgs(flags);
  const parsed = withExistingNameWarnings(
    readProductCsv(readFileSync(file, "utf8"), workspaceId),
    await existingProductNames(database, workspaceId),
  );
  if (parsed.problems.length > 0 || !commit) {
    emit(
      formatReport(parsed, {
        mode: commit ? "commit" : "dry-run",
        created: [],
        replayed: [],
        failed: [],
      }),
      flags,
    );
    if (parsed.problems.length > 0) {
      console.error(`\n${parsed.problems.length} problem(s). Nothing was written.`);
      process.exit(1);
    }
    return;
  }

  const { deps, ctx } = commandContext(database, actor);
  const created: { line: number; customerId: string }[] = [];
  const replayed: { line: number; customerId: string }[] = [];
  const failed: { line: number; code: string; message: string }[] = [];
  for (const row of parsed.rows) {
    const before = await productExists(deps, workspaceId, row);
    const result = await createProduct(ctx, {
      commandId: row.commandId,
      idempotencyKey: row.idempotencyKey,
      workspaceId,
      actorId: actor,
      occurredAt: systemClock.now(),
      payload: {
        productId: row.productId,
        displayName: row.displayName,
        aliases: [...row.aliases],
        preferredUnit: row.preferredUnit,
      },
    });
    if (!result.ok) {
      failed.push({ line: row.line, code: result.error.code, message: result.error.message });
      continue;
    }
    (before ? replayed : created).push({ line: row.line, customerId: row.productId });
  }
  emit(formatReport(parsed, { mode: "commit", created, replayed, failed }), flags);
  if (failed.length > 0) {
    console.error(`\n${failed.length} row(s) rejected. Every row outcome is listed above.`);
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

async function productExists(
  deps: CommandDeps,
  workspaceId: WorkspaceId,
  row: ProductImportRow,
): Promise<boolean> {
  const found = await deps.uow.transaction((repos) =>
    repos.products.findById(workspaceId, row.productId),
  );
  return found !== null;
}

function withExistingNameWarnings<
  TRow extends { readonly line: number; readonly displayName: string },
>(
  parsed: {
    readonly inputRows: number;
    readonly rows: readonly TRow[];
    readonly problems: readonly { line: number; column: string; problem: string }[];
    readonly warnings: readonly { line: number; warning: string }[];
    readonly batchId: string;
  },
  existingNames: readonly string[],
) {
  const normalized = new Set(existingNames.map((name) => name.toLocaleLowerCase("vi")));
  return {
    ...parsed,
    warnings: [
      ...parsed.warnings,
      ...parsed.rows
        .filter((row) => normalized.has(row.displayName.toLocaleLowerCase("vi")))
        .map((row) => ({
          line: row.line,
          warning: `"${row.displayName}" trùng tên đang có trong workspace; kiểm tra trước khi commit.`,
        })),
    ],
  };
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
