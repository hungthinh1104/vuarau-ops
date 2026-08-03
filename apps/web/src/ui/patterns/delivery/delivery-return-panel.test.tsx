import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DeliveryDto } from "@vuarau/domain-contracts";
import { describe, expect, it, vi } from "vitest";
import {
  PRODUCT_CA_CHUA_ID,
  QUALITY_GRADE_1_ID,
  SALE_LINE_1_ID,
  testUuid,
} from "@vuarau/test-fixtures/ids";
import { DeliveryReturnPanel } from "./delivery-return-panel.tsx";

const lines: DeliveryDto["lines"] = [
  {
    deliveryLineId: testUuid("7", 1) as DeliveryDto["lines"][number]["deliveryLineId"],
    saleLineId: SALE_LINE_1_ID,
    productId: PRODUCT_CA_CHUA_ID,
    productName: "Cà chua",
    qualityGradeId: QUALITY_GRADE_1_ID,
    qualityGradeName: "Loại 1",
    quantity: { valueScaled: 20_000, unit: "kg" },
    returnedQuantity: { valueScaled: 0, unit: "kg" },
  },
];

describe("DeliveryReturnPanel", () => {
  it("requires a positive returned quantity and a reason before submission", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <DeliveryReturnPanel
        lines={lines}
        completed={false}
        locked={false}
        onSubmit={onSubmit}
        onStartAnother={() => undefined}
      />,
    );
    const submit = screen.getByRole("button", { name: "Ghi hàng trả" });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText("Số lượng trả Cà chua"), "3");
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText("Lý do"), "Khách trả lại hàng dập");
    await user.type(screen.getByLabelText("Nguồn chứng cứ vận hành"), "photo://return/001");
    await user.click(submit);
    expect(onSubmit).toHaveBeenCalledWith({
      lines: [
        { deliveryLineId: lines[0]!.deliveryLineId, quantity: { valueScaled: 3000, unit: "kg" } },
      ],
      reason: "Khách trả lại hàng dập",
      evidenceReferences: ["photo://return/001"],
    });
  });

  it("requires an explicit reset before recording another return", async () => {
    const user = userEvent.setup();
    const onStartAnother = vi.fn();
    render(
      <DeliveryReturnPanel
        lines={lines}
        completed
        locked={false}
        onSubmit={() => undefined}
        onStartAnother={onStartAnother}
      />,
    );
    expect(screen.queryByRole("button", { name: "Ghi hàng trả" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Ghi lần trả khác" }));
    expect(onStartAnother).toHaveBeenCalledTimes(1);
  });
});
