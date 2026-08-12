import {
  OBSERVATION_FACT_REGISTRY,
  SUPPLIER_OBSERVATION_KINDS,
  type SupplierObservationKind,
} from "@vuarau/domain-contracts";

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
  | "promisedQuantity"
  | "actualQuantity"
  | "acceptedQuantity"
  | "rejectedQuantity"
  | "expectedAt"
  | "actualAt"
  | "price"
  | "claim";

const FACT_TO_FIELD: Readonly<Partial<Record<string, SupplierObservationField>>> = {
  productId: "product",
  qualityGradeId: "qualityGrade",
  role: "role",
  sourceArea: "sourceArea",
  pickupResponsibility: "pickupResponsibility",
  packingResponsibility: "packingResponsibility",
  transportResponsibility: "transportResponsibility",
  expectedLeadTimeText: "leadTime",
  paymentArrangement: "paymentArrangement",
  traceabilityLevel: "traceabilityLevel",
  promisedQuantity: "promisedQuantity",
  actualQuantity: "actualQuantity",
  acceptedQuantity: "acceptedQuantity",
  rejectedQuantity: "rejectedQuantity",
  expectedAt: "expectedAt",
  actualAt: "actualAt",
  price: "price",
  claimReference: "claim",
};

/** UI visibility is derived from the domain fact registry, not a second kind map. */
export const SUPPLIER_OBSERVATION_FIELDS = Object.fromEntries(
  SUPPLIER_OBSERVATION_KINDS.map((kind) => [
    kind,
    OBSERVATION_FACT_REGISTRY.supplier[kind]
      .map((fact) => FACT_TO_FIELD[fact])
      .filter((field): field is SupplierObservationField => field !== undefined),
  ]),
) as unknown as Readonly<Record<SupplierObservationKind, readonly SupplierObservationField[]>>;

export function supplierObservationHasField(
  kind: SupplierObservationKind,
  field: SupplierObservationField,
): boolean {
  return SUPPLIER_OBSERVATION_FIELDS[kind].includes(field);
}
