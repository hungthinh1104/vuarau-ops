import type {
  ActorId,
  IsoInstant,
  SaleId,
  SaleLineInput,
  SaleVoidReasonCode,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import { calculateLineTotal } from "@vuarau/domain-contracts";
import { deterministicUuid } from "../infrastructure/deterministic-id.ts";
import type { CommandContext } from "../modules/shared/command-pipeline.ts";
import { getSale } from "../modules/sale/sale.queries.ts";
import { getCustomerAccountBalance } from "../modules/account/account.queries.ts";
import { voidSale } from "../modules/sale/void-sale.handler.ts";
import { createSaleDraft } from "../modules/sale/create-sale-draft.handler.ts";
import { postSale } from "../modules/sale/post-sale.handler.ts";

/**
 * Correcting a posted sale, from a shell, through the real commands.
 *
 * There is no void screen this milestone
 * ([pilot-mode.md](../../../../docs/00-product/pilot-mode.md)), so when a worker
 * enters a wrong sale during an observed session the only alternatives were: a
 * developer with a SQL client, or leaving it wrong. The first edits an immutable
 * row and the second poisons the session's data. This is the third.
 *
 * It is **not** a shortcut around the rules. Every write goes through
 * `VoidSale` → optional `CreateSaleDraft` → `PostSale`, which means the same
 * permission (`sale.void`), the same idempotency claim, the same audit records and
 * the same compensating entry a browser would produce (ADR-0012). Nothing here
 * touches the ledger, and nothing updates a row.
 *
 * `AdjustCustomerDebt` is deliberately not used. It would leave the wrong sale
 * document standing while quietly patching the balance, so the document and the
 * balance would tell different stories (BR-ACCOUNT-010).
 */

export type ReplacementInput = {
  readonly lines: readonly SaleLineInput[];
  readonly note: string | null;
  readonly dueAt: IsoInstant | null;
};

export type CorrectionRequest = {
  readonly workspaceId: WorkspaceId;
  readonly saleId: SaleId;
  readonly actorId: ActorId;
  /**
   * The version the operator believes the sale is at.
   *
   * `VoidSale` carries no `expectedVersion` by design — a posted sale's version
   * never moves again, so there is no lost update to guard against. What this
   * guards is different and worth guarding: that the sale the operator **looked
   * at** is the sale they are voiding. Between reading a total off a screen and
   * typing a command, somebody else may have voided it already.
   */
  readonly expectedVersion: number;
  readonly reasonCode: SaleVoidReasonCode;
  readonly reason: string;
  readonly replacement: ReplacementInput | null;
  /** When the correction happened, per the operator. Not when it was typed. */
  readonly occurredAt: IsoInstant;
  /**
   * Names this correction. Ids and idempotency keys are derived from it, so
   * re-running the same correction after a crash is a replay rather than a second
   * void (BR-COMMAND-001).
   */
  readonly correctionKey: string;
};

export type CorrectionStep = {
  readonly step: "void" | "replacement_draft" | "replacement_post";
  readonly status: "planned" | "done" | "failed";
  readonly id: string | null;
  readonly code: string | null;
};

export type CorrectionPlan = {
  readonly sale: {
    readonly id: string;
    readonly customerId: string;
    readonly version: number;
    readonly status: string;
    readonly financialState: string | null;
    readonly totalMinor: number;
  };
  readonly balanceBeforeMinor: number;
  /** What the balance should be once every step below has run. */
  readonly balanceProjectedMinor: number;
  readonly replacementTotalMinor: number | null;
  readonly steps: readonly CorrectionStep[];
};

export type CorrectionResult = {
  readonly plan: CorrectionPlan;
  readonly steps: readonly CorrectionStep[];
  /** Read back from the server after the commands ran. Null on a dry run. */
  readonly balanceAfterMinor: number | null;
  readonly committed: boolean;
};

export type CorrectionRefusal = {
  readonly ok: false;
  readonly code: string;
  readonly message: string;
};
export type CorrectionOutcome =
  { readonly ok: true; readonly result: CorrectionResult } | CorrectionRefusal;

const refuse = (code: string, message: string): CorrectionRefusal => ({ ok: false, code, message });

function idsFor(request: CorrectionRequest) {
  const namespace = `vuarau:correction:${request.workspaceId}:${request.saleId}`;
  const of = (part: string) => deterministicUuid(namespace, `${request.correctionKey}:${part}`);
  return {
    saleVoidId: of("void"),
    replacementSaleId: of("replacement"),
    voidCommandId: of("void-command"),
    draftCommandId: of("draft-command"),
    postCommandId: of("post-command"),
    key: (part: string) => `correction:${request.correctionKey}:${part}`,
  };
}

function replacementTotalMinor(replacement: ReplacementInput | null): number | null {
  if (replacement === null) return null;
  return replacement.lines.reduce(
    (total, line) => total + calculateLineTotal(line.quantity, line.unitPrice).amountMinor,
    0,
  );
}

/**
 * Reads the sale and the balance, checks every precondition, and computes what the
 * correction would do — without writing anything.
 *
 * The projection is arithmetic on values the server already returned: the void
 * compensates the **stored** posted total (BR-SALE-012), and the replacement adds
 * the sum of its lines through the same `calculateLineTotal` the server posts with
 * (BR-SALE-004). So the number printed before is the number the server produces
 * after, and the test asserts they match rather than assuming it.
 */
export async function planCorrection(
  ctx: CommandContext,
  request: CorrectionRequest,
): Promise<CorrectionOutcome> {
  const sale = await getSale(ctx, { workspaceId: request.workspaceId, saleId: request.saleId });
  if (!sale.ok) return refuse(sale.error.code, sale.error.message);

  if (sale.value.status !== "posted") {
    return refuse(
      "SALE_NOT_POSTED",
      `This sale is ${sale.value.status}. Only a posted sale is corrected by voiding; ` +
        "a draft is discarded (BR-SALE-015).",
    );
  }
  const ids = idsFor(request);

  /*
   * A void that already exists is either **this** correction, re-run, or somebody
   * else's — and the two need opposite answers.
   *
   * Ours is a resumption: a crash between the void and the replacement leaves
   * exactly this state, and re-running must finish the job. Because the void id is
   * derived from the correction key, "is it ours" is answerable rather than
   * guessed. Anybody else's is a refusal: two corrections of one sale would credit
   * the customer twice for one mistake (BR-SALE-013).
   */
  const alreadyVoided = sale.value.voidRecord !== null;
  if (alreadyVoided && sale.value.voidRecord?.id !== ids.saleVoidId) {
    return refuse(
      "SALE_ALREADY_VOIDED",
      "This sale was already voided by a different correction. Read the account " +
        "timeline before doing anything more.",
    );
  }
  if (sale.value.version !== request.expectedVersion) {
    return refuse(
      "SALE_VERSION_CONFLICT",
      `The sale is at version ${sale.value.version}, you expected ${request.expectedVersion}. ` +
        "Re-read it: what you looked at is not what you are about to void.",
    );
  }

  const balance = await getCustomerAccountBalance(
    ctx,
    request.workspaceId,
    sale.value.customerId,
    sale.value.currency,
  );
  if (!balance.ok) return refuse(balance.error.code, balance.error.message);

  /*
   * Whether this correction's replacement has already been posted. Read rather
   * than assumed, for the same reason as the void: on a resumption the balance has
   * already moved for whichever steps completed, and projecting their effect a
   * second time would print a number the server will never produce.
   */
  const existingReplacement = await getSale(ctx, {
    workspaceId: request.workspaceId,
    saleId: ids.replacementSaleId as SaleId,
  });
  const replacementPosted = existingReplacement.ok && existingReplacement.value.status === "posted";

  const replacementTotal = replacementTotalMinor(request.replacement);
  const before = balance.value.balance.amountMinor;
  const projected =
    before -
    (alreadyVoided ? 0 : sale.value.totalAmount.amountMinor) +
    (replacementPosted ? 0 : (replacementTotal ?? 0));

  const steps: CorrectionStep[] = [
    {
      step: "void",
      status: alreadyVoided ? "done" : "planned",
      id: ids.saleVoidId,
      code: null,
    },
  ];
  if (request.replacement !== null) {
    steps.push(
      {
        step: "replacement_draft",
        status: existingReplacement.ok ? "done" : "planned",
        id: ids.replacementSaleId,
        code: null,
      },
      {
        step: "replacement_post",
        status: replacementPosted ? "done" : "planned",
        id: ids.replacementSaleId,
        code: null,
      },
    );
  }

  return {
    ok: true,
    result: {
      plan: {
        sale: {
          id: sale.value.id,
          customerId: sale.value.customerId,
          version: sale.value.version,
          status: sale.value.status,
          financialState: sale.value.financialState,
          totalMinor: sale.value.totalAmount.amountMinor,
        },
        balanceBeforeMinor: before,
        balanceProjectedMinor: projected,
        replacementTotalMinor: replacementTotal,
        steps,
      },
      steps,
      balanceAfterMinor: null,
      committed: false,
    },
  };
}

/**
 * Runs the plan. Stops at the first refusal and reports which step it was.
 *
 * A void that succeeded and a replacement that failed is a real, recoverable
 * state — the customer owes nothing for that load until the replacement is posted
 * — and it is reported rather than rolled back, because there is nothing to roll
 * back to: the void is an appended record, and unwinding it would mean voiding a
 * void. Re-running the same correction replays the void and retries the
 * replacement.
 */
export async function applyCorrection(
  ctx: CommandContext,
  request: CorrectionRequest,
): Promise<CorrectionOutcome> {
  const planned = await planCorrection(ctx, request);
  if (!planned.ok) return planned;

  const ids = idsFor(request);
  const plan = planned.result.plan;
  const steps: CorrectionStep[] = [];

  const envelope = (commandId: string, key: string) => ({
    commandId,
    idempotencyKey: ids.key(key),
    workspaceId: request.workspaceId,
    actorId: request.actorId,
    occurredAt: request.occurredAt,
  });

  const voided = await voidSale(ctx, {
    ...envelope(ids.voidCommandId, "void"),
    payload: {
      saleVoidId: ids.saleVoidId,
      saleId: request.saleId,
      reasonCode: request.reasonCode,
      reason: request.reason,
    },
  });
  steps.push({
    step: "void",
    status: voided.ok ? "done" : "failed",
    id: ids.saleVoidId,
    code: voided.ok ? null : voided.error.code,
  });
  if (!voided.ok) {
    return { ok: true, result: finish(plan, steps, null) };
  }

  if (request.replacement !== null) {
    const draft = await createSaleDraft(ctx, {
      ...envelope(ids.draftCommandId, "draft"),
      payload: {
        saleId: ids.replacementSaleId,
        customerId: plan.sale.customerId,
        currency: "VND",
        lines: [...request.replacement.lines],
        note: request.replacement.note,
        dueAt: request.replacement.dueAt,
        // The link that makes the correction followable in both directions
        // (BR-SALE-016). Set once, at draft creation, never rewritten.
        replacesSaleId: request.saleId,
      },
    });
    steps.push({
      step: "replacement_draft",
      status: draft.ok ? "done" : "failed",
      id: ids.replacementSaleId,
      code: draft.ok ? null : draft.error.code,
    });
    if (!draft.ok) {
      return { ok: true, result: finish(plan, steps, null) };
    }

    const posted = await postSale(ctx, {
      ...envelope(ids.postCommandId, "post"),
      // A freshly created draft is at version 1. Stated rather than read back,
      // because reading it back would defeat the guard: if anything moved the
      // draft between the two commands, this must refuse.
      expectedVersion: draft.value.version,
      payload: { saleId: ids.replacementSaleId },
    });
    steps.push({
      step: "replacement_post",
      status: posted.ok ? "done" : "failed",
      id: ids.replacementSaleId,
      code: posted.ok ? null : posted.error.code,
    });
    if (!posted.ok) {
      return { ok: true, result: finish(plan, steps, null) };
    }
  }

  const after = await getCustomerAccountBalance(
    ctx,
    request.workspaceId,
    plan.sale.customerId as never,
  );
  return {
    ok: true,
    result: finish(plan, steps, after.ok ? after.value.balance.amountMinor : null),
  };
}

function finish(
  plan: CorrectionPlan,
  steps: readonly CorrectionStep[],
  balanceAfterMinor: number | null,
): CorrectionResult {
  return { plan, steps, balanceAfterMinor, committed: true };
}
