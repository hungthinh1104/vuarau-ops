import type { DebtObservationDto } from "@vuarau/domain-contracts";
import { sumExactIntegers } from "@vuarau/domain-kernel";

/**
 * Active customer-credit facts are the current tips of their append-only
 * correction chains. A correction replaces its target for read-time purposes;
 * neither row is deleted.
 */
export function activeCustomerCreditAmount(
  observations: readonly DebtObservationDto[],
  excludeObservationId: string | null = null,
): number | null {
  return sumExactIntegers(
    observations
      .filter(
        (observation) =>
          !observations.some((successor) => successor.relatedObservationId === observation.id),
      )
      .filter((observation) => observation.id !== excludeObservationId)
      .map((observation) => observation.facts.amount?.amountMinor ?? 0),
  );
}
