import type { Repositories } from "../../ports.ts";
import type { OperationalReportDto } from "@vuarau/domain-contracts";
import { money } from "@vuarau/domain-kernel";
import { encodeCursor, vietnamBusinessDateForInstant } from "@vuarau/domain-contracts";
import type { InventoryMovementState } from "@vuarau/domain-kernel";
import { key, takePage } from "../store.ts";
import type { Store } from "../store.ts";

export const createReportReads = (store: Store): Pick<Repositories, "reportReads"> => ({
  reportReads: {
    operational: async ({
      workspaceId,
      reportType,
      businessDate,
      businessDayStartMinute,
      productId,
      unit,
      page,
    }) => {
      type Row = OperationalReportDto["page"]["items"][number];
      let rows: Row[] = [];
      if (reportType === "customer_account_activity") {
        rows = store.accountEntries
          .filter((entry) => entry.workspaceId === workspaceId)
          .filter(
            (entry) =>
              businessDate === null ||
              vietnamBusinessDateForInstant(entry.transactionTime, businessDayStartMinute ?? 0) ===
                businessDate,
          )
          .map((entry) => ({
            id: entry.id,
            label: entry.sourceType.replaceAll("_", " "),
            productId: null,
            productName: null,
            qualityGradeId: null,
            qualityGradeName: null,
            sourceType: entry.sourceType,
            sourceId: entry.sourceId,
            documentHref:
              entry.sourceType === "sale_posting"
                ? `/sales/${entry.sourceId}`
                : entry.sourceType === "sale_void"
                  ? `/sales/${store.saleVoids.find((row) => row.id === entry.sourceId)?.saleId ?? entry.sourceId}`
                  : entry.sourceType === "payment"
                    ? `/payments/${entry.sourceId}`
                    : entry.sourceType === "payment_reversal"
                      ? `/payments/${store.reversals.find((row) => row.id === entry.sourceId)?.paymentId ?? entry.sourceId}`
                      : `/account-adjustments/${entry.sourceId}`,
            transactionTime: entry.transactionTime,
            amount: entry.amount,
            quantity: null,
            status: "canonical",
          }));
      } else if (reportType === "customer_receivables") {
        rows = [...store.customers.values()]
          .filter((customer) => customer.workspaceId === workspaceId)
          .flatMap((customer) => {
            const balance = store.balances.get(key(workspaceId, customer.id));
            return balance === undefined || balance.balance.amountMinor <= 0
              ? []
              : [
                  {
                    id: customer.id,
                    label: customer.displayName,
                    productId: null,
                    productName: null,
                    qualityGradeId: null,
                    qualityGradeName: null,
                    sourceType: "customer",
                    sourceId: customer.id,
                    documentHref: `/customers/${customer.id}`,
                    transactionTime: balance.lastEntryTransactionTime,
                    amount: balance.balance,
                    quantity: null,
                    status: "receivable",
                  },
                ];
          });
      } else if (reportType === "supplier_payables") {
        rows = [...store.suppliers.values()]
          .filter((supplier) => supplier.workspaceId === workspaceId)
          .flatMap((supplier) => {
            const balance = store.supplierAccountBalances.get(key(workspaceId, supplier.id));
            return balance === undefined || balance.balance.amountMinor <= 0
              ? []
              : [
                  {
                    id: supplier.id,
                    label: supplier.displayName,
                    productId: null,
                    productName: null,
                    qualityGradeId: null,
                    qualityGradeName: null,
                    sourceType: "supplier",
                    sourceId: supplier.id,
                    documentHref: `/suppliers/${supplier.id}`,
                    transactionTime: balance.lastEntryTransactionTime,
                    amount: balance.balance,
                    quantity: null,
                    status: "payable",
                  },
                ];
          });
      } else if (reportType === "cash_balances") {
        rows = [...store.cashAccounts.values()]
          .filter((account) => account.workspaceId === workspaceId)
          .map((account) => {
            const balance = store.cashBalances.get(key(workspaceId, account.id));
            return {
              id: account.id,
              label: account.displayName,
              productId: null,
              productName: null,
              qualityGradeId: null,
              qualityGradeName: null,
              sourceType: "cash_account",
              sourceId: account.id,
              documentHref: `/cash/accounts/${account.id}`,
              transactionTime: balance?.lastMovementTransactionTime ?? null,
              amount: balance?.balance ?? { amountMinor: 0, currency: account.currency },
              quantity: null,
              status: account.isActive ? "active" : "inactive",
            };
          });
      } else if (reportType === "cash_movement_report") {
        rows = store.cashMovements
          .filter((movement) => movement.workspaceId === workspaceId)
          .filter(
            (movement) =>
              businessDate === null ||
              vietnamBusinessDateForInstant(
                movement.transactionTime,
                businessDayStartMinute ?? 0,
              ) === businessDate,
          )
          .map((movement) => ({
            id: movement.id,
            label: `${store.cashAccounts.get(key(workspaceId, movement.cashAccountId))?.displayName ?? "Tài khoản tiền"} · ${movement.sourceType}`,
            productId: null,
            productName: null,
            qualityGradeId: null,
            qualityGradeName: null,
            sourceType: movement.sourceType,
            sourceId: movement.sourceId,
            documentHref: `/cash/accounts/${movement.cashAccountId}`,
            transactionTime: movement.transactionTime,
            amount: movement.amount,
            quantity: null,
            status: movement.amount.amountMinor >= 0 ? "cash_in" : "cash_out",
          }));
      } else if (reportType === "expense_report") {
        rows = [...store.expenses.values()]
          .filter((expense) => expense.workspaceId === workspaceId && expense.reversal === null)
          .filter(
            (expense) =>
              businessDate === null ||
              vietnamBusinessDateForInstant(
                expense.transactionTime,
                businessDayStartMinute ?? 0,
              ) === businessDate,
          )
          .map((expense) => ({
            id: expense.id,
            label: `${expense.category} · ${store.cashAccounts.get(key(workspaceId, expense.cashAccountId))?.displayName ?? "Tài khoản tiền"}`,
            productId: null,
            productName: null,
            qualityGradeId: null,
            qualityGradeName: null,
            sourceType: "expense",
            sourceId: expense.id,
            documentHref: `/cash/expenses/${expense.id}`,
            transactionTime: expense.transactionTime,
            amount: expense.amount,
            quantity: null,
            status: "expense",
          }));
      } else if (reportType === "inventory_by_product_unit") {
        rows = [...store.inventoryBalances.values()]
          .filter((balance) => balance.workspaceId === workspaceId)
          .filter((balance) => productId === null || balance.productId === productId)
          .filter((balance) => unit === null || balance.unit === unit)
          .flatMap((balance) => {
            const product = store.products.get(key(workspaceId, balance.productId));
            const qualityGradeName = balance.qualityGradeId
              ? (store.qualityGrades.get(key(workspaceId, balance.qualityGradeId))?.name ?? null)
              : null;
            return product === undefined
              ? []
              : [
                  {
                    id: `${product.id}:${balance.qualityGradeId ?? "legacy"}:${balance.unit}`,
                    label: `${product.displayName} · ${qualityGradeName ?? "Chưa phân hạng"} · ${balance.unit}`,
                    productId: product.id,
                    productName: product.displayName,
                    qualityGradeId: balance.qualityGradeId,
                    qualityGradeName: qualityGradeName,
                    sourceType: "product",
                    sourceId: product.id,
                    documentHref: `/products/${product.id}/inventory`,
                    transactionTime: balance.lastMovementTransactionTime,
                    amount: null,
                    quantity: { valueScaled: balance.quantityScaled, unit: balance.unit },
                    status:
                      balance.quantityScaled < 0
                        ? "negative"
                        : balance.quantityScaled === 0
                          ? "zero"
                          : "positive",
                  },
                ];
          });
      } else if (reportType === "inventory_movement_report") {
        rows = store.inventoryMovements
          .filter((movement) => movement.workspaceId === workspaceId)
          .filter(
            (movement) =>
              businessDate === null ||
              vietnamBusinessDateForInstant(
                movement.transactionTime,
                businessDayStartMinute ?? 0,
              ) === businessDate,
          )
          .filter((movement) => productId === null || movement.productId === productId)
          .filter((movement) => unit === null || movement.quantity.unit === unit)
          .map((movement) => {
            const product = store.products.get(key(workspaceId, movement.productId));
            return {
              id: movement.id,
              label: movement.sourceType.replaceAll("_", " "),
              productId: movement.productId,
              productName: product?.displayName ?? "",
              qualityGradeId: movement.qualityGradeId,
              qualityGradeName: movement.qualityGradeName,
              sourceType: movement.sourceType,
              sourceId: movement.sourceId,
              documentHref:
                movement.sourceType === "delivery_dispatch"
                  ? `/deliveries/${movement.sourceId}`
                  : movement.sourceType === "delivery_return"
                    ? `/deliveries/${store.deliveryReturns.find((row) => row.id === movement.sourceId)?.deliveryId ?? movement.sourceId}`
                    : movement.sourceType === "purchase_receipt"
                      ? `/receipts/${movement.sourceId}`
                      : movement.sourceType === "purchase_receipt_reversal"
                        ? `/receipts/${
                            [...store.purchaseReceipts.values()].find(
                              (receipt) => receipt.reversal?.id === movement.sourceId,
                            )?.id ?? movement.sourceId
                          }`
                        : movement.sourceType === "inventory_adjustment"
                          ? `/inventory-adjustments/${movement.sourceId}`
                          : null,
              transactionTime: movement.transactionTime,
              amount: null,
              quantity: movement.quantity,
              status: "canonical",
            };
          });
      } else if (reportType === "outstanding_delivery") {
        for (const sale of store.sales.values()) {
          if (sale.workspaceId !== workspaceId || sale.status !== "posted") continue;
          const fulfilled = new Map<string, number>();
          for (const delivery of store.deliveries.values()) {
            if (
              delivery.workspaceId !== workspaceId ||
              delivery.saleId !== sale.id ||
              !["dispatched", "delivered"].includes(delivery.status)
            )
              continue;
            for (const line of delivery.lines)
              fulfilled.set(
                line.saleLineId,
                (fulfilled.get(line.saleLineId) ?? 0) + line.quantity.valueScaled,
              );
            for (const returned of delivery.returns)
              for (const returnLine of returned.lines) {
                const deliveryLine = delivery.lines.find(
                  (line) => line.deliveryLineId === returnLine.deliveryLineId,
                );
                if (deliveryLine !== undefined)
                  fulfilled.set(
                    deliveryLine.saleLineId,
                    (fulfilled.get(deliveryLine.saleLineId) ?? 0) - returnLine.quantity.valueScaled,
                  );
              }
          }
          for (const line of sale.lines) {
            const remaining = line.quantity.valueScaled - (fulfilled.get(line.lineId) ?? 0);
            if (remaining > 0)
              rows.push({
                id: line.lineId,
                label: line.productName,
                productId: line.productId ?? null,
                productName: line.productName,
                qualityGradeId: line.qualityGradeId ?? null,
                qualityGradeName: line.qualityGradeName ?? null,
                sourceType: "sale",
                sourceId: sale.id,
                documentHref: `/sales/${sale.id}`,
                transactionTime: sale.transactionTime,
                amount: null,
                quantity: { valueScaled: remaining, unit: line.quantity.unit },
                status: "outstanding",
              });
          }
        }
      }
      rows.sort((a, b) => {
        const left = `${a.transactionTime ?? ""}|${a.id}`;
        const right = `${b.transactionTime ?? ""}|${b.id}`;
        return right.localeCompare(left);
      });
      const all = rows;
      if (page.after !== null) {
        const boundary = `${page.after.sortValue}|${page.after.id}`;
        rows = rows.filter((row) => `${row.transactionTime ?? ""}|${row.id}` < boundary);
      }
      const pageResult = takePage(rows, page, (row) => ({
        sortValue: row.transactionTime ?? "",
        id: row.id,
      }));
      const quantities = new Map<string, number>();
      for (const row of all)
        if (row.quantity !== null)
          quantities.set(
            row.quantity.unit,
            (quantities.get(row.quantity.unit) ?? 0) + row.quantity.valueScaled,
          );
      const amounts = all.flatMap((row) => (row.amount === null ? [] : [row.amount]));
      return {
        reportType,
        businessDate,
        timezone: "Asia/Ho_Chi_Minh",
        integrity: "healthy",
        diagnostics: [],
        totals: {
          amount:
            amounts.length === 0
              ? null
              : money(
                  amounts.reduce((sum, amount) => sum + amount.amountMinor, 0),
                  "VND",
                ),
          quantities: [...quantities].map(([quantityUnit, valueScaled]) => ({
            unit: quantityUnit as InventoryMovementState["quantity"]["unit"],
            valueScaled,
          })),
        },
        page: {
          items: [...pageResult.rows],
          nextCursor: pageResult.next === null ? null : encodeCursor(pageResult.next),
        },
      } satisfies OperationalReportDto;
    },
  },
});
