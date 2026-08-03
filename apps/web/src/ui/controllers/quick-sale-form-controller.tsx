"use client";

import type { CustomerId } from "@vuarau/domain-contracts";
import { useQuickSaleFormModel } from "@/ui/controllers/quick-sale-form-model.ts";
import { QuickSaleFormView } from "@/ui/screens/quick-sale-form-view.tsx";

export function QuickSaleFormController(props: { readonly customerIdOverride?: CustomerId }) {
  return <QuickSaleFormView {...useQuickSaleFormModel(props)} />;
}
