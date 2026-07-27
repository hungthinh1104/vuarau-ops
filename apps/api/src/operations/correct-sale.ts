import { readFileSync } from "node:fs";
import { createDatabase, createUnitOfWork } from "@vuarau/db";
import { SALE_VOID_REASON_CODES, saleLineInputSchema } from "@vuarau/domain-contracts";
import type {
  ActorId,
  IsoInstant,
  SaleId,
  SaleVoidReasonCode,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import { z } from "zod";
import { randomIdGenerator, systemClock } from "../infrastructure/clock.ts";
import { readServerConfig } from "../infrastructure/config.ts";
import type { CommandContext, CommandDeps } from "../modules/shared/command-pipeline.ts";
import {
  applyCorrection,
  planCorrection,
  type CorrectionRequest,
  type CorrectionResult,
  type CorrectionStep,
} from "./sale-correction.ts";

/**
 * The operator's way to correct a mistaken posted sale, without a SQL client.
 *
 *   pnpm --filter @vuarau/api ops:correct-sale \
 *     --workspace <id> --actor <id> --sale <id> --expected-version <n> \
 *     --reason-code wrong_amount --reason "Ghi nhầm 2 thùng ớt, thực tế 1" \
 *     [--replace-with lines.json] [--commit]
 *
 * **Dry run unless `--commit`.** It prints the sale, the balance now, and the
 * balance the correction would produce — and writes nothing. A void is an appended
 * record that cannot be un-appended, so seeing the arithmetic first costs one
 * command and is the difference between a correction and a second mistake.
 *
 * Everything it does goes through `VoidSale` → `CreateSaleDraft` → `PostSale`
 * (ADR-0012): the same permission, the same idempotency claim, the same audit
 * records and the same compensating entry the UI would produce, once there is one.
 * No ledger row is written here and no row is updated.
 *
 * Shell access is the authorization boundary for reaching this at all, and then
 * `sale.void` is checked inside the command exactly as it would be for a browser —
 * an operator without the permission is refused here too.
 */

const replacementFileSchema = z.object({
  lines: z.array(saleLineInputSchema).min(1),
  note: z.string().nullable().default(null),
  dueAt: z.string().nullable().default(null),
});

const USAGE = `
usage: node src/operations/correct-sale.ts [flags]

  --workspace <uuid>          the depot
  --actor <uuid>              who is correcting it; must hold sale.void
  --sale <uuid>               the posted sale that is wrong
  --expected-version <n>      the version you read off the screen
  --reason-code <code>        ${SALE_VOID_REASON_CODES.join(" | ")}
  --reason "<giải thích>"     free text; what the person disputing it will read
  --replace-with <file.json>  optional: { lines: [...], note, dueAt }
  --occurred-at <iso>         when the correction happened. Defaults to now
  --key <text>                names this correction; a re-run with the same key
                              replays rather than voiding twice. Defaults to the
                              sale id
  --commit                    actually do it. Without this, nothing is written

DATABASE_URL must be set.
`.trim();

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  return value === undefined || value.startsWith("--") ? null : value;
}

function fail(message: string): never {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(2);
}

function required(name: string): string {
  const value = flag(name);
  if (value === null || value.length === 0) fail(`--${name} is required.`);
  return value;
}

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.length <= 2) {
    console.warn(USAGE);
    process.exit(process.argv.length <= 2 ? 2 : 0);
  }

  const workspaceId = required("workspace") as WorkspaceId;
  const actorId = required("actor") as ActorId;
  const saleId = required("sale") as SaleId;
  const reasonCode = required("reason-code");
  const reason = required("reason");
  const expectedVersion = Number(required("expected-version"));
  const commit = process.argv.includes("--commit");

  if (!(SALE_VOID_REASON_CODES as readonly string[]).includes(reasonCode)) {
    fail(`--reason-code must be one of: ${SALE_VOID_REASON_CODES.join(", ")}`);
  }
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
    fail("--expected-version must be a non-negative integer.");
  }

  const replacementPath = flag("replace-with");
  let replacement: CorrectionRequest["replacement"] = null;
  if (replacementPath !== null) {
    const parsed = replacementFileSchema.safeParse(
      JSON.parse(readFileSync(replacementPath, "utf8")),
    );
    if (!parsed.success) {
      console.error("✗ the replacement file is not usable:\n");
      for (const issue of parsed.error.issues) {
        console.error(`  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
      }
      process.exit(2);
    }
    replacement = {
      lines: parsed.data.lines,
      note: parsed.data.note,
      dueAt: parsed.data.dueAt as IsoInstant | null,
    };
  }

  const serverConfig = readServerConfig(process.env);
  if (!serverConfig.ok) {
    console.error("✗ the environment is not usable — run ops:check-env.");
    process.exit(2);
  }

  const request: CorrectionRequest = {
    workspaceId,
    actorId,
    saleId,
    expectedVersion,
    reasonCode: reasonCode as SaleVoidReasonCode,
    reason,
    replacement,
    occurredAt: (flag("occurred-at") ?? systemClock.now()) as IsoInstant,
    correctionKey: flag("key") ?? saleId,
  };

  const database = createDatabase(serverConfig.config.databaseUrl, { max: 2 });
  try {
    const deps: CommandDeps = {
      uow: createUnitOfWork(database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: systemClock,
    };
    // A real principal, so `sale.void` is checked exactly as it is for a browser
    // (BR-AUTH-002, BR-AUTH-004). The subject is unused by the commands: the
    // resolution from token to actor already happened, out of band, when whoever
    // is running this was given shell access.
    const ctx: CommandContext = {
      deps,
      principal: { actorId, subject: `operator:${actorId}` },
    };

    const outcome = commit
      ? await applyCorrection(ctx, request)
      : await planCorrection(ctx, request);

    if (!outcome.ok) {
      console.error(`✗ ${outcome.code}\n\n  ${outcome.message}`);
      process.exit(1);
    }

    report(outcome.result, commit);
    const failedStep = outcome.result.steps.find((step) => step.status === "failed");
    process.exit(failedStep === undefined ? 0 : 1);
  } finally {
    await database.sql.end();
  }
}

/** Đồng, grouped the way a depot reads them. No currency symbol in a log. */
const money = (minor: number): string => new Intl.NumberFormat("vi-VN").format(minor);

function report(result: CorrectionResult, commit: boolean): void {
  const { plan } = result;

  console.warn(`sale:              ${plan.sale.id}`);
  console.warn(`customer:          ${plan.sale.customerId}`);
  console.warn(`status:            ${plan.sale.status} / ${plan.sale.financialState ?? "—"}`);
  console.warn(`version:           ${plan.sale.version}`);
  console.warn(`sale total:        ${money(plan.sale.totalMinor)}`);
  /*
   * Only the steps still to run contribute to the arithmetic shown. On a
   * resumption the balance has already moved for whatever completed, and printing
   * those deltas again would show a sum that does not reach the projected total —
   * which reads as a bug in the tool at the exact moment somebody is deciding
   * whether to trust it.
   */
  const stateOf = (step: CorrectionStep["step"]): CorrectionStep["status"] =>
    plan.steps.find((entry) => entry.step === step)?.status ?? "planned";

  console.warn("");
  console.warn(`balance before:    ${money(plan.balanceBeforeMinor)}`);
  if (stateOf("void") === "done") {
    console.warn(`  void:            already applied`);
  } else {
    console.warn(`  void:            −${money(plan.sale.totalMinor)}`);
  }
  if (plan.replacementTotalMinor !== null) {
    if (stateOf("replacement_post") === "done") {
      console.warn(`  replacement:     already posted`);
    } else {
      console.warn(`  replacement:     +${money(plan.replacementTotalMinor)}`);
    }
  }
  console.warn(`balance projected: ${money(plan.balanceProjectedMinor)}`);

  console.warn("\nsteps:");
  for (const step of result.steps) {
    const mark = step.status === "done" ? "✓" : step.status === "failed" ? "✗" : "·";
    console.warn(`  ${mark} ${step.step}${step.code === null ? "" : ` — ${step.code}`}`);
  }

  if (!commit) {
    console.warn("\nNothing was written. Re-run with --commit to apply.");
    return;
  }

  if (result.balanceAfterMinor === null) {
    console.error("\n✗ the correction did not complete. The steps above say where it stopped.");
    console.error("Re-running with the same --key replays what succeeded and retries the rest.");
    return;
  }

  console.warn(`\nbalance after:     ${money(result.balanceAfterMinor)}`);
  if (result.balanceAfterMinor !== plan.balanceProjectedMinor) {
    // The projection and the server disagreeing means something else moved this
    // customer's balance while the correction ran. Loud, because a correction
    // whose arithmetic was wrong is a second mistake.
    console.error(
      `\n✗ projected ${money(plan.balanceProjectedMinor)} but the server says ` +
        `${money(result.balanceAfterMinor)}. Something else moved this balance. ` +
        "Read the account timeline before doing anything more.",
    );
    process.exitCode = 1;
  }
}

await main();
