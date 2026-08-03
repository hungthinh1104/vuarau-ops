import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PurchaseDto, QualityGradeDto } from "@vuarau/domain-contracts";
import { describe, expect, it, vi } from "vitest";
import {
  PRODUCT_CA_CHUA_ID,
  QUALITY_GRADE_1_ID,
  WORKSPACE_ID,
  testUuid,
} from "@vuarau/test-fixtures/ids";
import { RECORDED_AT, TRANSACTION_TIME } from "@vuarau/test-fixtures/time";
import { ReceivingCapturePanel } from "./receiving-capture-panel.tsx";

const purchase: PurchaseDto = {
  id: testUuid("6", 1) as PurchaseDto["id"],
  workspaceId: WORKSPACE_ID,
  supplierId: testUuid("6", 2) as PurchaseDto["supplierId"],
  status: "confirmed",
  currency: "VND",
  lines: [
    {
      lineId: testUuid("6", 3) as PurchaseDto["lines"][number]["lineId"],
      productId: PRODUCT_CA_CHUA_ID,
      productName: "Cà chua",
      quantity: { valueScaled: 100_000, unit: "kg" },
      unitPrice: { amountMinor: 12_000, currency: "VND" },
      lineTotal: { amountMinor: 1_200_000, currency: "VND" },
    },
  ],
  totalAmount: { amountMinor: 1_200_000, currency: "VND" },
  note: null,
  evidenceReferences: [],
  dueAt: null,
  version: 2,
  transactionTime: TRANSACTION_TIME,
  recordedAt: RECORDED_AT,
  confirmedAt: RECORDED_AT,
  discardedAt: null,
  replacesPurchaseId: null,
  voidRecord: null,
};

const grades: readonly QualityGradeDto[] = [
  {
    id: QUALITY_GRADE_1_ID,
    workspaceId: WORKSPACE_ID,
    name: "Loại 1",
    sortOrder: 10,
    isActive: true,
    version: 1,
    createdAt: RECORDED_AT,
    updatedAt: RECORDED_AT,
  },
];

describe("ReceivingCapturePanel", () => {
  it("fails visibly when current policy requires grade but no active grade exists", () => {
    render(
      <ReceivingCapturePanel
        purchase={purchase}
        grades={[]}
        gradesLoading={false}
        quantities={{}}
        locked={false}
        onQuantityChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Chưa có phẩm cấp đang dùng");
    expect(screen.getByRole("button", { name: "Ghi phiếu nhận hàng" })).toBeDisabled();
  });

  it("submits accepted stock by exact product, grade and unit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    let quantities: Record<string, string> = {};
    const { rerender } = render(
      <ReceivingCapturePanel
        purchase={purchase}
        grades={grades}
        gradesLoading={false}
        quantities={quantities}
        locked={false}
        onQuantityChange={(key, value) => {
          quantities = { ...quantities, [key]: value };
        }}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.change(screen.getByLabelText("Cà chua · Loại 1"), { target: { value: "70" } });
    rerender(
      <ReceivingCapturePanel
        purchase={purchase}
        grades={grades}
        gradesLoading={false}
        quantities={quantities}
        locked={false}
        onQuantityChange={() => undefined}
        onSubmit={onSubmit}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Ghi phiếu nhận hàng" }));
    expect(onSubmit).toHaveBeenCalledWith([
      {
        purchaseLineId: purchase.lines[0]!.lineId,
        productId: PRODUCT_CA_CHUA_ID,
        qualityGradeId: QUALITY_GRADE_1_ID,
        qualityGradeName: "Loại 1",
        quantity: { valueScaled: 70_000, unit: "kg" },
      },
    ]);
  });
});
