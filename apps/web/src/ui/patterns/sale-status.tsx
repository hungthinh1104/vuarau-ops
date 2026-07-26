import type { SaleDueState, SaleFinancialState, SaleStatus } from "@vuarau/domain-contracts";
import { Badge, type BadgeTone } from "../primitives/badge.tsx";
import { SALE_DUE_COPY, SALE_STATUS_COPY } from "../copy.ts";

export type SaleStatusProps = {
  readonly status: SaleStatus;
  /** Null while `draft` — a draft has no financial effect to have a state about. */
  readonly financialState: SaleFinancialState | null;
  readonly dueState: SaleDueState;
  /** Set on a sale that corrects an earlier one, and on the one it replaced. */
  readonly replacesSaleId?: string | null;
  readonly replacedBySaleId?: string | null;
};

const STATUS_TONE: Readonly<Record<SaleStatus, BadgeTone>> = {
  draft: "info",
  posted: "positive",
  // Grey, not red. Discarding a draft is an ordinary decision, not a failure.
  discarded: "neutral",
};

/**
 * Every fact about a sale's standing, as text, in one row.
 *
 * The five states in the catalog are not one enum, and flattening them would lose
 * the distinction that matters most: `posted` is the **stored lifecycle** and
 * `voided` is **derived** from a separate void record (BR-SALE-013). A voided sale
 * is still a posted sale; it is not a fourth status.
 *
 * A voided sale is never hidden, here or in a list. It happened, it was corrected,
 * and both facts are part of the record. Hiding it produces an account timeline
 * whose arithmetic cannot be followed: the `+total` and `−total` entries are both
 * there, so a missing document makes the pair look like a bug.
 *
 * `no_due_date` renders **nothing**. Most depot sales carry no term (BR-SALE-017),
 * and a warning chip that appears on nearly every sale is read as decoration
 * within a week.
 */
export function SaleStatus({
  status,
  financialState,
  dueState,
  replacesSaleId,
  replacedBySaleId,
}: SaleStatusProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone={STATUS_TONE[status]}>{SALE_STATUS_COPY[status]}</Badge>

      {financialState === "voided" ? <Badge tone="danger">Đã hoàn tác</Badge> : null}

      {dueState !== "no_due_date" ? (
        <Badge tone={dueState === "overdue" ? "danger" : "warning"}>
          {SALE_DUE_COPY[dueState]}
        </Badge>
      ) : null}

      {/* Both directions of the correction chain, so a reader can follow it from
          either end (BR-SALE-016). The voided sale is never edited to point
          forward — the link is stored on the replacement and read backwards. */}
      {replacesSaleId != null ? <Badge tone="info">Đơn thay thế</Badge> : null}
      {replacedBySaleId != null ? <Badge tone="info">Đã có đơn thay thế</Badge> : null}
    </div>
  );
}
