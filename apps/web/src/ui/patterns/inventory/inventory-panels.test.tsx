import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { QualityGradeDto } from "@vuarau/domain-contracts";
import { describe, expect, it, vi } from "vitest";
import {
  PRODUCT_CA_CHUA_ID,
  QUALITY_GRADE_1_ID,
  QUALITY_GRADE_2_ID,
  WORKSPACE_ID,
} from "@vuarau/test-fixtures/ids";
import { RECORDED_AT } from "@vuarau/test-fixtures/time";
import { InventoryAdjustmentPanel } from "./inventory-adjustment-panel.tsx";
import { InventoryReclassificationPanel } from "./inventory-reclassification-panel.tsx";

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
  {
    id: QUALITY_GRADE_2_ID,
    workspaceId: WORKSPACE_ID,
    name: "Loại 2",
    sortOrder: 20,
    isActive: true,
    version: 1,
    createdAt: RECORDED_AT,
    updatedAt: RECORDED_AT,
  },
];

describe("inventory command panels", () => {
  it("requires an explicit grade, positive quantity and explanation for adjustment", () => {
    render(
      <InventoryAdjustmentPanel
        grades={grades}
        completed={false}
        locked={false}
        onSubmit={() => undefined}
        onStartAnother={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: "Ghi điều chỉnh" })).toBeDisabled();
    expect(screen.getByText(/không dùng để giả lập trả nhà cung cấp/i)).toBeInTheDocument();
  });

  it("requires a deliberate reset before a second adjustment", async () => {
    const user = userEvent.setup();
    const onStartAnother = vi.fn();
    render(
      <InventoryAdjustmentPanel
        grades={grades}
        completed
        locked={false}
        onSubmit={() => undefined}
        onStartAnother={onStartAnother}
      />,
    );
    expect(screen.queryByRole("button", { name: "Ghi điều chỉnh" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Ghi điều chỉnh khác" }));
    expect(onStartAnother).toHaveBeenCalledTimes(1);
  });

  it("renders live inventory effect preview before committing adjustment", async () => {
    const user = userEvent.setup();
    render(
      <InventoryAdjustmentPanel
        grades={grades}
        balances={[
          {
            workspaceId: WORKSPACE_ID,
            productId: PRODUCT_CA_CHUA_ID,
            qualityGradeId: QUALITY_GRADE_1_ID,
            qualityGradeName: "Loại 1",
            unit: "kg",
            quantityScaled: 40_000,
            classification: "positive",
            movementCount: 1,
            lastMovementTransactionTime: RECORDED_AT,
            updatedAt: RECORDED_AT,
          },
        ]}
        completed={false}
        locked={false}
        onSubmit={() => undefined}
        onStartAnother={() => undefined}
      />,
    );

    // Select grade, enter quantity, enter reason
    await user.click(screen.getByRole("combobox", { name: "Hạng hàng" }));
    await user.click(await screen.findByRole("option", { name: "Loại 1" }));
    await user.type(screen.getByRole("textbox", { name: "Số lượng" }), "5");
    await user.type(screen.getByRole("textbox", { name: "Giải thích" }), "Kiểm đếm định kỳ");

    expect(screen.getByText("Dự kiến thay đổi tồn kho")).toBeInTheDocument();
    expect(screen.getByText(/40 kg/)).toBeInTheDocument();
    expect(screen.getByText(/45 kg/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ghi điều chỉnh" })).toBeEnabled();
  });

  it("requires a deliberate reset before a second reclassification", async () => {
    const user = userEvent.setup();
    const onStartAnother = vi.fn();
    render(
      <InventoryReclassificationPanel
        grades={grades}
        completed
        locked={false}
        onSubmit={() => undefined}
        onStartAnother={onStartAnother}
      />,
    );
    expect(screen.queryByRole("button", { name: "Ghi chuyển hạng hàng" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Ghi chuyển hạng hàng khác" }));
    expect(onStartAnother).toHaveBeenCalledTimes(1);
  });
});
