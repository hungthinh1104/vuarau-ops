import type {
  DashboardAvailability,
  DashboardOrderStatusCountsDto,
  DashboardSeriesDto,
  DashboardSummaryDto,
  DashboardTopProductsDto,
  OperationsBoardDto,
  DashboardSeriesInput,
  DashboardTopProductsInput,
  OperationsBoardCountsDto,
  OperationsBoardCountsInput,
  Quantity,
} from "@vuarau/domain-contracts";
import { encodeCursor, vietnamBusinessDateForInstant } from "@vuarau/domain-contracts";
import type { Repositories } from "../../ports.ts";
import { key, takePage } from "../store.ts";
import type { Store } from "../store.ts";
import { intakeSourceRoot } from "../repositories/intake.ts";
import { exactAdd, exactSubtract } from "./exact-number.ts";
import { saleFinancialFacts, saleNextAction, salePhysicalState } from "./dashboard-order-state.ts";
import {
  boardCounts,
  isAfterOperationsBoardCursor,
  latestTimestamp,
  matchesOperationsBoardFilter,
  operationsBoardCursorOf,
} from "./dashboard-helpers.ts";
import { saleReturnSettlementStatus } from "./dashboard-return-settlement.ts";
import { saleOperationsUpdatedAt } from "./dashboard-sale-timestamp.ts";
import { deriveOperationsBoardExceptions } from "@vuarau/domain-kernel";

const now = () => new Date().toISOString();
const money = (amountMinor: number) => ({ amountMinor, currency: "VND" as const });

function availability(updatedAt: string | null = null): DashboardAvailability {
  return { state: "available", diagnostics: [], updatedAt };
}

function quantities(values: readonly Quantity[]): Quantity[] {
  const totals = new Map<string, number>();
  for (const value of values)
    totals.set(
      value.unit,
      exactAdd(totals.get(value.unit) ?? 0, value.valueScaled, "dashboard.quantity.value_scaled"),
    );
  return [...totals].map(([unit, valueScaled]) => ({
    unit: unit as Quantity["unit"],
    valueScaled,
  }));
}

function receivedFor(store: Store, workspaceId: string): Quantity[] {
  return quantities(
    store.inventoryMovements
      .filter(
        (movement) =>
          movement.workspaceId === workspaceId &&
          (movement.sourceType === "purchase_receipt" ||
            movement.sourceType === "purchase_receipt_reversal" ||
            movement.sourceType === "quality_disposition" ||
            movement.sourceType === "quality_disposition_reversal"),
      )
      .map((movement) => movement.quantity),
  );
}

function outstandingFor(store: Store, workspaceId: string): Quantity[] {
  const fulfilled = new Map<string, number>();
  const deliveryLineToSaleLine = new Map<string, string>();
  for (const delivery of store.deliveries.values()) {
    if (
      delivery.workspaceId !== workspaceId ||
      !["dispatched", "delivered"].includes(delivery.status)
    )
      continue;
    for (const line of delivery.lines) {
      deliveryLineToSaleLine.set(line.deliveryLineId, line.saleLineId);
      fulfilled.set(
        line.saleLineId,
        exactAdd(
          fulfilled.get(line.saleLineId) ?? 0,
          line.quantity.valueScaled,
          "dashboard.outstanding_delivery.value_scaled",
        ),
      );
    }
  }
  for (const returned of store.deliveryReturns) {
    if (returned.workspaceId !== workspaceId) continue;
    for (const line of returned.lines) {
      const saleLineId = deliveryLineToSaleLine.get(line.deliveryLineId);
      if (saleLineId === undefined) continue;
      fulfilled.set(
        saleLineId,
        exactSubtract(
          fulfilled.get(saleLineId) ?? 0,
          line.quantity.valueScaled,
          "dashboard.outstanding_delivery.value_scaled",
        ),
      );
    }
  }
  const remaining: Quantity[] = [];
  for (const sale of store.sales.values()) {
    if (sale.workspaceId !== workspaceId || sale.status !== "posted" || sale.voidRecord !== null)
      continue;
    for (const line of sale.lines) {
      const valueScaled = exactSubtract(
        line.quantity.valueScaled,
        fulfilled.get(line.lineId) ?? 0,
        "dashboard.outstanding_delivery.value_scaled",
      );
      if (valueScaled > 0) remaining.push({ ...line.quantity, valueScaled });
    }
  }
  return quantities(remaining);
}

function acceptedAfterInspectionFor(store: Store, workspaceId: string): Map<string, number> {
  const accepted = new Map<string, number>();
  for (const disposition of store.qualityDispositions.values()) {
    if (disposition.workspaceId !== workspaceId || disposition.reversal !== null) continue;
    const root = intakeSourceRoot(store, workspaceId, disposition.source);
    const purchaseLineId = root?.line.purchaseLineId;
    if (purchaseLineId === null || purchaseLineId === undefined) continue;
    for (const allocation of disposition.allocations) {
      if (allocation.outcome !== "accepted") continue;
      accepted.set(
        purchaseLineId,
        exactAdd(
          accepted.get(purchaseLineId) ?? 0,
          allocation.quantity.valueScaled,
          "dashboard.accepted_inbound.value_scaled",
        ),
      );
    }
  }
  return accepted;
}

export const createDashboardReads = (store: Store): Pick<Repositories, "dashboardReads"> => ({
  dashboardReads: {
    summary: async (workspaceId) => {
      const asOf = now();
      const outstandingDelivery = outstandingFor(store, workspaceId);
      const sales = [...store.sales.values()].filter(
        (sale) => sale.workspaceId === workspaceId && sale.status === "posted",
      );
      const purchases = [...store.purchases.values()].filter(
        (purchase) => purchase.workspaceId === workspaceId && purchase.status === "confirmed",
      );
      const activeSales = sales.filter((sale) => sale.voidRecord === null);
      const activePurchases = purchases.filter((purchase) => purchase.voidRecord === null);
      const salesAmount = sales.reduce(
        (sum, sale) =>
          exactAdd(
            sum,
            exactSubtract(
              sale.totalAmount.amountMinor,
              sale.voidRecord?.amount.amountMinor ?? 0,
              "dashboard.sales.amount_minor",
            ),
            "dashboard.sales.amount_minor",
          ),
        0,
      );
      const purchaseAmount = purchases.reduce(
        (sum, purchase) =>
          exactAdd(
            sum,
            exactSubtract(
              purchase.totalAmount.amountMinor,
              purchase.voidRecord?.amount.amountMinor ?? 0,
              "dashboard.purchases.amount_minor",
            ),
            "dashboard.purchases.amount_minor",
          ),
        0,
      );
      const receivables = [...store.balances.values()]
        .filter((balance) => balance.workspaceId === workspaceId && balance.balance.amountMinor > 0)
        .reduce(
          (sum, balance) =>
            exactAdd(sum, balance.balance.amountMinor, "dashboard.receivables.amount_minor"),
          0,
        );
      const payables = [...store.supplierAccountBalances.values()]
        .filter((balance) => balance.workspaceId === workspaceId && balance.balance.amountMinor > 0)
        .reduce(
          (sum, balance) =>
            exactAdd(sum, balance.balance.amountMinor, "dashboard.payables.amount_minor"),
          0,
        );
      const cash = [...store.cashBalances.values()]
        .filter((balance) => balance.workspaceId === workspaceId)
        .reduce(
          (sum, balance) =>
            exactAdd(sum, balance.balance.amountMinor, "dashboard.cash.amount_minor"),
          0,
        );
      const amount = (value: number, count: number): DashboardSummaryDto["sales"] => ({
        availability: availability(asOf),
        amount: money(value),
        count,
      });
      const quantity = (value: Quantity[], count: number): DashboardSummaryDto["received"] => ({
        availability: availability(asOf),
        quantities: quantities(value),
        count,
      });
      return {
        workspaceId,
        asOf,
        sales: amount(salesAmount, activeSales.length),
        purchases: amount(purchaseAmount, activePurchases.length),
        received: quantity(
          receivedFor(store, workspaceId),
          [...store.purchaseReceipts.values()].filter(
            (receipt) => receipt.workspaceId === workspaceId,
          ).length,
        ),
        stock: quantity(
          [...store.inventoryBalances.values()]
            .filter((balance) => balance.workspaceId === workspaceId)
            .map((balance) => ({ unit: balance.unit, valueScaled: balance.quantityScaled })),
          [...store.inventoryBalances.values()].filter(
            (balance) => balance.workspaceId === workspaceId,
          ).length,
        ),
        outstandingDelivery: quantity(outstandingDelivery, outstandingDelivery.length),
        receivables: amount(
          receivables,
          [...store.balances.values()].filter(
            (balance) => balance.workspaceId === workspaceId && balance.balance.amountMinor > 0,
          ).length,
        ),
        payables: amount(
          payables,
          [...store.supplierAccountBalances.values()].filter(
            (balance) => balance.workspaceId === workspaceId && balance.balance.amountMinor > 0,
          ).length,
        ),
        cash: amount(
          cash,
          [...store.cashBalances.values()].filter((balance) => balance.workspaceId === workspaceId)
            .length,
        ),
      };
    },

    salesSeries: async (
      input: DashboardSeriesInput & {
        readonly businessDayStartMinute: number;
        readonly now: string;
      },
    ): Promise<DashboardSeriesDto> => {
      const asOf = input.now;
      const today = vietnamBusinessDateForInstant(asOf, input.businessDayStartMinute);
      const endDate = new Date(`${today}T00:00:00.000Z`);
      const dates = new Map<string, DashboardSeriesDto["points"][number]>();
      for (let index = 0; index < input.days; index += 1) {
        const date = new Date(endDate.getTime() - (input.days - 1 - index) * 86_400_000)
          .toISOString()
          .slice(0, 10);
        dates.set(date, {
          date: date as DashboardSeriesDto["points"][number]["date"],
          sales: money(0),
          orderCount: 0,
          purchases: money(0),
          received: [],
          cash: money(0),
        });
      }
      const add = (date: string, patch: Partial<DashboardSeriesDto["points"][number]>) => {
        const point = dates.get(date);
        if (point !== undefined) dates.set(date, { ...point, ...patch });
      };
      for (const sale of store.sales.values()) {
        if (
          sale.workspaceId !== input.workspaceId ||
          sale.status !== "posted" ||
          sale.voidRecord !== null
        )
          continue;
        const date = vietnamBusinessDateForInstant(
          sale.transactionTime,
          input.businessDayStartMinute,
        );
        const point = dates.get(date);
        if (point === undefined) continue;
        add(date, {
          sales: money(
            exactAdd(
              point.sales.amountMinor,
              sale.totalAmount.amountMinor,
              "dashboard.series.sales.amount_minor",
            ),
          ),
          orderCount: point.orderCount + 1,
        });
      }
      for (const purchase of store.purchases.values()) {
        if (purchase.workspaceId !== input.workspaceId || purchase.status !== "confirmed") continue;
        const date = vietnamBusinessDateForInstant(
          purchase.transactionTime,
          input.businessDayStartMinute,
        );
        const point = dates.get(date);
        if (point !== undefined)
          add(date, {
            purchases: money(
              exactAdd(
                point.purchases.amountMinor,
                purchase.totalAmount.amountMinor,
                "dashboard.series.purchases.amount_minor",
              ),
            ),
          });
      }
      for (const movement of store.inventoryMovements) {
        if (
          movement.workspaceId !== input.workspaceId ||
          (movement.sourceType !== "purchase_receipt" &&
            movement.sourceType !== "purchase_receipt_reversal" &&
            movement.sourceType !== "quality_disposition" &&
            movement.sourceType !== "quality_disposition_reversal")
        )
          continue;
        const date = vietnamBusinessDateForInstant(
          movement.transactionTime,
          input.businessDayStartMinute,
        );
        const point = dates.get(date);
        if (point === undefined) continue;
        add(date, { received: quantities([...point.received, movement.quantity]) });
      }
      for (const movement of store.cashMovements) {
        if (movement.workspaceId !== input.workspaceId) continue;
        const date = vietnamBusinessDateForInstant(
          movement.transactionTime,
          input.businessDayStartMinute,
        );
        const point = dates.get(date);
        if (point !== undefined)
          add(date, {
            cash: money(
              exactAdd(
                point.cash.amountMinor,
                movement.amount.amountMinor,
                "dashboard.series.cash.amount_minor",
              ),
            ),
          });
      }
      return { workspaceId: input.workspaceId, asOf, points: [...dates.values()] };
    },

    orderStatusCounts: async (workspaceId): Promise<DashboardOrderStatusCountsDto> => {
      const rows = await createDashboardReads(store).dashboardReads.operationsBoard({
        workspaceId,
        filter: "all",
        sort: "updated_desc",
        search: "",
        cursor: null,
        limit: Number.MAX_SAFE_INTEGER,
        page: { after: null, limit: Number.MAX_SAFE_INTEGER },
        now: now(),
      });
      const count = (field: "commercialState" | "physicalState" | "financialState") =>
        [...new Set(rows.page.items.map((row) => row[field]))].map((key) => ({
          key,
          count: rows.page.items.filter((row) => row[field] === key).length,
        }));
      return {
        workspaceId,
        asOf: rows.asOf,
        commercial: count("commercialState"),
        physical: count("physicalState"),
        financial: count("financialState"),
      };
    },
    topProducts: async (input: DashboardTopProductsInput): Promise<DashboardTopProductsDto> => {
      const grouped = new Map<
        string,
        {
          productId: string | null;
          productName: string;
          unit: Quantity["unit"];
          quantity: number;
          sales: number;
        }
      >();
      for (const sale of store.sales.values()) {
        if (
          sale.workspaceId !== input.workspaceId ||
          sale.status !== "posted" ||
          sale.voidRecord !== null
        )
          continue;
        for (const line of sale.lines) {
          const groupKey = `${line.productId ?? line.productName}:${line.quantity.unit}`;
          const current = grouped.get(groupKey) ?? {
            productId: line.productId,
            productName: line.productName,
            unit: line.quantity.unit,
            quantity: 0,
            sales: 0,
          };
          current.quantity = exactAdd(
            current.quantity,
            line.quantity.valueScaled,
            "dashboard.top_products.quantity.value_scaled",
          );
          current.sales = exactAdd(
            current.sales,
            line.lineTotal.amountMinor,
            "dashboard.top_products.sales.amount_minor",
          );
          grouped.set(groupKey, current);
        }
      }
      return {
        workspaceId: input.workspaceId,
        asOf: now(),
        products: [...grouped.values()]
          .sort((left, right) =>
            right.sales === left.sales ? 0 : right.sales > left.sales ? 1 : -1,
          )
          .slice(0, input.limit)
          .map((row) => ({
            productId: row.productId as DashboardTopProductsDto["products"][number]["productId"],
            productName: row.productName,
            quantity: { unit: row.unit, valueScaled: row.quantity },
            sales: money(row.sales),
          })),
      };
    },
    operationsBoard: async (input): Promise<OperationsBoardDto> => {
      const rows: Array<OperationsBoardDto["page"]["items"][number]> = [];
      const inspectedAccepted = acceptedAfterInspectionFor(store, input.workspaceId);
      for (const sale of store.sales.values()) {
        if (sale.workspaceId !== input.workspaceId || sale.status !== "posted") continue;
        const physical = salePhysicalState(store, input.workspaceId, sale.id);
        const financial = saleFinancialFacts(store, input.workspaceId, sale.id, input.now);
        const { saleReturnIds, returnSettlementResolved, returnSettlementUnresolved } =
          saleReturnSettlementStatus(
            store,
            input.workspaceId,
            sale.id,
            physical.returnedFulfilment,
          );
        const allocationIds = new Set(
          store.paymentAllocations
            .filter(
              (allocation) =>
                allocation.workspaceId === input.workspaceId && allocation.saleId === sale.id,
            )
            .map((allocation) => allocation.id),
        );
        rows.push({
          id: sale.id,
          kind: "sale",
          reference: `SALE-${sale.id.slice(0, 8).toUpperCase()}`,
          counterparty:
            store.customers.get(key(input.workspaceId, sale.customerId))?.displayName ??
            "Khách hàng",
          amount: sale.totalAmount,
          commercialState:
            sale.voidRecord !== null
              ? "voided"
              : physical.state === "attention"
                ? "attention"
                : "posted",
          physicalState: physical.state,
          financialState: financial.state,
          returnedFulfilment: physical.returnedFulfilment,
          unallocatedPayment: financial.unallocatedPaymentAmountMinor > 0,
          unallocatedPaymentAmount:
            financial.unallocatedPaymentAmountMinor > 0
              ? money(financial.unallocatedPaymentAmountMinor)
              : null,
          ageSeconds: Math.max(0, (Date.parse(input.now) - Date.parse(sale.recordedAt)) / 1000),
          nextAction: saleNextAction({
            voided: sale.voidRecord !== null,
            physicalState: physical.state,
            returnedFulfilment: returnSettlementUnresolved,
            unallocatedPayment: financial.unallocatedPaymentAmountMinor > 0,
            financialState: financial.state,
          }),
          exceptions: deriveOperationsBoardExceptions({
            id: sale.id,
            kind: "sale",
            reference: `SALE-${sale.id.slice(0, 8).toUpperCase()}`,
            href: `/sales/${sale.id}`,
            amountMinor: sale.totalAmount.amountMinor,
            physicalState: physical.state,
            commercialState:
              sale.voidRecord !== null
                ? "voided"
                : physical.state === "attention"
                  ? "attention"
                  : "posted",
            financialState: financial.state,
            returnedFulfilment: physical.returnedFulfilment,
            unallocatedPayment: financial.unallocatedPaymentAmountMinor > 0,
            unallocatedPaymentAmountMinor: financial.unallocatedPaymentAmountMinor,
            fulfilmentRemainderUnresolved: false,
            returnSettlementResolved,
            deliveryId: physical.deliveryId,
          }),
          updatedAt: saleOperationsUpdatedAt(
            store,
            input.workspaceId,
            sale,
            saleReturnIds,
            allocationIds,
          ),
          href: `/sales/${sale.id}`,
          deliveryId:
            physical.deliveryId as OperationsBoardDto["page"]["items"][number]["deliveryId"],
        });
      }
      for (const purchase of store.purchases.values()) {
        if (purchase.workspaceId !== input.workspaceId || purchase.status !== "confirmed") continue;
        const received = [...store.purchaseReceipts.values()]
          .filter(
            (receipt) =>
              receipt.workspaceId === input.workspaceId &&
              receipt.purchaseId === purchase.id &&
              receipt.reversal === null,
          )
          .flatMap((receipt) => receipt.lines);
        const remaining = purchase.lines.some((line) => {
          const got = received
            .filter((item) => item.purchaseLineId === line.lineId)
            .reduce(
              (sum, item) =>
                exactAdd(sum, item.quantity.valueScaled, "dashboard.received.value_scaled"),
              0,
            );
          const accepted = inspectedAccepted.get(line.lineId) ?? 0;
          return (
            exactAdd(got, accepted, "dashboard.received.value_scaled") < line.quantity.valueScaled
          );
        });
        const purchaseReceiptTimes = [...store.purchaseReceipts.values()]
          .filter(
            (receipt) =>
              receipt.workspaceId === input.workspaceId && receipt.purchaseId === purchase.id,
          )
          .flatMap((receipt) => [receipt.recordedAt, receipt.reversal?.recordedAt]);
        const arrivalTimes = [...store.goodsArrivals.values()]
          .filter(
            (arrival) =>
              arrival.workspaceId === input.workspaceId && arrival.purchaseId === purchase.id,
          )
          .map((arrival) => arrival.recordedAt);
        const dispositionTimes = [...store.qualityDispositions.values()]
          .filter((disposition) => disposition.workspaceId === input.workspaceId)
          .filter(
            (disposition) =>
              intakeSourceRoot(store, input.workspaceId, disposition.source)?.arrival.purchaseId ===
              purchase.id,
          )
          .flatMap((disposition) => [disposition.recordedAt, disposition.reversal?.recordedAt]);
        rows.push({
          id: purchase.id,
          kind: "purchase",
          reference: `PUR-${purchase.id.slice(0, 8).toUpperCase()}`,
          counterparty:
            store.suppliers.get(key(input.workspaceId, purchase.supplierId))?.displayName ??
            "Nhà cung cấp",
          amount: purchase.totalAmount,
          commercialState: purchase.voidRecord === null ? "confirmed" : "voided",
          physicalState: remaining ? "needs_receiving" : "received",
          financialState: purchase.voidRecord === null ? "payable" : "voided",
          returnedFulfilment: false,
          unallocatedPayment: false,
          unallocatedPaymentAmount: null,
          ageSeconds: Math.max(0, (Date.parse(input.now) - Date.parse(purchase.recordedAt)) / 1000),
          nextAction: purchase.voidRecord !== null || !remaining ? null : "Nhận hàng",
          exceptions: deriveOperationsBoardExceptions({
            id: purchase.id,
            kind: "purchase",
            reference: `PUR-${purchase.id.slice(0, 8).toUpperCase()}`,
            href: `/purchases/${purchase.id}`,
            amountMinor: purchase.totalAmount.amountMinor,
            physicalState: remaining ? "needs_receiving" : "received",
            commercialState: purchase.voidRecord === null ? "confirmed" : "voided",
            financialState: purchase.voidRecord === null ? "payable" : "voided",
            returnedFulfilment: false,
            unallocatedPayment: false,
            unallocatedPaymentAmountMinor: null,
            fulfilmentRemainderUnresolved: false,
            returnSettlementResolved: false,
            deliveryId: null,
          }),
          updatedAt: latestTimestamp(
            [
              purchase.recordedAt,
              purchase.confirmedAt,
              purchase.voidRecord?.recordedAt,
              ...purchaseReceiptTimes,
              ...arrivalTimes,
              ...dispositionTimes,
            ],
            purchase.recordedAt,
          ),
          href: `/purchases/${purchase.id}`,
          deliveryId: null,
        });
      }
      const searched = rows.filter(
        (row) =>
          input.search.length === 0 ||
          `${row.reference} ${row.counterparty}`
            .toLocaleLowerCase()
            .includes(input.search.toLocaleLowerCase()),
      );
      const filtered = searched
        .filter((row) => matchesOperationsBoardFilter(row, input.filter))
        .sort((left, right) =>
          input.sort === "amount_desc"
            ? right.amount.amountMinor === left.amount.amountMinor
              ? right.id.localeCompare(left.id)
              : right.amount.amountMinor > left.amount.amountMinor
                ? 1
                : -1
            : input.sort === "age_desc"
              ? right.ageSeconds - left.ageSeconds || right.id.localeCompare(left.id)
              : right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id),
        );
      const after = input.page.after;
      const afterRows =
        after === null
          ? filtered
          : filtered.filter((row) => isAfterOperationsBoardCursor(row, input.sort, after));
      const page = takePage(afterRows, input.page, (row) =>
        operationsBoardCursorOf(row, input.sort),
      );
      return {
        workspaceId: input.workspaceId,
        asOf: input.now,
        counts: boardCounts(searched),
        page: {
          items: [...page.rows],
          nextCursor: page.next === null ? null : encodeCursor(page.next),
        },
      };
    },

    operationsBoardCounts: async (
      input: OperationsBoardCountsInput & { readonly now: string },
    ): Promise<OperationsBoardCountsDto> => {
      const page = await createDashboardReads(store).dashboardReads.operationsBoard({
        ...input,
        filter: "all",
        sort: "updated_desc",
        cursor: null,
        limit: Number.MAX_SAFE_INTEGER,
        page: { after: null, limit: Number.MAX_SAFE_INTEGER },
      });
      return {
        workspaceId: input.workspaceId,
        asOf: input.now,
        counts: page.counts ?? boardCounts(page.page.items),
      };
    },
  },
});
