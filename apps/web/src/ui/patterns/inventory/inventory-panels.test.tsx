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
import { InventoryStocktakePanel } from "./inventory-stocktake-panel.tsx";
import type { StocktakeDto, StocktakePreviewDto } from "@vuarau/domain-contracts";

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

const mockSession: StocktakeDto = {
  id: "00000000-0000-4000-8000-000000000001" as never,
  workspaceId: WORKSPACE_ID,
  asOf: "2026-07-20T05:00:00.000Z",
  scopeReference: "product:" + PRODUCT_CA_CHUA_ID,
  note: null,
  status: "draft",
  version: 1,
  policyVersionId: "00000000-0000-4000-8000-000000000002" as never,
  counts: [],
  activeCounts: [],
  varianceMovementIds: [],
  transactionTime: "2026-07-20T05:00:00.000Z",
  recordedAt: "2026-07-20T05:00:00.000Z",
  actorId: "00000000-0000-4000-8000-000000000003" as never,
  evidenceReferences: [],
};

const mockPreview: StocktakePreviewDto = {
  calculationVersion: "stocktake-preview-v1",
  stocktakeSessionId: mockSession.id,
  sessionVersion: 1,
  asOf: mockSession.asOf,
  rows: [
    {
      productId: PRODUCT_CA_CHUA_ID,
      qualityGradeId: QUALITY_GRADE_1_ID,
      qualityGradeName: "Loại 1",
      unit: "kg",
      expectedQuantityScaled: 30_000,
      countedQuantityScaled: 25_000,
      varianceScaled: -5_000,
      activeCountId: "00000000-0000-4000-8000-000000000010" as never,
    },
  ],
  previewHash: "preview-hash-abc-123",
};

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

  it("stocktake panel disables start button when policy preflight fails", () => {
    const onStart = vi.fn();
    render(
      <InventoryStocktakePanel
        productId={PRODUCT_CA_CHUA_ID}
        grades={grades}
        session={null}
        preflight={{
          canStart: false,
          policyVersionId: null,
          reasonCode: "STOCKTAKE_POLICY_UNAVAILABLE",
          message: "Chưa có chính sách kiểm kê tồn kho hợp lệ.",
        }}
        locked={false}
        onStart={onStart}
        onCount={() => undefined}
        onApprove={() => undefined}
      />,
    );
    expect(screen.getByText("Chưa thể bắt đầu kiểm kê:")).toBeInTheDocument();
    expect(screen.getByText("Chưa có chính sách kiểm kê tồn kho hợp lệ.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bắt đầu kiểm kê mặt hàng" })).toBeDisabled();
  });

  it("stocktake panel records count and allows superseding edit", async () => {
    const user = userEvent.setup();
    const onCount = vi.fn();
    const sessionWithCount: StocktakeDto = {
      ...mockSession,
      version: 2,
      counts: [
        {
          id: "00000000-0000-4000-8000-000000000010" as never,
          workspaceId: WORKSPACE_ID,
          sessionId: mockSession.id,
          productId: PRODUCT_CA_CHUA_ID,
          qualityGradeId: QUALITY_GRADE_1_ID,
          qualityGradeName: "Loại 1",
          quantity: { valueScaled: 20_000, unit: "kg" },
          supersedesCountId: null,
          transactionTime: RECORDED_AT,
          recordedAt: RECORDED_AT,
          actorId: "00000000-0000-4000-8000-000000000003" as never,
          evidenceReferences: [],
        },
      ],
      activeCounts: [
        {
          id: "00000000-0000-4000-8000-000000000010" as never,
          workspaceId: WORKSPACE_ID,
          sessionId: mockSession.id,
          productId: PRODUCT_CA_CHUA_ID,
          qualityGradeId: QUALITY_GRADE_1_ID,
          qualityGradeName: "Loại 1",
          quantity: { valueScaled: 20_000, unit: "kg" },
          supersedesCountId: null,
          transactionTime: RECORDED_AT,
          recordedAt: RECORDED_AT,
          actorId: "00000000-0000-4000-8000-000000000003" as never,
          evidenceReferences: [],
        },
      ],
    };

    render(
      <InventoryStocktakePanel
        productId={PRODUCT_CA_CHUA_ID}
        grades={grades}
        session={sessionWithCount}
        locked={false}
        onStart={() => undefined}
        onCount={onCount}
        onApprove={() => undefined}
      />,
    );

    expect(screen.getByText("Số đếm hiện tại trong phiên")).toBeInTheDocument();
    expect(screen.getByText("20 kg")).toBeInTheDocument();

    // Click "Sửa"
    await user.click(screen.getByRole("button", { name: "Sửa" }));
    expect(screen.getByText(/Sửa số đếm cho Loại 1/)).toBeInTheDocument();

    // Change quantity to 22 and submit
    const input = screen.getByRole("textbox", { name: "Số đếm thực tế" });
    await user.clear(input);
    await user.type(input, "22");
    await user.click(screen.getByRole("button", { name: "Cập nhật số đếm" }));

    expect(onCount).toHaveBeenCalledWith({
      qualityGradeId: QUALITY_GRADE_1_ID,
      qualityGradeName: "Loại 1",
      quantity: { valueScaled: 22_000, unit: "kg" },
      supersedesCountId: "00000000-0000-4000-8000-000000000010",
    });
  });

  it("stocktake panel shows variance review and requires reason before approve", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const sessionWithCount: StocktakeDto = {
      ...mockSession,
      version: 2,
      activeCounts: [
        {
          id: "00000000-0000-4000-8000-000000000010" as never,
          workspaceId: WORKSPACE_ID,
          sessionId: mockSession.id,
          productId: PRODUCT_CA_CHUA_ID,
          qualityGradeId: QUALITY_GRADE_1_ID,
          qualityGradeName: "Loại 1",
          quantity: { valueScaled: 25_000, unit: "kg" },
          supersedesCountId: null,
          transactionTime: RECORDED_AT,
          recordedAt: RECORDED_AT,
          actorId: "00000000-0000-4000-8000-000000000003" as never,
          evidenceReferences: [],
        },
      ],
    };

    render(
      <InventoryStocktakePanel
        productId={PRODUCT_CA_CHUA_ID}
        grades={grades}
        session={sessionWithCount}
        preview={mockPreview}
        locked={false}
        onStart={() => undefined}
        onCount={() => undefined}
        onApprove={onApprove}
      />,
    );

    // Switch to review mode
    await user.click(screen.getByRole("button", { name: "Xem trước chênh lệch & duyệt →" }));
    expect(screen.getByText("Bảng đối chiếu chênh lệch thực tế vs sổ sách")).toBeInTheDocument();
    expect(screen.getByText("30 kg")).toBeInTheDocument();
    expect(screen.getByText("25 kg")).toBeInTheDocument();
    expect(screen.getByText("-5 kg")).toBeInTheDocument();

    const approveButton = screen.getByRole("button", { name: "Xác nhận duyệt chênh lệch" });
    expect(approveButton).toBeDisabled();

    // Type reason
    await user.type(screen.getByRole("textbox", { name: "Lý do duyệt kiểm kê" }), "Đã đếm xong");
    expect(approveButton).toBeEnabled();

    await user.click(approveButton);
    expect(onApprove).toHaveBeenCalledWith({
      expectedVersion: 2,
      expectedPreviewHash: "preview-hash-abc-123",
      reason: "Đã đếm xong",
    });
  });
});
