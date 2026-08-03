import type { CustomerOrderLineId, ProductId, Unit } from "@vuarau/domain-contracts";

export type CustomerOrderDraftLine = {
  readonly lineId: CustomerOrderLineId;
  readonly productId: ProductId | "";
  readonly productName: string;
  readonly quantity: string;
  readonly unit: Unit;
  readonly price: string;
};
