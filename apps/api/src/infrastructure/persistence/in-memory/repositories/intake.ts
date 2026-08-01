import type {
  GoodsArrivalDto,
  QualityDispositionDto,
  QualityDispositionSource,
  QualityDispositionSourceSummaryDto,
} from "@vuarau/domain-contracts";
import type { Repositories } from "../../ports.ts";
import { key } from "../store.ts";
import type { Store } from "../store.ts";

const sourceEqual = (left: QualityDispositionSource, right: QualityDispositionSource): boolean =>
  left.type === right.type &&
  (left.type === "arrival_line"
    ? right.type === "arrival_line" && left.arrivalLineId === right.arrivalLineId
    : right.type === "quarantine_allocation" && left.allocationId === right.allocationId);

function findArrivalLine(store: Store, workspaceId: string, arrivalLineId: string) {
  for (const arrival of store.goodsArrivals.values()) {
    if (arrival.workspaceId !== workspaceId) continue;
    const line = arrival.lines.find((candidate) => candidate.arrivalLineId === arrivalLineId);
    if (line !== undefined) return { arrival, line };
  }
  return null;
}

export function intakeSourceRoot(
  store: Store,
  workspaceId: string,
  source: QualityDispositionSource,
): {
  arrival: GoodsArrivalDto;
  line: GoodsArrivalDto["lines"][number];
  quantity: GoodsArrivalDto["lines"][number]["arrivedQuantity"];
  active: boolean;
} | null {
  if (source.type === "arrival_line") {
    const found = findArrivalLine(store, workspaceId, source.arrivalLineId);
    return found === null
      ? null
      : {
          ...found,
          quantity: found.line.arrivedQuantity,
          active: found.arrival.reversal === null,
        };
  }
  for (const disposition of store.qualityDispositions.values()) {
    if (disposition.workspaceId !== workspaceId) continue;
    const allocation = disposition.allocations.find(
      (candidate) => candidate.allocationId === source.allocationId,
    );
    if (allocation === undefined || allocation.outcome !== "quarantined") continue;
    const root = intakeSourceRoot(store, workspaceId, disposition.source);
    if (root === null) return null;
    return {
      ...root,
      quantity: allocation.quantity,
      active: root.active && disposition.reversal === null,
    };
  }
  return null;
}

export function intakeSourceSummary(
  store: Store,
  workspaceId: string,
  source: QualityDispositionSource,
): { summary: QualityDispositionSourceSummaryDto; active: boolean } | null {
  const root = intakeSourceRoot(store, workspaceId, source);
  if (root === null) return null;
  const allocated = [...store.qualityDispositions.values()]
    .filter(
      (disposition) =>
        disposition.workspaceId === workspaceId &&
        disposition.reversal === null &&
        sourceEqual(disposition.source, source),
    )
    .flatMap((disposition) => disposition.allocations)
    .reduce((sum, allocation) => sum + allocation.quantity.valueScaled, 0);
  const inspected =
    source.type === "arrival_line"
      ? [...store.qualityInspections.values()]
          .filter(
            (inspection) =>
              inspection.workspaceId === workspaceId &&
              inspection.arrivalLineId === source.arrivalLineId &&
              inspection.reversal === null,
          )
          .reduce((sum, inspection) => sum + inspection.inspectedQuantity.valueScaled, 0)
      : null;
  const remaining = root.quantity.valueScaled - allocated;
  const eligible =
    inspected === null ? remaining : Math.max(0, Math.min(root.quantity.valueScaled, inspected) - allocated);
  return {
    summary: {
      source,
      sourceQuantity: root.quantity,
      allocatedQuantity: { valueScaled: allocated, unit: root.quantity.unit },
      remainingQuantity: { valueScaled: remaining, unit: root.quantity.unit },
      inspectedQuantity:
        inspected === null ? null : { valueScaled: inspected, unit: root.quantity.unit },
      eligibleQuantity: { valueScaled: eligible, unit: root.quantity.unit },
      productId: root.line.productId,
      productName: root.line.productName,
      purchaseId: root.arrival.purchaseId,
      purchaseLineId: root.line.purchaseLineId,
      supplierId: root.arrival.supplierId,
    },
    active: root.active,
  };
}

export const createIntakeRepositories = (
  store: Store,
): Pick<
  Repositories,
  "qualityIssueCodes" | "goodsArrivals" | "qualityInspections" | "qualityDispositions"
> => ({
  qualityIssueCodes: {
    findById: async (workspaceId, qualityIssueCodeId) =>
      store.qualityIssueCodes.get(key(workspaceId, qualityIssueCodeId)) ?? null,
    findByIdForUpdate: async (workspaceId, qualityIssueCodeId) =>
      store.qualityIssueCodes.get(key(workspaceId, qualityIssueCodeId)) ?? null,
    insert: async (code) => {
      const codeKey = key(code.workspaceId, code.id);
      if (store.qualityIssueCodes.has(codeKey)) return false;
      if (
        [...store.qualityIssueCodes.values()].some(
          (current) => current.workspaceId === code.workspaceId && current.code === code.code,
        )
      )
        return false;
      store.qualityIssueCodes.set(codeKey, code);
      return true;
    },
    update: async (code, expectedVersion) => {
      const codeKey = key(code.workspaceId, code.id);
      const current = store.qualityIssueCodes.get(codeKey);
      if (current === undefined || current.version !== expectedVersion) return false;
      store.qualityIssueCodes.set(codeKey, code);
      return true;
    },
  },
  goodsArrivals: {
    findById: async (workspaceId, arrivalId) =>
      store.goodsArrivals.get(key(workspaceId, arrivalId)) ?? null,
    findByIdForUpdate: async (workspaceId, arrivalId) =>
      store.goodsArrivals.get(key(workspaceId, arrivalId)) ?? null,
    findLine: async (workspaceId, arrivalLineId) =>
      findArrivalLine(store, workspaceId, arrivalLineId),
    insert: async (arrival) => {
      const arrivalKey = key(arrival.workspaceId, arrival.id);
      if (store.goodsArrivals.has(arrivalKey)) return false;
      store.goodsArrivals.set(arrivalKey, arrival);
      return true;
    },
    insertReversal: async (arrival) => {
      const arrivalKey = key(arrival.workspaceId, arrival.id);
      const current = store.goodsArrivals.get(arrivalKey);
      if (current === undefined || current.reversal !== null || arrival.reversal === null) return false;
      store.goodsArrivals.set(arrivalKey, arrival);
      return true;
    },
    downstreamFactCount: async (workspaceId, arrivalId) => {
      const arrival = store.goodsArrivals.get(key(workspaceId, arrivalId));
      if (arrival === undefined) return 0;
      const lineIds = new Set(arrival.lines.map((line) => line.arrivalLineId));
      const inspections = [...store.qualityInspections.values()].filter(
        (inspection) =>
          inspection.workspaceId === workspaceId &&
          lineIds.has(inspection.arrivalLineId) &&
          inspection.reversal === null,
      ).length;
      const dispositions = [...store.qualityDispositions.values()].filter(
        (disposition) =>
          disposition.workspaceId === workspaceId &&
          disposition.reversal === null &&
          disposition.source.type === "arrival_line" &&
          lineIds.has(disposition.source.arrivalLineId),
      ).length;
      return inspections + dispositions;
    },
    hasActiveForPurchase: async (workspaceId, purchaseId) =>
      [...store.goodsArrivals.values()].some(
        (arrival) =>
          arrival.workspaceId === workspaceId &&
          arrival.purchaseId === purchaseId &&
          arrival.reversal === null,
      ),
  },
  qualityInspections: {
    findById: async (workspaceId, inspectionId) =>
      store.qualityInspections.get(key(workspaceId, inspectionId)) ?? null,
    findByIdForUpdate: async (workspaceId, inspectionId) =>
      store.qualityInspections.get(key(workspaceId, inspectionId)) ?? null,
    activeInspectedQuantity: async (workspaceId, arrivalLineId) => {
      const active = [...store.qualityInspections.values()].filter(
        (inspection) =>
          inspection.workspaceId === workspaceId &&
          inspection.arrivalLineId === arrivalLineId &&
          inspection.reversal === null,
      );
      if (active.length === 0) return null;
      return {
        valueScaled: active.reduce(
          (sum, inspection) => sum + inspection.inspectedQuantity.valueScaled,
          0,
        ),
        unit: active[0]!.inspectedQuantity.unit,
      };
    },
    downstreamFactCount: async (workspaceId, arrivalLineId) =>
      [...store.qualityDispositions.values()].filter(
        (disposition) =>
          disposition.workspaceId === workspaceId &&
          disposition.reversal === null &&
          disposition.source.type === "arrival_line" &&
          disposition.source.arrivalLineId === arrivalLineId,
      ).length,
    insert: async (inspection) => {
      const inspectionKey = key(inspection.workspaceId, inspection.id);
      if (store.qualityInspections.has(inspectionKey)) return false;
      store.qualityInspections.set(inspectionKey, inspection);
      return true;
    },
    insertReversal: async (inspection) => {
      const inspectionKey = key(inspection.workspaceId, inspection.id);
      const current = store.qualityInspections.get(inspectionKey);
      if (current === undefined || current.reversal !== null || inspection.reversal === null) return false;
      store.qualityInspections.set(inspectionKey, inspection);
      return true;
    },
  },
  qualityDispositions: {
    findById: async (workspaceId, dispositionId) =>
      store.qualityDispositions.get(key(workspaceId, dispositionId)) ?? null,
    findByIdForUpdate: async (workspaceId, dispositionId) =>
      store.qualityDispositions.get(key(workspaceId, dispositionId)) ?? null,
    sourceSummary: async (workspaceId, source) => intakeSourceSummary(store, workspaceId, source),
    downstreamFactCount: async (workspaceId, dispositionId) => {
      const disposition = store.qualityDispositions.get(key(workspaceId, dispositionId));
      if (disposition === undefined) return 0;
      const quarantineIds = new Set(
        disposition.allocations
          .filter((allocation) => allocation.outcome === "quarantined")
          .map((allocation) => allocation.allocationId),
      );
      return [...store.qualityDispositions.values()].filter(
        (candidate) =>
          candidate.workspaceId === workspaceId &&
          candidate.reversal === null &&
          candidate.source.type === "quarantine_allocation" &&
          quarantineIds.has(candidate.source.allocationId),
      ).length;
    },
    acceptedQuantityForPurchaseLine: async (workspaceId, purchaseLineId) => {
      let unit: QualityDispositionDto["allocations"][number]["quantity"]["unit"] | null = null;
      let valueScaled = 0;
      for (const disposition of store.qualityDispositions.values()) {
        if (disposition.workspaceId !== workspaceId || disposition.reversal !== null) continue;
        const root = intakeSourceRoot(store, workspaceId, disposition.source);
        if (root === null || root.line.purchaseLineId !== purchaseLineId) continue;
        for (const allocation of disposition.allocations) {
          if (allocation.outcome !== "accepted") continue;
          unit ??= allocation.quantity.unit;
          if (unit !== allocation.quantity.unit) throw new Error("Accepted purchase quantities use mixed units.");
          valueScaled += allocation.quantity.valueScaled;
        }
      }
      return unit === null ? null : { valueScaled, unit };
    },
    insert: async (disposition: QualityDispositionDto) => {
      const dispositionKey = key(disposition.workspaceId, disposition.id);
      if (store.qualityDispositions.has(dispositionKey)) return false;
      store.qualityDispositions.set(dispositionKey, disposition);
      return true;
    },
    insertReversal: async (disposition) => {
      const dispositionKey = key(disposition.workspaceId, disposition.id);
      const current = store.qualityDispositions.get(dispositionKey);
      if (current === undefined || current.reversal !== null || disposition.reversal === null)
        return false;
      store.qualityDispositions.set(dispositionKey, disposition);
      return true;
    },
  },
});
