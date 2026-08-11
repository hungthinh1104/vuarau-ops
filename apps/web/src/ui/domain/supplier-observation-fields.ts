import type { SupplierObservationKind } from "@vuarau/domain-contracts";

export type SupplierObservationField =
  | "product"
  | "qualityGrade"
  | "role"
  | "sourceArea"
  | "pickupResponsibility"
  | "packingResponsibility"
  | "transportResponsibility"
  | "leadTime"
  | "paymentArrangement"
  | "traceabilityLevel"
  | "quantity"
  | "expectedAt"
  | "actualAt"
  | "price"
  | "claim";

/** The one UI contract for which facts belong to each observation kind. */
export const SUPPLIER_OBSERVATION_FIELDS: Readonly<
  Record<SupplierObservationKind, readonly SupplierObservationField[]>
> = {
  role: ["role"],
  product_supplied: ["product"],
  source_area: ["sourceArea"],
  pickup_responsibility: ["pickupResponsibility"],
  packing_responsibility: ["packingResponsibility"],
  transport_responsibility: ["transportResponsibility"],
  expected_lead_time: ["leadTime"],
  payment_arrangement: ["paymentArrangement"],
  traceability_level: ["traceabilityLevel"],
  promised_quantity: ["product", "qualityGrade", "quantity"],
  actual_quantity: ["product", "qualityGrade", "quantity"],
  expected_arrival: ["product", "qualityGrade", "expectedAt"],
  actual_arrival: ["product", "qualityGrade", "actualAt"],
  accepted_quantity: ["product", "qualityGrade", "quantity"],
  rejected_quantity: ["product", "qualityGrade", "quantity"],
  claim: ["product", "qualityGrade", "claim"],
  price: ["product", "qualityGrade", "price"],
  other: [],
};

export function supplierObservationHasField(
  kind: SupplierObservationKind,
  field: SupplierObservationField,
): boolean {
  return SUPPLIER_OBSERVATION_FIELDS[kind].includes(field);
}
