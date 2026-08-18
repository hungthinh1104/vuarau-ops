import type {
  DeliveryId,
  FulfilmentRemainderOutcome,
  OperationsBoardDto,
} from "@vuarau/domain-contracts";
import {
  deriveOperationsBoardExceptions,
  deriveOperationsBoardNextAction,
} from "@vuarau/domain-kernel";
import { persistedBigintToSafeNumber } from "../../schema/safe-bigint.ts";

type Row = Record<string, unknown>;

const numberOf = (row: Row, name: string): number => {
  const raw = row[name] ?? 0;
  if (name === "age_seconds") {
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new RangeError("Dashboard age is not finite.");
    return value;
  }
  return persistedBigintToSafeNumber(raw, `dashboard ${name}`);
};
const stringOf = (row: Row, name: string): string => String(row[name] ?? "");
const asMoney = (amountMinor: number) => ({ amountMinor, currency: "VND" as const });

export function mapOperationsBoardRows(
  rawRows: readonly Row[],
): OperationsBoardDto["page"]["items"] {
  return rawRows.map((row) => {
    const id = stringOf(row, "id");
    const kind = stringOf(row, "kind") as "sale" | "purchase" | "payment";
    const reference = stringOf(row, "reference");
    const amountMinor = numberOf(row, "amount");
    const commercialState = stringOf(row, "commercial_state");
    const physicalState = stringOf(row, "physical_state");
    const financialState = stringOf(row, "financial_state");
    const returnedFulfilment = Boolean(row["returned_fulfilment"]);
    const fulfilmentRemainderUnresolved = Boolean(row["fulfilment_remainder_unresolved"]);
    const fulfilmentRemainderOutcome =
      row["fulfilment_remainder_outcome"] === null ||
      row["fulfilment_remainder_outcome"] === undefined
        ? null
        : (String(row["fulfilment_remainder_outcome"]) as FulfilmentRemainderOutcome);
    const returnSettlementResolved = Boolean(row["return_settlement_resolved"]);
    const returnId =
      row["return_id"] === null || row["return_id"] === undefined
        ? null
        : stringOf(row, "return_id");
    const unallocatedPayment = Boolean(row["unallocated_payment"]);
    const unallocatedPaymentAmount =
      row["unallocated_payment_amount"] === null || row["unallocated_payment_amount"] === undefined
        ? null
        : asMoney(numberOf(row, "unallocated_payment_amount"));
    const href = stringOf(row, "href");
    const deliveryId =
      row["delivery_id"] === null ? null : (stringOf(row, "delivery_id") as DeliveryId);
    return {
      id,
      kind,
      reference,
      counterparty: stringOf(row, "counterparty"),
      amount: asMoney(amountMinor),
      commercialState,
      physicalState,
      financialState,
      returnedFulfilment,
      fulfilmentRemainderOutcome,
      unallocatedPayment,
      unallocatedPaymentAmount,
      ageSeconds: numberOf(row, "age_seconds"),
      nextAction: deriveOperationsBoardNextAction({
        voided: commercialState === "voided",
        physicalState,
        returnedFulfilment,
        returnSettlementResolved,
        fulfilmentRemainderUnresolved,
        fulfilmentRemainderOutcome,
        financialState,
        kind,
        unallocatedPayment,
      }),
      exceptions: deriveOperationsBoardExceptions({
        id,
        kind,
        reference,
        href,
        amountMinor,
        dueAt: row["due_at"] ? new Date(String(row["due_at"])).toISOString() : null,
        commercialState,
        physicalState,
        financialState,
        returnedFulfilment,
        unallocatedPayment,
        unallocatedPaymentAmountMinor: unallocatedPaymentAmount?.amountMinor ?? null,
        reconciliationVariance: Boolean(row["reconciliation_variance"]),
        fulfilmentRemainderUnresolved,
        fulfilmentRemainderOutcome,
        returnSettlementResolved,
        returnId,
        deliveryId,
      }),
      updatedAt: new Date(String(row["updated_at"])).toISOString(),
      href,
      deliveryId,
    };
  });
}
