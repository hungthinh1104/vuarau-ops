"use client";

import type { CustomerId } from "@vuarau/domain-contracts";
import { QuickSaleFormView } from "./quick-sale-form-view.tsx";
import { useQuickSaleFormModel } from "./quick-sale-form-model.ts";

export default function NewSalePage() {
  return <QuickSaleForm />;
}

export function QuickSaleForm(props: { readonly customerIdOverride?: CustomerId }) {
  return <QuickSaleFormView {...useQuickSaleFormModel(props)} />;
}
