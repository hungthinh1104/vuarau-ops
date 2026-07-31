import type { Meta, StoryObj } from "@storybook/react-vite";
import type {
  PurchaseDto,
  PurchaseReceiptDto,
  PurchaseReceivingSummaryDto,
  QualityGradeDto,
} from "@vuarau/domain-contracts";
import {
  ACTOR_ID,
  PRODUCT_CA_CHUA_ID,
  QUALITY_GRADE_1_ID,
  QUALITY_GRADE_2_ID,
  WORKSPACE_ID,
  testUuid,
} from "@vuarau/test-fixtures/ids";
import {
  LATER_RECORDED_AT,
  LATER_TRANSACTION_TIME,
  RECORDED_AT,
  TRANSACTION_TIME,
} from "@vuarau/test-fixtures/time";
import { ReceivingCapturePanel } from "@/ui/patterns/receiving/receiving-capture-panel.tsx";
import { PurchaseDetailView } from "./purchase-detail-view.tsx";

const purchaseId = testUuid("6", 10) as PurchaseDto["id"];
const lineId = testUuid("6", 11) as PurchaseDto["lines"][number]["lineId"];
const supplierId = testUuid("6", 12) as PurchaseDto["supplierId"];

const confirmed: PurchaseDto = {
  id: purchaseId,
  workspaceId: WORKSPACE_ID,
  supplierId,
  status: "confirmed",
  currency: "VND",
  lines: [
    {
      lineId,
      productId: PRODUCT_CA_CHUA_ID,
      productName: "Cà chua",
      quantity: { valueScaled: 100_000, unit: "kg" },
      unitPrice: { amountMinor: 12_000, currency: "VND" },
      lineTotal: { amountMinor: 1_200_000, currency: "VND" },
    },
  ],
  totalAmount: { amountMinor: 1_200_000, currency: "VND" },
  note: "Hàng sáng",
  dueAt: null,
  version: 2,
  transactionTime: TRANSACTION_TIME,
  recordedAt: RECORDED_AT,
  confirmedAt: RECORDED_AT,
  discardedAt: null,
  replacesPurchaseId: null,
  voidRecord: null,
};

const draft: PurchaseDto = {
  ...confirmed,
  status: "draft",
  version: 1,
  confirmedAt: null,
};

const voided: PurchaseDto = {
  ...confirmed,
  voidRecord: {
    id: testUuid("6", 13) as NonNullable<PurchaseDto["voidRecord"]>["id"],
    purchaseId,
    reasonCode: "wrong_quantity",
    reason: "Ghi nhầm 100 kg, thực tế đặt 80 kg",
    amount: confirmed.totalAmount,
    transactionTime: LATER_TRANSACTION_TIME,
    recordedAt: LATER_RECORDED_AT,
  },
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

const receipt: PurchaseReceiptDto = {
  id: testUuid("6", 14) as PurchaseReceiptDto["id"],
  workspaceId: WORKSPACE_ID,
  purchaseId,
  lines: [
    {
      receiptLineId: testUuid("6", 15) as PurchaseReceiptDto["lines"][number]["receiptLineId"],
      purchaseLineId: lineId,
      productId: PRODUCT_CA_CHUA_ID,
      qualityGradeId: QUALITY_GRADE_1_ID,
      qualityGradeName: "Loại 1",
      quantity: { valueScaled: 70_000, unit: "kg" },
    },
    {
      receiptLineId: testUuid("6", 16) as PurchaseReceiptDto["lines"][number]["receiptLineId"],
      purchaseLineId: lineId,
      productId: PRODUCT_CA_CHUA_ID,
      qualityGradeId: QUALITY_GRADE_2_ID,
      qualityGradeName: "Loại 2",
      quantity: { valueScaled: 20_000, unit: "kg" },
    },
  ],
  note: null,
  transactionTime: LATER_TRANSACTION_TIME,
  recordedAt: LATER_RECORDED_AT,
  actorId: ACTOR_ID,
  reversal: null,
};

const reversedReceipt: PurchaseReceiptDto = {
  ...receipt,
  reversal: {
    id: testUuid("6", 17) as NonNullable<PurchaseReceiptDto["reversal"]>["id"],
    reasonCode: "other",
    reason: "Ghi nhầm xe hàng",
    transactionTime: LATER_TRANSACTION_TIME,
    recordedAt: LATER_RECORDED_AT,
  },
};

const summary: PurchaseReceivingSummaryDto["lines"] = [
  {
    purchaseLineId: lineId,
    productId: PRODUCT_CA_CHUA_ID,
    productName: "Cà chua",
    ordered: { valueScaled: 100_000, unit: "kg" },
    received: { valueScaled: 90_000, unit: "kg" },
    remaining: { valueScaled: 10_000, unit: "kg" },
  },
];

const receivingPanel = (
  <ReceivingCapturePanel
    purchase={confirmed}
    grades={grades}
    gradesLoading={false}
    quantities={{}}
    locked={false}
    onQuantityChange={() => undefined}
    onSubmit={() => undefined}
  />
);

const meta = {
  title: "Screens/Purchases/Detail",
  component: PurchaseDetailView,
  args: {
    purchase: confirmed,
    receipts: [],
    receivingSummary: [
      {
        ...summary[0]!,
        received: { valueScaled: 0, unit: "kg" },
        remaining: { valueScaled: 100_000, unit: "kg" },
      },
    ],
    receiptsLoading: false,
    canCreateReplacement: true,
    canReverseReceipt: true,
    receivingPanel,
    onReverseReceipt: () => undefined,
  },
} satisfies Meta<typeof PurchaseDetailView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ConfirmedAwaitingReceiving: Story = {};
export const MobileReceiving: Story = { globals: { viewport: { value: "mobile" } } };
export const SplitGradePartialReceipt: Story = {
  args: { receipts: [receipt], receivingSummary: summary },
};
export const ReversedReceipt: Story = {
  args: { receipts: [reversedReceipt], receivingSummary: summary, canReverseReceipt: false },
};
export const Draft: Story = {
  args: {
    purchase: draft,
    receivingPanel: undefined,
    draftActions: (
      <div className="flex gap-2">
        <button type="button">Sửa đơn nháp</button>
        <button type="button">Xác nhận đơn mua</button>
      </div>
    ),
  },
};
export const Voided: Story = {
  args: { purchase: voided, receivingPanel: undefined, canReverseReceipt: false },
};
export const ReadOnly: Story = {
  args: { receivingPanel: undefined, canCreateReplacement: false, canReverseReceipt: false },
};
export const GradesMissing: Story = {
  args: {
    receivingPanel: (
      <ReceivingCapturePanel
        purchase={confirmed}
        grades={[]}
        gradesLoading={false}
        quantities={{}}
        locked={false}
        onQuantityChange={() => undefined}
        onSubmit={() => undefined}
      />
    ),
  },
};
