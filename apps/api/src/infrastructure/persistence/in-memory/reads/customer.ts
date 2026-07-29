import type { Repositories } from "../../ports.ts";
import { classifyBalance, zeroMoney } from "@vuarau/domain-kernel";
import { DEFAULT_CURRENCY } from "@vuarau/domain-contracts";
import { key, ascendingBy, descendingBy, after, takePage, fold } from "../store.ts";
import type { Store } from "../store.ts";

export const createCustomerReads = (store: Store): Pick<Repositories, "customerReads"> => ({
  customerReads: {
    search: async ({ workspaceId, query, isActive, page }) => {
      const needle = fold(query);
      const matched = [...store.customers.values()]
        .filter((customer) => customer.workspaceId === workspaceId)
        .filter((customer) => isActive === null || customer.isActive === isActive)
        .filter(
          (customer) =>
            needle.length === 0 ||
            fold(customer.displayName).includes(needle) ||
            (customer.phone ?? "").includes(query),
        )
        .sort(
          ascendingBy(
            (customer) => customer.displayName,
            (customer) => customer.id,
          ),
        )
        .filter((customer) =>
          page.after === null
            ? true
            : after([customer.displayName, customer.id], [page.after.sortValue, page.after.id]),
        )
        .map((customer) => {
          const stored = store.balances.get(key(workspaceId, customer.id));
          const balance = stored?.balance ?? zeroMoney(DEFAULT_CURRENCY);
          return {
            id: customer.id,
            workspaceId: customer.workspaceId,
            displayName: customer.displayName,
            phone: customer.phone,
            isActive: customer.isActive,
            version: customer.version,
            balance,
            classification: classifyBalance(balance),
            lastEntryTransactionTime: stored?.lastEntryTransactionTime ?? null,
          };
        });

      return takePage(matched, page, (row) => ({
        sortValue: row.displayName,
        id: row.id,
      }));
    },

    get: async (workspaceId, customerId) => {
      const customer = store.customers.get(key(workspaceId, customerId));
      if (customer === undefined) {
        return null;
      }
      const stored = store.balances.get(key(workspaceId, customerId));
      const balance = stored?.balance ?? zeroMoney(DEFAULT_CURRENCY);
      return { customer, balance, classification: classifyBalance(balance) };
    },

    recent: async (workspaceId, limit) => {
      const activeSales = [...store.sales.values()].filter(
        (sale) =>
          sale.workspaceId === workspaceId && sale.status === "posted" && sale.voidRecord === null,
      );
      return [...store.customers.values()]
        .filter((customer) => customer.workspaceId === workspaceId && customer.isActive)
        .map((customer) => {
          const lastSale = activeSales
            .filter((sale) => sale.customerId === customer.id)
            .sort(
              descendingBy(
                (sale) => sale.transactionTime,
                (sale) => sale.id,
              ),
            )[0];
          const stored = store.balances.get(key(workspaceId, customer.id));
          const balance = stored?.balance ?? zeroMoney(DEFAULT_CURRENCY);
          return {
            customerId: customer.id,
            displayName: customer.displayName,
            phone: customer.phone,
            balance,
            classification: classifyBalance(balance),
            lastSaleTransactionTime: lastSale?.transactionTime ?? null,
          };
        })
        .filter((customer) => customer.lastSaleTransactionTime !== null)
        .sort(
          descendingBy(
            (customer) => customer.lastSaleTransactionTime!,
            (customer) => customer.customerId,
          ),
        )
        .slice(0, limit);
    },

    possibleDuplicates: async ({ workspaceId, displayName, phone, excludeCustomerId, limit }) => {
      const normalizedName = fold(displayName.trim());
      const normalizedPhone = phone?.replace(/\D/g, "") ?? "";
      return [...store.customers.values()]
        .filter((customer) => customer.workspaceId === workspaceId)
        .filter((customer) => customer.id !== excludeCustomerId)
        .flatMap((customer) => {
          const reasons: Array<"same_name" | "same_phone"> = [];
          if (normalizedName.length > 0 && fold(customer.displayName.trim()) === normalizedName)
            reasons.push("same_name");
          if (
            normalizedPhone.length > 0 &&
            (customer.phone ?? "").replace(/\D/g, "") === normalizedPhone
          )
            reasons.push("same_phone");
          if (reasons.length === 0) return [];
          const stored = store.balances.get(key(workspaceId, customer.id));
          const balance = stored?.balance ?? zeroMoney(DEFAULT_CURRENCY);
          return [
            {
              customer: {
                id: customer.id,
                workspaceId: customer.workspaceId,
                displayName: customer.displayName,
                phone: customer.phone,
                isActive: customer.isActive,
                version: customer.version,
                balance,
                classification: classifyBalance(balance),
                lastEntryTransactionTime: stored?.lastEntryTransactionTime ?? null,
              },
              reasons,
            },
          ];
        })
        .sort((a, b) =>
          a.customer.displayName === b.customer.displayName
            ? a.customer.id.localeCompare(b.customer.id)
            : a.customer.displayName.localeCompare(b.customer.displayName),
        )
        .slice(0, limit);
    },
  },
});
