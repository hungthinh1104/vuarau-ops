import type { Meta, StoryObj } from "@storybook/react-vite";
import type { DeliveryDto, SaleDetailDto, SaleFulfilmentDto } from "@vuarau/domain-contracts";
import {
  CUSTOMER_ID,
  PRODUCT_CA_CHUA_ID,
  QUALITY_GRADE_1_ID,
  SALE_LINE_1_ID,
  WORKSPACE_ID,
  testUuid,
} from "@vuarau/test-fixtures/ids";
import {
  LATER_RECORDED_AT,
  LATER_TRANSACTION_TIME,
  RECORDED_AT,
  TRANSACTION_TIME,
} from "@vuarau/test-fixtures/time";
import { salePosted, saleReplacement, saleVoided } from "@/fixtures/sale.fixtures.ts";
import { WORKSPACE_NAME } from "@/fixtures/session.fixtures.ts";
import { SaleCorrectionPanel } from "@/ui/patterns/sale/sale-correction-panel.tsx";
import { SaleDetailView } from "./sale-detail-view.tsx";

const detailFor = (
  sale: SaleDetailDto["sale"],
  replacedBySaleId: SaleDetailDto["correction"]["replacedBySaleId"] = null,
): SaleDetailDto => ({
  sale,
  displayReference: `BH-${sale.id.slice(-6).toUpperCase()}`,
  customer: { id: CUSTOMER_ID, displayName: "Chị Lan — chợ Bình Điền", phone: "0909000001" },
  workspace: { id: WORKSPACE_ID, name: WORKSPACE_NAME },
  accountEffect:
    sale.status === "posted"
      ? {
          balanceBefore: { amountMinor: 4_200_000, currency: "VND" },
          change:
            sale.financialState === "voided"
              ? { amountMinor: 0, currency: "VND" }
              : sale.totalAmount,
          balanceAfter: { amountMinor: 4_825_000, currency: "VND" },
          classificationAfter: "receivable",
          accountEntryId: testUuid("3", 9),
        }
      : null,
  correction: { voidRecord: sale.voidRecord, replacedBySaleId },
});

function fulfilment(
  state: SaleFulfilmentDto["lines"][number]["fulfilmentState"],
): SaleFulfilmentDto {
  const ordered = { valueScaled: 20_000, unit: "kg" as const };
  const values: Record<
    SaleFulfilmentDto["lines"][number]["fulfilmentState"],
    { dispatched: number; returned: number; netFulfilled: number; remaining: number }
  > = {
    unfulfilled: { dispatched: 0, returned: 0, netFulfilled: 0, remaining: 20_000 },
    partially_fulfilled: { dispatched: 8_000, returned: 0, netFulfilled: 8_000, remaining: 12_000 },
    fulfilled: { dispatched: 20_000, returned: 0, netFulfilled: 20_000, remaining: 0 },
    returned_partial: {
      dispatched: 20_000,
      returned: 3_000,
      netFulfilled: 17_000,
      remaining: 3_000,
    },
    attention: { dispatched: 0, returned: 0, netFulfilled: 0, remaining: 20_000 },
  };
  const current = values[state];
  return {
    saleId: salePosted.id,
    integrity: state === "attention" ? "attention" : "healthy",
    capabilities: { createDelivery: { allowed: state !== "attention" } },
    lines: [
      {
        saleLineId: SALE_LINE_1_ID,
        productId: state === "attention" ? null : PRODUCT_CA_CHUA_ID,
        productName: "Cà chua",
        qualityGradeId: state === "attention" ? null : QUALITY_GRADE_1_ID,
        qualityGradeName: state === "attention" ? null : "Loại 1",
        ordered,
        dispatched: { valueScaled: current.dispatched, unit: "kg" },
        returned: { valueScaled: current.returned, unit: "kg" },
        netFulfilled: { valueScaled: current.netFulfilled, unit: "kg" },
        remaining: { valueScaled: current.remaining, unit: "kg" },
        fulfilmentState: state,
        blockedReason:
          state === "attention" ? "Dòng lịch sử chưa có Product/phẩm cấp canonical." : null,
      },
    ],
  };
}

const delivery: DeliveryDto = {
  id: testUuid("7", 20) as DeliveryDto["id"],
  workspaceId: WORKSPACE_ID,
  saleId: salePosted.id,
  status: "dispatched",
  lines: [
    {
      deliveryLineId: testUuid("7", 21) as DeliveryDto["lines"][number]["deliveryLineId"],
      saleLineId: SALE_LINE_1_ID,
      productId: PRODUCT_CA_CHUA_ID,
      productName: "Cà chua",
      qualityGradeId: QUALITY_GRADE_1_ID,
      qualityGradeName: "Loại 1",
      quantity: { valueScaled: 8_000, unit: "kg" },
      returnedQuantity: { valueScaled: 0, unit: "kg" },
    },
  ],
  note: null,
  cancellationReason: null,
  version: 2,
  transactionTime: TRANSACTION_TIME,
  recordedAt: RECORDED_AT,
  dispatchedAt: LATER_TRANSACTION_TIME,
  deliveredAt: null,
  returns: [],
  evidenceReferences: [],
};

const correction = (
  <SaleCorrectionPanel
    goodsReturnStatus="blocked"
    originalCustomerId={CUSTOMER_ID}
    customerSearchQuery=""
    customerMatches={[]}
    onCustomerSearchChange={() => undefined}
    onSubmit={() => undefined}
  />
);

const meta = {
  title: "Screens/Sales/Detail",
  component: SaleDetailView,
  args: {
    detail: detailFor(salePosted),
    fulfilment: fulfilment("unfulfilled"),
    deliveries: [],
    canGenerateDocument: true,
    documentLocked: false,
    correctionSection: correction,
    onGenerateDocument: () => undefined,
  },
} satisfies Meta<typeof SaleDetailView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PostedUnfulfilled: Story = {};
export const Mobile: Story = { globals: { viewport: { value: "mobile" } } };
export const PartiallyFulfilled: Story = {
  args: { fulfilment: fulfilment("partially_fulfilled"), deliveries: [delivery] },
};
export const Fulfilled: Story = {
  args: {
    fulfilment: fulfilment("fulfilled"),
    deliveries: [{ ...delivery, status: "delivered", deliveredAt: LATER_RECORDED_AT }],
  },
};
export const ReturnedPartial: Story = {
  args: {
    fulfilment: fulfilment("returned_partial"),
    deliveries: [{ ...delivery, status: "delivered", deliveredAt: LATER_RECORDED_AT }],
  },
};
export const FulfilmentAttention: Story = {
  args: { fulfilment: fulfilment("attention") },
};
export const ReplacementAfterPriorFulfilmentBlocked: Story = {
  args: {
    detail: detailFor(saleReplacement),
    fulfilment: {
      ...fulfilment("unfulfilled"),
      saleId: saleReplacement.id,
      capabilities: {
        createDelivery: {
          allowed: false,
          reasonCode: "DELIVERY_REPLACEMENT_FULFILMENT_BLOCKED",
        },
      },
    },
  },
};
export const DocumentOutcomeUnknown: Story = { args: { documentLocked: true } };
export const ReadOnly: Story = {
  args: {
    canGenerateDocument: false,
    correctionSection: (
      <p className="border-l-2 border-border-strong pl-3 text-body-sm text-ink-muted">
        Bạn không có quyền điều chỉnh đơn đã chốt.
      </p>
    ),
  },
};
export const VoidedAndReplaced: Story = {
  render: () => (
    <SaleDetailView
      detail={detailFor(saleVoided, saleReplacement.id)}
      replacedSale={saleVoided}
      canGenerateDocument
      documentLocked={false}
      onGenerateDocument={() => undefined}
    />
  ),
};
