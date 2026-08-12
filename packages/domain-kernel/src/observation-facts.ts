import {
  OBSERVATION_FACT_REGISTRY,
  type ObservationFactFamily,
  type ObservationFactKey,
} from "@vuarau/domain-contracts";
import { err } from "./shared/result.ts";
import type { DomainResult } from "./shared/result.ts";

const NON_NEGATIVE_FACTS = new Set<string>([
  "amount",
  "quantity",
  "expectedQuantity",
  "observedQuantity",
  "itemCount",
  "promisedQuantity",
  "actualQuantity",
  "acceptedQuantity",
  "rejectedQuantity",
  "requestedQuantity",
  "minimumQuantity",
  "minimumOrder",
  "price",
  "quantity",
  "expectedAmount",
  "observedAmount",
]);

/**
 * Validate the wide persisted fact envelope before a new observation is
 * accepted. Legacy rows remain readable; new rows cannot smuggle stale facts
 * from a previously selected kind into another kind.
 */
export function validateObservationFacts(
  family: ObservationFactFamily,
  kind: string,
  facts: Record<string, unknown>,
): DomainResult<null> {
  const allowed = OBSERVATION_FACT_REGISTRY[family][kind as never] as
    readonly ObservationFactKey[] | undefined;
  if (allowed === undefined) {
    return err("OBSERVATION_FACT_NOT_ALLOWED", "The observation kind has no fact contract.", {
      family,
      kind,
    });
  }

  for (const [key, value] of Object.entries(facts)) {
    if (value === null || value === undefined || !Object.hasOwn(facts, key)) continue;
    if (!allowed.includes(key as ObservationFactKey)) {
      return err(
        "OBSERVATION_FACT_NOT_ALLOWED",
        "A fact is not allowed for this observation kind.",
        {
          family,
          kind,
          fact: key,
        },
      );
    }
    if (!NON_NEGATIVE_FACTS.has(key as ObservationFactKey)) continue;
    const numericValue =
      typeof value === "object" && value !== null
        ? ((value as { amountMinor?: unknown; valueScaled?: unknown }).amountMinor ??
          (value as { valueScaled?: unknown }).valueScaled)
        : value;
    if (typeof numericValue === "number" && numericValue < 0) {
      return err(
        "OBSERVATION_FACT_NEGATIVE",
        "Observed amounts and quantities cannot be negative.",
        {
          family,
          kind,
          fact: key,
        },
      );
    }
  }
  return { ok: true, value: null };
}

/** Cost and reconciliation use separate kind maps but share the same magnitude rule. */
export function validateObservationMagnitudes(facts: Record<string, unknown>): DomainResult<null> {
  for (const [key, value] of Object.entries(facts)) {
    if (value === null || value === undefined || !NON_NEGATIVE_FACTS.has(key)) continue;
    const numericValue =
      typeof value === "object" && value !== null
        ? ((value as { amountMinor?: unknown; valueScaled?: unknown }).amountMinor ??
          (value as { valueScaled?: unknown }).valueScaled)
        : value;
    if (typeof numericValue === "number" && numericValue < 0) {
      return err(
        "OBSERVATION_FACT_NEGATIVE",
        "Observed amounts and quantities cannot be negative.",
        {
          fact: key,
        },
      );
    }
  }
  return { ok: true, value: null };
}
