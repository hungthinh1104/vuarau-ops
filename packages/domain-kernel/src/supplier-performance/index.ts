import type {
  IsoInstant,
  Quantity,
  SupplierEvaluationPolicyDefinition,
  SupplierId,
  SupplierObservationDto,
  SupplierPerformanceDto,
  Unit,
  WorkspaceId,
  WorkspacePolicyVersionId,
} from "@vuarau/domain-contracts";

type QuantityTotals = {
  promised: bigint;
  actual: bigint;
  accepted: bigint;
  rejected: bigint;
  promisedPresent: boolean;
  actualPresent: boolean;
  acceptedPresent: boolean;
  rejectedPresent: boolean;
};
type QuantityTotalField = "promised" | "actual" | "accepted" | "rejected";
type LinkedQuantityTotals = {
  promised: bigint;
  actual: bigint;
  promisedPresent: boolean;
  actualPresent: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1_000;

function quantityOrNull(value: bigint, unit: Unit, present: boolean): Quantity | null {
  return present ? { valueScaled: Number(value), unit } : null;
}

function ratioBasisPoints(numerator: bigint, denominator: bigint): number | null {
  if (denominator <= 0n) return null;
  return Number((numerator * 10_000n + denominator / 2n) / denominator);
}

function isMeasurement(observation: SupplierObservationDto): boolean {
  const facts = observation.facts;
  return (
    facts.promisedQuantity !== null ||
    facts.actualQuantity !== null ||
    facts.acceptedQuantity !== null ||
    facts.rejectedQuantity !== null ||
    facts.expectedAt !== null ||
    facts.actualAt !== null
  );
}

function addQuantity(
  totals: Map<Unit, QuantityTotals>,
  quantity: Quantity | null,
  field: QuantityTotalField,
): boolean {
  if (quantity === null) return true;
  if (quantity.valueScaled < 0 || !Number.isSafeInteger(quantity.valueScaled)) return false;
  const current =
    totals.get(quantity.unit) ??
    ({
      promised: 0n,
      actual: 0n,
      accepted: 0n,
      rejected: 0n,
      promisedPresent: false,
      actualPresent: false,
      acceptedPresent: false,
      rejectedPresent: false,
    } satisfies QuantityTotals);
  current[field] += BigInt(quantity.valueScaled);
  if (field === "promised") current.promisedPresent = true;
  if (field === "actual") current.actualPresent = true;
  if (field === "accepted") current.acceptedPresent = true;
  if (field === "rejected") current.rejectedPresent = true;
  totals.set(quantity.unit, current);
  return true;
}

function safeQuantity(value: bigint, unit: Unit, present: boolean): Quantity | null {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return quantityOrNull(value, unit, present);
}

function addLinkedQuantity(
  groups: Map<string, LinkedQuantityTotals>,
  groupId: string,
  quantity: Quantity | null,
  field: "promised" | "actual",
): void {
  if (quantity === null) return;
  const key = `${groupId}:${quantity.unit}`;
  const current =
    groups.get(key) ??
    ({
      promised: 0n,
      actual: 0n,
      promisedPresent: false,
      actualPresent: false,
    } satisfies LinkedQuantityTotals);
  current[field] += BigInt(quantity.valueScaled);
  if (field === "promised") current.promisedPresent = true;
  if (field === "actual") current.actualPresent = true;
  groups.set(key, current);
}

function unavailable(
  input: SupplierPerformanceCalculationInput,
  windowStart: IsoInstant,
  policyVersionId: WorkspacePolicyVersionId,
  diagnostics: readonly string[],
  observations: readonly SupplierObservationDto[],
  measurementObservationCount: number,
): SupplierPerformanceDto {
  return {
    workspaceId: input.workspaceId,
    supplierId: input.supplierId,
    asOf: input.asOf,
    windowStart,
    status: "unavailable",
    policyVersionId,
    policyVersion: input.policyVersion,
    strategy: input.policy.parameters.strategy,
    calculationVersion: "supplier-performance-v1",
    diagnostics: [...diagnostics],
    observationCount: observations.length,
    measurementObservationCount,
    sourceObservationIds: observations.map((observation) => observation.id),
    quantityMetrics: [],
    timing: null,
  };
}

export type SupplierPerformanceCalculationInput = {
  readonly workspaceId: WorkspaceId;
  readonly supplierId: SupplierId;
  readonly asOf: IsoInstant;
  readonly policy: SupplierEvaluationPolicyDefinition;
  readonly policyVersionId: WorkspacePolicyVersionId;
  readonly policyVersion: number;
  readonly observations: readonly SupplierObservationDto[];
};

/**
 * Derives a descriptive supplier outcome summary from immutable observations.
 * It intentionally has no ranking, recommendation, payable, inventory or claim
 * effect. Corrections supersede their target before the policy window is read.
 */
export function calculateSupplierPerformance(
  input: SupplierPerformanceCalculationInput,
): SupplierPerformanceDto {
  const windowStart = new Date(
    Date.parse(input.asOf) - input.policy.parameters.windowDays * DAY_MS,
  ).toISOString() as IsoInstant;
  const asOfObservations = input.observations.filter(
    (observation) => Date.parse(observation.transactionTime) <= Date.parse(input.asOf),
  );
  const superseded = new Set(
    asOfObservations.flatMap((observation) =>
      observation.relatedObservationId === null ? [] : [observation.relatedObservationId],
    ),
  );
  const relevant = asOfObservations
    .filter(
      (observation) =>
        observation.workspaceId === input.workspaceId &&
        observation.facts.supplierId === input.supplierId &&
        !superseded.has(observation.id) &&
        observation.transactionTime >= windowStart &&
        observation.transactionTime <= input.asOf,
    )
    .sort(
      (left, right) =>
        left.transactionTime.localeCompare(right.transactionTime) ||
        left.recordedAt.localeCompare(right.recordedAt) ||
        left.id.localeCompare(right.id),
    );
  const measurements = relevant.filter(isMeasurement);
  if (measurements.length < input.policy.parameters.minimumObservationCount) {
    return unavailable(
      input,
      windowStart,
      input.policyVersionId,
      ["insufficient_supplier_observations"],
      measurements,
      measurements.length,
    );
  }

  const totals = new Map<Unit, QuantityTotals>();
  const linkedQuantities = new Map<string, LinkedQuantityTotals>();
  let timingMeasured = 0;
  let onTime = 0;
  let late = 0;
  for (const observation of measurements) {
    const facts = observation.facts;
    if (
      !addQuantity(totals, facts.promisedQuantity, "promised") ||
      !addQuantity(totals, facts.actualQuantity, "actual") ||
      !addQuantity(totals, facts.acceptedQuantity, "accepted") ||
      !addQuantity(totals, facts.rejectedQuantity, "rejected")
    ) {
      return unavailable(
        input,
        windowStart,
        input.policyVersionId,
        ["invalid_supplier_quantity_fact"],
        measurements,
        measurements.length,
      );
    }
    const hasQuantityFact =
      facts.promisedQuantity !== null ||
      facts.actualQuantity !== null ||
      facts.acceptedQuantity !== null ||
      facts.rejectedQuantity !== null;
    if (hasQuantityFact && facts.supplierObservationGroupId === null) {
      return unavailable(
        input,
        windowStart,
        input.policyVersionId,
        ["supplier_quantity_lineage_missing"],
        measurements,
        measurements.length,
      );
    }
    if (facts.supplierObservationGroupId !== null) {
      addLinkedQuantity(
        linkedQuantities,
        facts.supplierObservationGroupId,
        facts.promisedQuantity,
        "promised",
      );
      addLinkedQuantity(
        linkedQuantities,
        facts.supplierObservationGroupId,
        facts.actualQuantity,
        "actual",
      );
    }
    if (facts.expectedAt !== null && facts.actualAt !== null) {
      timingMeasured += 1;
      if (Date.parse(facts.actualAt) <= Date.parse(facts.expectedAt)) onTime += 1;
      else late += 1;
    }
  }

  const quantityMetrics = [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([unit, values]) => {
      const promisedQuantity = safeQuantity(values.promised, unit, values.promisedPresent);
      const actualQuantity = safeQuantity(values.actual, unit, values.actualPresent);
      const acceptedQuantity = safeQuantity(values.accepted, unit, values.acceptedPresent);
      const rejectedQuantity = safeQuantity(values.rejected, unit, values.rejectedPresent);
      if (
        (values.promisedPresent && promisedQuantity === null) ||
        (values.actualPresent && actualQuantity === null) ||
        (values.acceptedPresent && acceptedQuantity === null) ||
        (values.rejectedPresent && rejectedQuantity === null)
      ) {
        return null;
      }
      return {
        unit,
        promisedQuantity,
        actualQuantity,
        acceptedQuantity,
        rejectedQuantity,
        fulfilmentRateBasisPoints: (() => {
          const linked = [...linkedQuantities.entries()]
            .filter(
              ([key, group]) =>
                key.endsWith(`:${unit}`) && group.promisedPresent && group.actualPresent,
            )
            .reduce(
              (sum, [, group]) => ({
                promised: sum.promised + group.promised,
                actual: sum.actual + group.actual,
              }),
              { promised: 0n, actual: 0n },
            );
          return ratioBasisPoints(linked.actual, linked.promised);
        })(),
        acceptanceRateBasisPoints: ratioBasisPoints(
          values.accepted,
          values.accepted + values.rejected,
        ),
      };
    });
  if (quantityMetrics.some((metric) => metric === null)) {
    return unavailable(
      input,
      windowStart,
      input.policyVersionId,
      ["supplier_quantity_overflow"],
      measurements,
      measurements.length,
    );
  }

  return {
    workspaceId: input.workspaceId,
    supplierId: input.supplierId,
    asOf: input.asOf,
    windowStart,
    status: "available",
    policyVersionId: input.policyVersionId,
    policyVersion: input.policyVersion,
    strategy: input.policy.parameters.strategy,
    calculationVersion: "supplier-performance-v1",
    diagnostics: [],
    observationCount: relevant.length,
    measurementObservationCount: measurements.length,
    sourceObservationIds: measurements.map((observation) => observation.id),
    quantityMetrics: quantityMetrics.filter((metric) => metric !== null),
    timing: { measuredCount: timingMeasured, onTimeCount: onTime, lateCount: late },
  };
}
