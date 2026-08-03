import type {
  IsoInstant,
  PostSaleCommand,
  PaymentTermSource,
  WorkspacePolicyVersionId,
} from "@vuarau/domain-contracts";
import type { AccountEntryDraft, Decision } from "../shared/effects.ts";
import type { SaleState } from "../shared/state.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";
import { calculateSaleTotal, validateSaleLines } from "./sale-lines.ts";

export type PostSaleInput = {
  readonly command: PostSaleCommand;
  readonly sale: SaleState;
  readonly recordedAt: IsoInstant;
  readonly qualityGradeRequired?: boolean;
  /** Resolved by the application from the effective policy at sale.transactionTime. */
  readonly paymentTermSnapshot?: {
    readonly dueAt: IsoInstant;
    readonly source: Exclude<PaymentTermSource, "sale_override" | "none">;
    readonly policyVersionId: WorkspacePolicyVersionId;
  } | null;
};

/**
 * T-SALE-002 — the moment a customer starts owing money.
 *
 * Posting asserts that the final accepted quantity and the agreed unit price are
 * now known; the line snapshots are re-affirmed here rather than taken on trust
 * from draft time, because a draft may have sat overnight (BR-SALE-011).
 *
 * Check order matters. The version is checked first (BR-SALE-006): if another
 * worker has already posted this sale, the caller's view is stale, and "someone
 * else changed this" is a more truthful answer than "already posted" — it points
 * them at reloading rather than at retrying.
 *
 * A network retry never reaches here — the idempotency layer answers it with the
 * original result (BR-COMMAND-001). Anything arriving at this function is a
 * genuine second attempt.
 */
export function decidePostSale({
  command,
  sale,
  recordedAt,
  qualityGradeRequired = true,
  paymentTermSnapshot = null,
}: PostSaleInput): DomainResult<Decision<SaleState>> {
  if (command.expectedVersion !== sale.version) {
    return err(
      "SALE_VERSION_CONFLICT",
      `Sale was modified by someone else: expected version ${command.expectedVersion}, found ${sale.version}.`,
      { saleId: sale.id, expectedVersion: command.expectedVersion, actualVersion: sale.version },
    );
  }

  if (sale.status === "posted") {
    return err("SALE_ALREADY_POSTED", "This sale has already been posted.", {
      saleId: sale.id,
      status: sale.status,
    });
  }

  // A discarded draft is a decision somebody made. Posting one would resurrect
  // it, and the repository's `status = 'draft'` condition would refuse the write
  // anyway — but as a version conflict, which is the wrong story to tell
  // (BR-SALE-018).
  if (sale.status === "discarded") {
    return err("SALE_ALREADY_DISCARDED", "This draft was discarded and cannot be posted.", {
      saleId: sale.id,
      status: sale.status,
    });
  }

  if (sale.lines.length === 0) {
    return err("SALE_EMPTY", "A sale cannot be posted without at least one line.", {
      saleId: sale.id,
    });
  }

  const unresolvedLine = sale.lines.find((line) => line.productId === null);
  if (unresolvedLine !== undefined) {
    return err(
      "SALE_PRODUCT_REQUIRED",
      "Every Sale line must select a catalogue Product before posting.",
      { saleId: sale.id, lineId: unresolvedLine.lineId },
    );
  }

  const ungradedLine = qualityGradeRequired
    ? sale.lines.find((line) => line.qualityGradeId === null || line.qualityGradeName === null)
    : undefined;
  if (ungradedLine !== undefined) {
    return err(
      "SALE_QUALITY_GRADE_REQUIRED",
      "Every Sale line must select a quality grade before posting.",
      { saleId: sale.id, lineId: ungradedLine.lineId },
    );
  }

  // Re-validated and re-totalled at posting: these rows have been sitting in the
  // database, and this is the step that turns them into a receivable (BR-SALE-001).
  const lines = validateSaleLines(sale.lines, sale.currency);
  if (!lines.ok) {
    return err(lines.error.code, lines.error.message, lines.error.details);
  }

  const totalAmount = calculateSaleTotal(lines.value, sale.currency);

  const paymentTermsPolicyVersionId =
    sale.dueAt === null ? (paymentTermSnapshot?.policyVersionId ?? null) : null;
  const paymentTermsSource: PaymentTermSource =
    sale.dueAt !== null ? "sale_override" : (paymentTermSnapshot?.source ?? "none");

  const posted: SaleState = {
    ...sale,
    status: "posted",
    lines: lines.value,
    totalAmount,
    dueAt: sale.dueAt ?? paymentTermSnapshot?.dueAt ?? null,
    paymentTermsPolicyVersionId,
    paymentTermsSource,
    version: sale.version + 1,
    postedAt: command.occurredAt,
  };

  // BR-SALE-007 — exactly one entry, for exactly the sale total.
  const accountEntry: AccountEntryDraft = {
    workspaceId: sale.workspaceId,
    customerId: sale.customerId,
    amount: totalAmount,
    sourceType: "sale_posting",
    sourceId: sale.id,
    reversalOfEntryId: null,
    reasonCode: null,
    reason: null,
    transactionTime: command.occurredAt,
    recordedAt,
    actorId: command.actorId,
    commandId: command.commandId,
  };

  return ok({
    aggregate: posted,
    accountEntries: [accountEntry],
    audit: {
      aggregateType: "sale",
      aggregateId: sale.id,
      action: "sale.posted",
      transactionTime: command.occurredAt,
      recordedAt,
      before: { status: sale.status, version: sale.version },
      after: {
        status: posted.status,
        version: posted.version,
        totalMinor: totalAmount.amountMinor,
        currency: sale.currency,
      },
      reason: null,
    },
  });
}
