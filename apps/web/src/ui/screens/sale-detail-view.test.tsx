import { render, screen } from "@testing-library/react";
import type { SaleDetailDto, SaleFulfilmentDto } from "@vuarau/domain-contracts";
import { describe, expect, it } from "vitest";
import { saleReplacement } from "@/fixtures/sale.fixtures.ts";
import { CUSTOMER_ID, WORKSPACE_ID } from "@vuarau/test-fixtures/ids";
import { WORKSPACE_NAME } from "@/fixtures/session.fixtures.ts";
import { SaleDetailView } from "./sale-detail-view.tsx";

const detail: SaleDetailDto = {
  sale: saleReplacement,
  displayReference: "BH-REPLACE",
  customer: { id: CUSTOMER_ID, displayName: "Chị Lan", phone: null },
  workspace: { id: WORKSPACE_ID, name: WORKSPACE_NAME },
  accountEffect: null,
  correction: { voidRecord: null, replacedBySaleId: null },
};

const line = saleReplacement.lines[0]!;
const fulfilment: SaleFulfilmentDto = {
  saleId: saleReplacement.id,
  integrity: "healthy",
  capabilities: {
    createDelivery: {
      allowed: false,
      reasonCode: "DELIVERY_REPLACEMENT_FULFILMENT_BLOCKED",
    },
  },
  lines: [
    {
      saleLineId: line.lineId,
      productId: line.productId,
      productName: line.productName,
      qualityGradeId: line.qualityGradeId,
      qualityGradeName: line.qualityGradeName,
      ordered: line.quantity,
      dispatched: { valueScaled: 0, unit: line.quantity.unit },
      returned: { valueScaled: 0, unit: line.quantity.unit },
      netFulfilled: { valueScaled: 0, unit: line.quantity.unit },
      remaining: line.quantity,
      fulfilmentState: "unfulfilled",
      blockedReason: null,
    },
  ],
};

describe("SaleDetailView cross-dimension fulfilment guard", () => {
  it("does not offer a second physical delivery for a replacement whose predecessor was fulfilled", () => {
    render(
      <SaleDetailView
        detail={detail}
        fulfilment={fulfilment}
        canGenerateDocument={false}
        documentLocked={false}
        onGenerateDocument={() => undefined}
      />,
    );
    expect(screen.queryByRole("link", { name: "Giao đơn" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("không tạo đơn giao mới");
    expect(screen.getByRole("status")).toHaveTextContent("ghi nhận hàng đi lần hai");
  });
});
