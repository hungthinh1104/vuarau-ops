import { createDatabase, createUnitOfWork } from "@vuarau/db";
import type { CurrencyCode, CustomerId, WorkspaceId } from "@vuarau/domain-contracts";
import { DEFAULT_CURRENCY } from "@vuarau/domain-contracts";
import { randomIdGenerator, systemClock } from "../infrastructure/clock.ts";
import type { CommandDeps } from "../modules/shared/command-pipeline.ts";
import { rebuildAccountBalance } from "../modules/account/account.queries.ts";

/**
 * UC-ACCOUNT-003 — rebuild a customer's balance projection from the entries.
 *
 * An **operator tool**, run from a shell, and deliberately not a tRPC procedure.
 *
 * The balance is a cache; the entries are the truth (ADR-0004). Rebuilding it is
 * a maintenance operation for a projection somebody suspects has drifted — after
 * a bad deploy, a restore, a migration. It is not something a UI should offer,
 * because a button that silently recomputes a number is a button that hides the
 * fact that the number was wrong.
 *
 * Reaching this needs shell access to the server, which is its own authorization
 * boundary — so it takes no principal and performs no permission check. That is
 * stated rather than assumed: adding it to the router later would be adding an
 * unauthenticated write.
 *
 * It reports the difference rather than swallowing it. A drift is evidence of a
 * bug, and repairing the symptom without recording it loses that evidence.
 *
 *   pnpm --filter @vuarau/api ops:rebuild-balance <workspaceId> <customerId>
 */
async function main(): Promise<void> {
  const [workspaceId, customerId, currency = DEFAULT_CURRENCY] = process.argv.slice(2);

  if (workspaceId === undefined || customerId === undefined) {
    console.error(
      "usage: node src/operations/rebuild-account-balance.ts <workspaceId> <customerId> [currency]",
    );
    process.exit(2);
  }

  const url = process.env["DATABASE_URL"];
  if (url === undefined) {
    console.error("DATABASE_URL is not set.");
    process.exit(2);
  }

  const database = createDatabase(url);
  const deps: CommandDeps = {
    uow: createUnitOfWork(database.db, randomIdGenerator) as CommandDeps["uow"],
    clock: systemClock,
  };

  const before = await deps.uow.transaction((repos) =>
    repos.accountBalances.get(workspaceId as WorkspaceId, customerId as CustomerId),
  );
  const after = await rebuildAccountBalance(
    deps,
    workspaceId as WorkspaceId,
    customerId as CustomerId,
    currency as CurrencyCode,
  );

  const storedMinor = before?.balance.amountMinor ?? null;
  const rebuiltMinor = after.balance.amountMinor;

  console.warn(
    `customer ${customerId}: stored ${storedMinor ?? "(none)"} → rebuilt ${rebuiltMinor} ` +
      `over ${after.entryCount} entries`,
  );

  if (storedMinor !== null && storedMinor !== rebuiltMinor) {
    // Loud, and a non-zero exit, because a drift means a bug somewhere upstream
    // and a silent repair would hide it.
    console.error(
      `DRIFT: the stored balance was wrong by ${rebuiltMinor - storedMinor}. ` +
        "The projection has been repaired; the cause has not.",
    );
    await database.sql.end();
    process.exit(1);
  }

  await database.sql.end();
}

await main();
