import type { SaleState } from "@vuarau/domain-kernel";
import type { Store } from "../store.ts";
import { key } from "../store.ts";
import { latestTimestamp } from "./dashboard-helpers.ts";

export function saleOperationsUpdatedAt(
  store: Store,
  workspaceId: string,
  sale: SaleState,
  saleReturnIds: readonly string[],
  allocationIds: ReadonlySet<string>,
): string {
  return latestTimestamp(
    [
      sale.recordedAt,
      sale.postedAt,
      sale.voidRecord?.recordedAt,
      ...[...store.deliveries.values()]
        .filter((delivery) => delivery.workspaceId === workspaceId && delivery.saleId === sale.id)
        .map((delivery) => delivery.recordedAt),
      ...store.deliveryReturns
        .filter((returned) => returned.workspaceId === workspaceId)
        .filter(
          (returned) =>
            store.deliveries.get(key(workspaceId, returned.deliveryId))?.saleId === sale.id,
        )
        .map((returned) => returned.recordedAt),
      ...[...store.deliveryReturnSettlements.values()]
        .filter(
          (settlement) =>
            settlement.workspaceId === workspaceId && saleReturnIds.includes(settlement.returnId),
        )
        .map((settlement) => settlement.recordedAt),
      ...store.paymentAllocations
        .filter((allocation) => allocationIds.has(allocation.id))
        .map((allocation) => allocation.recordedAt),
      ...store.paymentAllocationReversals
        .filter((reversal) => allocationIds.has(reversal.allocationId))
        .map((reversal) => reversal.recordedAt),
      ...[...store.payments.values()]
        .filter(
          (payment) =>
            payment.workspaceId === workspaceId && payment.customerId === sale.customerId,
        )
        .map((payment) => payment.recordedAt),
      ...store.reversals
        .filter((reversal) => reversal.workspaceId === workspaceId)
        .filter((reversal) =>
          [...store.payments.values()].some(
            (payment) =>
              payment.workspaceId === workspaceId &&
              payment.id === reversal.paymentId &&
              payment.customerId === sale.customerId,
          ),
        )
        .map((reversal) => reversal.recordedAt),
    ],
    sale.recordedAt,
  );
}
