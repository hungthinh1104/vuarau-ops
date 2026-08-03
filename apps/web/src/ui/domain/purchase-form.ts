import type { ProductId, PurchaseLineId, Unit } from "@vuarau/domain-contracts";

export type PurchaseDraftLine = {
  readonly lineId: PurchaseLineId;
  readonly productId: ProductId | "";
  readonly productName: string;
  readonly quantity: string;
  readonly unit: Unit;
  readonly price: string;
};

export type PurchaseProductOption = {
  readonly id: ProductId;
  readonly displayName: string;
  readonly preferredUnit: Unit | null;
};

export type PurchaseSupplierOption = {
  readonly id: string;
  readonly displayName: string;
};
