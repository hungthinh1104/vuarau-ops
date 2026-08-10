import {
  COST_OBSERVATION_KINDS,
  DEMAND_OBSERVATION_KINDS,
  DEBT_OBSERVATION_KINDS,
  RECONCILIATION_OBSERVATION_KINDS,
  SUPPLIER_OBSERVATION_KINDS,
  SUPPLY_COMMITMENT_OBSERVATION_KINDS,
} from "@vuarau/domain-contracts";
import { describe, expect, it } from "vitest";
import { OBSERVATION_FORM_REGISTRY, costObservationForm } from "./observation-form-registry.ts";

describe("observation form registry", () => {
  it("has a contract entry for every supported observation kind", () => {
    expect(Object.keys(OBSERVATION_FORM_REGISTRY.cost_observation).sort()).toEqual(
      [...COST_OBSERVATION_KINDS].sort(),
    );
    expect(Object.keys(OBSERVATION_FORM_REGISTRY.reconciliation_observation).sort()).toEqual(
      [...new Set(RECONCILIATION_OBSERVATION_KINDS)].sort(),
    );
    expect(Object.keys(OBSERVATION_FORM_REGISTRY.debt_observation).sort()).toEqual(
      [...DEBT_OBSERVATION_KINDS].sort(),
    );
    expect(Object.keys(OBSERVATION_FORM_REGISTRY.supply_commitment_observation).sort()).toEqual(
      [...SUPPLY_COMMITMENT_OBSERVATION_KINDS].sort(),
    );
    expect(Object.keys(OBSERVATION_FORM_REGISTRY.supplier_observation).sort()).toEqual(
      [...SUPPLIER_OBSERVATION_KINDS].sort(),
    );
    expect(Object.keys(OBSERVATION_FORM_REGISTRY.demand_observation).sort()).toEqual(
      [...DEMAND_OBSERVATION_KINDS].sort(),
    );
  });

  it("shows only the facts relevant to the selected cost observation", () => {
    expect(costObservationForm("purchase_price").fields).toEqual(["amount"]);
    expect(costObservationForm("accepted_quantity").fields).toContain("quantity");
  });
});
