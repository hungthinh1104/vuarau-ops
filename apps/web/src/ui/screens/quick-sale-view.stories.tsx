import type { Meta, StoryObj } from "@storybook/react-vite";
import { PRODUCT_CA_CHUA_ID, QUALITY_GRADE_1_ID, SALE_LINE_1_ID } from "@vuarau/test-fixtures/ids";
import { BalancePreview } from "@/ui/patterns/finance/balance-preview.tsx";
import { PermissionDenied } from "@/ui/patterns/feedback/permission-denied.tsx";
import {
  QuickSaleGradeState,
  QuickSaleUnresolvedProduct,
} from "@/ui/patterns/sale/quick-sale-blockers.tsx";
import { QuickSaleFooter } from "@/ui/patterns/sale/quick-sale-footer.tsx";
import { QuickSaleLinesSection } from "@/ui/patterns/sale/quick-sale-lines-section.tsx";
import { resolveLine, type SaleLineDraft } from "@/ui/patterns/sale/sale-line-editor.tsx";
import { Textarea } from "@/ui/primitives/textarea.tsx";
import { QuickSaleView } from "./quick-sale-view.tsx";

const readyLine: SaleLineDraft = {
  lineId: SALE_LINE_1_ID,
  productId: PRODUCT_CA_CHUA_ID,
  productName: "Cà chua",
  qualityGradeId: QUALITY_GRADE_1_ID,
  qualityGradeName: "Loại 1",
  quantityText: "20",
  unit: "kg",
  unitPriceText: "18000",
  priceOrigin: { kind: "manual" },
};
const unresolvedLine: SaleLineDraft = {
  ...readyLine,
  productId: null,
  productName: "Cà chua bi mới",
};

function lineSection(lines: readonly SaleLineDraft[], grades = true) {
  return (
    <QuickSaleLinesSection
      lines={lines}
      resolved={lines.map(resolveLine)}
      submitted={false}
      serverLineIndex={null}
      disabled={false}
      qualityGradeOptions={grades ? [{ value: QUALITY_GRADE_1_ID, label: "Loại 1" }] : []}
      onFocusLine={() => undefined}
      onOpenProductPicker={() => undefined}
      onChangeLine={() => undefined}
      onRemoveLine={() => undefined}
      onAdvance={() => undefined}
    />
  );
}

const customer = (
  <section className="border-y border-border py-3">
    <p className="text-caption font-semibold uppercase tracking-wide text-ink-muted">Khách hàng</p>
    <p className="mt-1 text-subheading font-semibold">Chị Lan — chợ Bình Điền</p>
    <p className="text-caption text-ink-muted">0909000001</p>
  </section>
);
const note = (
  <Textarea label="Ghi chú" rows={2} value="Giao buổi sáng" onChange={() => undefined} />
);
const total = { amountMinor: 360_000, currency: "VND" as const };
const balance = (
  <BalancePreview
    currentBalance={{ amountMinor: 4_200_000, currency: "VND" }}
    currentClassification="receivable"
    change={total}
    changeLabel="Đơn này"
  />
);
const footer = (
  <QuickSaleFooter
    total={total}
    draftExists={false}
    locallyQueued={false}
    replacementPending={false}
    mayPost
    fulfilmentReady
    commandLocked={false}
    posted={false}
    onDiscard={() => undefined}
    onSaveDraft={() => undefined}
    onConfirm={() => undefined}
  />
);

const meta = {
  title: "Screens/Sales/QuickSale",
  component: QuickSaleView,
  args: {
    customerId: "00000000-0000-4000-8000-000000000001",
    draftState: "unsaved",
    customerSection: customer,
    linesSection: lineSection([readyLine]),
    noteSection: note,
    total,
    balanceSection: balance,
    footer,
  },
} satisfies Meta<typeof QuickSaleView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ReadyToPost: Story = {};
export const MobileOneHand: Story = { globals: { viewport: { value: "mobile" } } };
export const TabletCounter: Story = { globals: { viewport: { value: "tablet" } } };
export const UnresolvedProduct: Story = {
  args: {
    linesSection: lineSection([unresolvedLine]),
    productResolution: (
      <QuickSaleUnresolvedProduct
        productName="Cà chua bi mới"
        mayCreateProduct
        locked={false}
        creating={false}
        onCreate={() => undefined}
      />
    ),
    footer: (
      <QuickSaleFooter
        total={total}
        draftExists={false}
        locallyQueued={false}
        replacementPending={false}
        mayPost
        fulfilmentReady={false}
        commandLocked={false}
        posted={false}
        onDiscard={() => undefined}
        onSaveDraft={() => undefined}
        onConfirm={() => undefined}
      />
    ),
  },
};
export const NoActiveGrades: Story = {
  args: {
    linesSection: lineSection(
      [{ ...readyLine, qualityGradeId: null, qualityGradeName: null }],
      false,
    ),
    operationalNotices: <QuickSaleGradeState loading={false} error={false} gradeCount={0} />,
    footer: (
      <QuickSaleFooter
        total={total}
        draftExists={false}
        locallyQueued={false}
        replacementPending={false}
        mayPost
        fulfilmentReady={false}
        commandLocked={false}
        posted={false}
        onDiscard={() => undefined}
        onSaveDraft={() => undefined}
        onConfirm={() => undefined}
      />
    ),
  },
};
export const OfflineQueued: Story = {
  args: {
    draftState: "queued",
    contextNotices: (
      <section className="rounded-card border border-warning/40 bg-warning-soft p-3 text-body-sm">
        <strong>Đơn đã được lưu an toàn trên thiết bị.</strong>
        <p>Đang chờ máy chủ xác nhận; không sửa intent đang chờ.</p>
      </section>
    ),
    footer: (
      <QuickSaleFooter
        total={total}
        draftExists
        locallyQueued
        replacementPending={false}
        mayPost
        fulfilmentReady
        commandLocked={false}
        posted={false}
        onDiscard={() => undefined}
        onSaveDraft={() => undefined}
        onConfirm={() => undefined}
      />
    ),
  },
};
export const PermissionDeniedState: Story = {
  args: {
    customerSection: (
      <>
        {customer}
        <PermissionDenied
          error={{
            code: "PERMISSION_DENIED",
            message: "Role does not carry permission sale.create",
            details: { permission: "sale.create", role: "delivery" },
            retryable: false,
          }}
          attemptedAction="Tạo đơn hàng"
        />
      </>
    ),
    footer: (
      <QuickSaleFooter
        total={total}
        draftExists={false}
        locallyQueued={false}
        replacementPending={false}
        mayPost={false}
        fulfilmentReady
        commandLocked={false}
        posted={false}
        onDiscard={() => undefined}
        onSaveDraft={() => undefined}
        onConfirm={() => undefined}
      />
    ),
  },
};
export const UnknownPostOutcome: Story = {
  args: {
    draftState: "saved",
    footer: (
      <QuickSaleFooter
        total={total}
        draftExists
        locallyQueued={false}
        replacementPending={false}
        mayPost
        fulfilmentReady
        commandLocked
        posted={false}
        onDiscard={() => undefined}
        onSaveDraft={() => undefined}
        onConfirm={() => undefined}
      />
    ),
    outcomes: (
      <p role="status" className="rounded-card border border-warning/30 bg-warning-soft p-3">
        Chưa rõ máy chủ đã nhận lệnh. Khôi phục bằng đúng command identity hiện tại; không tạo lệnh
        mới.
      </p>
    ),
  },
};
