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

const now = () => new Date().toISOString();
const money = (amountMinor: number) => ({ amountMinor, currency: "VND" as const });

function availability(updatedAt: string | null = null): DashboardAvailability {
  return { state: "available", diagnostics: [], updatedAt };
}

function quantities(values: readonly Quantity[]): Quantity[] {
  const totals = new Map<string, number>();
  for (const value of values)
    totals.set(value.unit, (totals.get(value.unit) ?? 0) + value.valueScaled);
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
            movement.sourceType === "purchase_receipt_reversal"),
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
        (fulfilled.get(line.saleLineId) ?? 0) + line.quantity.valueScaled,
      );
    }
  }
  for (const returned of store.deliveryReturns) {
    if (returned.workspaceId !== workspaceId) continue;
    for (const line of returned.lines) {
      const saleLineId = deliveryLineToSaleLine.get(line.deliveryLineId);
      if (saleLineId === undefined) continue;
      fulfilled.set(saleLineId, (fulfilled.get(saleLineId) ?? 0) - line.quantity.valueScaled);
    }
  }
  const remaining: Quantity[] = [];
  for (const sale of store.sales.values()) {
    if (sale.workspaceId !== workspaceId || sale.status !== "posted" || sale.voidRecord !== null)
      continue;
    for (const line of sale.lines) {
      const valueScaled = line.quantity.valueScaled - (fulfilled.get(line.lineId) ?? 0);
      if (valueScaled > 0) remaining.push({ ...line.quantity, valueScaled });
    }
  }
  return quantities(remaining);
}

function saleFinancialState(store: Store, workspaceId: string, saleId: string): string {
  const sale = store.sales.get(key(workspaceId, saleId));
  if (sale?.voidRecord !== null && sale?.voidRecord !== undefined) return "voided";
  const allocated = store.paymentAllocations
    .filter((allocation) => allocation.workspaceId === workspaceId && allocation.saleId === saleId)
    .reduce((sum, allocation) => sum + allocation.amount.amountMinor, 0);
  const reversed = store.paymentAllocationReversals
    .filter((reversal) => reversal.workspaceId === workspaceId)
    .filter((reversal) =>
      store.paymentAllocations.some(
        (allocation) => allocation.id === reversal.allocationId && allocation.saleId === saleId,
      ),
    )
    .reduce((sum, reversal) => sum + reversal.amount.amountMinor, 0);
  return sale !== undefined && allocated - reversed >= sale.totalAmount.amountMinor
    ? "paid"
    : "awaiting_payment";
}

function salePhysicalState(
  store: Store,
  workspaceId: string,
  saleId: string,
): {
  state: string;
  deliveryId: string | null;
} {
  const sale = store.sales.get(key(workspaceId, saleId));
  if (sale === undefined) return { state: "unknown", deliveryId: null };
  const fulfilled = new Map<string, number>();
  let deliveryId: string | null = null;
  for (const delivery of store.deliveries.values()) {
    if (delivery.workspaceId !== workspaceId || delivery.saleId !== saleId) continue;
    if (delivery.status === "dispatched" || delivery.status === "delivered") {
      deliveryId = delivery.id;
      for (const line of delivery.lines)
        fulfilled.set(
          line.saleLineId,
          (fulfilled.get(line.saleLineId) ?? 0) + line.quantity.valueScaled,
        );
    }
  }
  const hasRemaining = sale.lines.some(
    (line) => line.quantity.valueScaled > (fulfilled.get(line.lineId) ?? 0),
  );
  if (!hasRemaining) return { state: "delivered", deliveryId };
  return { state: deliveryId === null ? "needs_delivery" : "in_delivery", deliveryId };
}

function boardCounts(rows: readonly OperationsBoardDto["page"]["items"][number][]) {
  return {
    all: rows.length,
    needsReceiving: rows.filter((row) => row.physicalState === "needs_receiving").length,
    needsDelivery: rows.filter((row) => row.physicalState === "needs_delivery").length,
    inDelivery: rows.filter((row) => row.physicalState === "in_delivery").length,
    awaitingPayment: rows.filter((row) => row.financialState === "awaiting_payment").length,
    overdue: rows.filter((row) => row.financialState === "overdue").length,
    attention: rows.filter((row) => row.commercialState === "attention").length,
  };
}

export const createDashboardReads = (store: Store): Pick<Repositories, "dashboardReads"> => ({
  dashboardReads: {
    summary: async (workspaceId) => {
      const asOf = now();
      const sales = [...store.sales.values()].filter(
        (sale) => sale.workspaceId === workspaceId && sale.status === "posted",
      );
      const purchases = [...store.purchases.values()].filter(
        (purchase) => purchase.workspaceId === workspaceId && purchase.status === "confirmed",
      );
      const salesAmount = sales.reduce(
        (sum, sale) =>
          sum + sale.totalAmount.amountMinor - (sale.voidRecord?.amount.amountMinor ?? 0),
        0,
      );
      const purchaseAmount = purchases.reduce(
        (sum, purchase) =>
          sum + purchase.totalAmount.amountMinor - (purchase.voidRecord?.amount.amountMinor ?? 0),
        0,
      );
      const receivables = [...store.balances.values()]
        .filter((balance) => balance.workspaceId === workspaceId && balance.balance.amountMinor > 0)
        .reduce((sum, balance) => sum + balance.balance.amountMinor, 0);
      const payables = [...store.supplierAccountBalances.values()]
        .filter((balance) => balance.workspaceId === workspaceId && balance.balance.amountMinor > 0)
        .reduce((sum, balance) => sum + balance.balance.amountMinor, 0);
      const cash = [...store.cashBalances.values()]
        .filter((balance) => balance.workspaceId === workspaceId)
        .reduce((sum, balance) => sum + balance.balance.amountMinor, 0);
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
        sales: amount(salesAmount, sales.length),
        purchases: amount(purchaseAmount, purchases.length),
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
        outstandingDelivery: quantity(outstandingFor(store, workspaceId), sales.length),
        receivables: amount(
          receivables,
          [...store.balances.values()].filter((balance) => balance.workspaceId === workspaceId)
            .length,
        ),
        payables: amount(
          payables,
          [...store.supplierAccountBalances.values()].filter(
            (balance) => balance.workspaceId === workspaceId,
          ).length,
        ),
        cash: amount(
          cash,
          [...store.cashBalances.values()].filter((balance) => balance.workspaceId === workspaceId)
            .length,
        ),
      };
    },

    salesSeries: async (input: DashboardSeriesInput): Promise<DashboardSeriesDto> => {
      const asOf = now();
      const today = vietnamBusinessDateForInstant(asOf, 0);
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
        if (sale.workspaceId !== input.workspaceId || sale.status !== "posted") continue;
        const date = vietnamBusinessDateForInstant(sale.transactionTime, 0);
        const point = dates.get(date);
        if (point === undefined) continue;
        add(date, {
          sales: money(
            point.sales.amountMinor +
              sale.totalAmount.amountMinor -
              (sale.voidRecord?.amount.amountMinor ?? 0),
          ),
          orderCount: point.orderCount + 1,
        });
      }
      for (const purchase of store.purchases.values()) {
        if (purchase.workspaceId !== input.workspaceId || purchase.status !== "confirmed") continue;
        const date = vietnamBusinessDateForInstant(purchase.transactionTime, 0);
        const point = dates.get(date);
        if (point !== undefined)
          add(date, {
            purchases: money(point.purchases.amountMinor + purchase.totalAmount.amountMinor),
          });
      }
      for (const movement of store.inventoryMovements) {
        if (
          movement.workspaceId !== input.workspaceId ||
          (movement.sourceType !== "purchase_receipt" &&
            movement.sourceType !== "purchase_receipt_reversal")
        )
          continue;
        const date = vietnamBusinessDateForInstant(movement.transactionTime, 0);
        const point = dates.get(date);
        if (point === undefined) continue;
        add(date, { received: quantities([...point.received, movement.quantity]) });
      }
      for (const movement of store.cashMovements) {
        if (movement.workspaceId !== input.workspaceId) continue;
        const date = vietnamBusinessDateForInstant(movement.transactionTime, 0);
        const point = dates.get(date);
        if (point !== undefined)
          add(date, { cash: money(point.cash.amountMinor + movement.amount.amountMinor) });
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
          current.quantity += line.quantity.valueScaled;
          current.sales += line.lineTotal.amountMinor;
          grouped.set(groupKey, current);
        }
      }
      return {
        workspaceId: input.workspaceId,
        asOf: now(),
        products: [...grouped.values()]
          .sort((left, right) => right.sales - left.sales)
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
      const asOf = input.now;
      for (const sale of store.sales.values()) {
        if (sale.workspaceId !== input.workspaceId || sale.status !== "posted") continue;
        const physical = salePhysicalState(store, input.workspaceId, sale.id);
        const financial = saleFinancialState(store, input.workspaceId, sale.id);
        rows.push({
          id: sale.id,
          kind: "sale",
          reference: `SALE-${sale.id.slice(0, 8).toUpperCase()}`,
          counterparty:
            store.customers.get(key(input.workspaceId, sale.customerId))?.displayName ??
            "Khách hàng",
          amount: sale.totalAmount,
          commercialState: sale.voidRecord === null ? "posted" : "voided",
          physicalState: physical.state,
          financialState: financial,
          ageSeconds: Math.max(0, (Date.parse(asOf) - Date.parse(sale.recordedAt)) / 1000),
          nextAction:
            physical.state === "needs_delivery"
              ? "Giao hàng"
              : financial === "awaiting_payment"
                ? "Thu tiền"
                : "Theo dõi",
          updatedAt: sale.postedAt ?? sale.recordedAt,
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
            .reduce((sum, item) => sum + item.quantity.valueScaled, 0);
          return got < line.quantity.valueScaled;
        });
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
          ageSeconds: Math.max(0, (Date.parse(asOf) - Date.parse(purchase.recordedAt)) / 1000),
          nextAction: remaining ? "Nhận hàng" : "Theo dõi",
          updatedAt: purchase.confirmedAt ?? purchase.recordedAt,
          href: `/purchases/${purchase.id}`,
          deliveryId: null,
        });
      }
      const filtered = rows
        .filter(
          (row) =>
            input.search.length === 0 ||
            `${row.reference} ${row.counterparty}`
              .toLocaleLowerCase()
              .includes(input.search.toLocaleLowerCase()),
        )
        .filter(
          (row) =>
            input.filter === "all" ||
            (input.filter === "needs_receiving" && row.physicalState === "needs_receiving") ||
            (input.filter === "needs_delivery" && row.physicalState === "needs_delivery") ||
            (input.filter === "in_delivery" && row.physicalState === "in_delivery") ||
            (input.filter === "awaiting_payment" && row.financialState === "awaiting_payment") ||
            (input.filter === "overdue" && row.financialState === "overdue") ||
            (input.filter === "attention" && row.commercialState === "attention"),
        )
        .sort((left, right) =>
          input.sort === "amount_desc"
            ? right.amount.amountMinor - left.amount.amountMinor
            : input.sort === "age_desc"
              ? right.ageSeconds - left.ageSeconds
              : right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id),
        );
      const cursorOf = (row: OperationsBoardDto["page"]["items"][number]) =>
        input.sort === "amount_desc"
          ? { sortValue: String(row.amount.amountMinor).padStart(20, "0"), id: row.id }
          : input.sort === "age_desc"
            ? { sortValue: String(Math.round(row.ageSeconds)).padStart(20, "0"), id: row.id }
            : { sortValue: row.updatedAt, id: row.id };
      const after = input.page.after;
      const afterRows =
        after === null
          ? filtered
          : filtered.filter((row) => {
              const position = cursorOf(row);
              return (
                position.sortValue < after.sortValue ||
                (position.sortValue === after.sortValue && position.id < after.id)
              );
            });
      const page = takePage(afterRows, input.page, cursorOf);
      return {
        workspaceId: input.workspaceId,
        asOf,
        counts: boardCounts(filtered),
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
        sort: "updated_desc",
        cursor: null,
        limit: Number.MAX_SAFE_INTEGER,
        page: { after: null, limit: Number.MAX_SAFE_INTEGER },
      });
      return { workspaceId: input.workspaceId, asOf: input.now, counts: page.counts };
    },
  },
});
