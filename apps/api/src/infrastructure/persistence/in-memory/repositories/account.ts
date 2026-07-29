import type { Repositories } from "../../ports.ts";
import type { CustomerAccountEntryDto } from "@vuarau/domain-contracts";
import { key } from "../store.ts";
import type { IdGenerator } from "../../../clock.ts";
import type { Store } from "../store.ts";

export const createAccountRepositories = (
  store: Store,
  ids: IdGenerator,
): Pick<Repositories, "accountEntries" | "accountBalances"> => ({
  accountEntries: {
    append: async (drafts) => {
      const appended: CustomerAccountEntryDto[] = [];
      for (const draft of drafts) {
        // Mirrors UNIQUE (source_type, source_id) in Postgres: a second entry
        // for the same posting, void, or payment is unrepresentable, not merely
        // unlikely (docs/07-data/ledger-model.md).
        const duplicate = store.accountEntries.some(
          (entry) =>
            entry.workspaceId === draft.workspaceId &&
            entry.sourceType === draft.sourceType &&
            entry.sourceId === draft.sourceId,
        );
        if (duplicate) {
          throw new Error(
            `Duplicate account entry for ${draft.sourceType}:${draft.sourceId} — ` +
              "unique (source_type, source_id) violated.",
          );
        }
        const entry: CustomerAccountEntryDto = {
          ...draft,
          id: ids.newId() as CustomerAccountEntryDto["id"],
        };
        store.accountEntries.push(entry);
        appended.push(entry);
      }
      return appended;
    },
    listByCustomer: async (workspaceId, customerId) =>
      store.accountEntries.filter(
        (entry) => entry.workspaceId === workspaceId && entry.customerId === customerId,
      ),
    findBySource: async (workspaceId, sourceType, sourceId) =>
      store.accountEntries.find(
        (entry) =>
          entry.workspaceId === workspaceId &&
          entry.sourceType === sourceType &&
          entry.sourceId === sourceId,
      ) ?? null,
  },
  accountBalances: {
    get: async (workspaceId, customerId) =>
      store.balances.get(key(workspaceId, customerId)) ?? null,
    save: async (summary) => {
      store.balances.set(key(summary.workspaceId, summary.customerId), summary);
    },
  },
});
