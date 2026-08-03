import type { Repositories } from "../../ports.ts";
import { after, ascendingBy, key, takePage } from "../store.ts";
import type { Store } from "../store.ts";

const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("đ", "d")
    .replaceAll("Đ", "D")
    .toLowerCase();

import { intakeSourceRoot, intakeSourceSummary } from "../repositories/intake.ts";

export const createIntakeReads = (store: Store): Pick<Repositories, "intakeReads"> => ({
  intakeReads: {
    searchIssueCodes: async ({ workspaceId, query, isActive, page }) => {
      const needle = fold(query.trim());
      const rows = [...store.qualityIssueCodes.values()]
        .filter((row) => row.workspaceId === workspaceId)
        .filter((row) => isActive === null || row.isActive === isActive)
        .filter(
          (row) =>
            needle.length === 0 ||
            fold(`${row.code} ${row.displayName} ${row.description ?? ""}`).includes(needle),
        )
        .sort(
          ascendingBy(
            (row) => row.displayName,
            (row) => row.id,
          ),
        )
        .filter((row) =>
          page.after === null
            ? true
            : after([row.displayName, row.id], [page.after.sortValue, page.after.id]),
        );
      return takePage(rows, page, (row) => ({ sortValue: row.displayName, id: row.id }));
    },
    arrival: async (workspaceId, arrivalId) =>
      store.goodsArrivals.get(key(workspaceId, arrivalId)) ?? null,
    listArrivals: async ({ workspaceId, supplierId, purchaseId, page }) => {
      const rows = [...store.goodsArrivals.values()]
        .filter((row) => row.workspaceId === workspaceId)
        .filter((row) => supplierId === null || row.supplierId === supplierId)
        .filter((row) => purchaseId === null || row.purchaseId === purchaseId)
        .sort((a, b) =>
          a.transactionTime === b.transactionTime
            ? b.id.localeCompare(a.id)
            : b.transactionTime.localeCompare(a.transactionTime),
        )
        .filter((row) => {
          if (page.after === null) return true;
          return (
            row.transactionTime < page.after.sortValue ||
            (row.transactionTime === page.after.sortValue && row.id < page.after.id)
          );
        });
      return takePage(rows, page, (row) => ({ sortValue: row.transactionTime, id: row.id }));
    },
    inspection: async (workspaceId, inspectionId) =>
      store.qualityInspections.get(key(workspaceId, inspectionId)) ?? null,
    disposition: async (workspaceId, dispositionId) =>
      store.qualityDispositions.get(key(workspaceId, dispositionId)) ?? null,
    dispositionSourceSummary: async (workspaceId, source) =>
      intakeSourceSummary(store, workspaceId, source)?.summary ?? null,
    arrivalLineHistory: async (workspaceId, arrivalLineId) => ({
      arrivalLineId,
      inspections: [...store.qualityInspections.values()]
        .filter(
          (inspection) =>
            inspection.workspaceId === workspaceId && inspection.arrivalLineId === arrivalLineId,
        )
        .sort((left, right) => left.transactionTime.localeCompare(right.transactionTime)),
      dispositions: [...store.qualityDispositions.values()]
        .filter((disposition) => {
          if (disposition.workspaceId !== workspaceId) return false;
          return (
            intakeSourceRoot(store, workspaceId, disposition.source)?.line.arrivalLineId ===
            arrivalLineId
          );
        })
        .sort((left, right) => left.transactionTime.localeCompare(right.transactionTime)),
    }),
  },
});
