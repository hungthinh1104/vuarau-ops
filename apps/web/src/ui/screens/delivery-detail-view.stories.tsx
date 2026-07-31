import type { Meta, StoryObj } from "@storybook/react-vite";
import type { DeliveryDto } from "@vuarau/domain-contracts";
import {
  ACTOR_ID,
  PRODUCT_CA_CHUA_ID,
  QUALITY_GRADE_1_ID,
  SALE_ID,
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
import { DeliveryReturnPanel } from "@/ui/patterns/delivery/delivery-return-panel.tsx";
import { DeliveryDetailView } from "./delivery-detail-view.tsx";

const deliveryLineId = testUuid("7", 1) as DeliveryDto["lines"][number]["deliveryLineId"];
const base: DeliveryDto = {
  id: testUuid("7", 2) as DeliveryDto["id"],
  workspaceId: WORKSPACE_ID,
  saleId: SALE_ID,
  status: "draft",
  lines: [
    {
      deliveryLineId,
      saleLineId: SALE_LINE_1_ID,
      productId: PRODUCT_CA_CHUA_ID,
      productName: "Cà chua",
      qualityGradeId: QUALITY_GRADE_1_ID,
      qualityGradeName: "Loại 1",
      quantity: { valueScaled: 20_000, unit: "kg" },
      returnedQuantity: { valueScaled: 0, unit: "kg" },
    },
  ],
  note: null,
  cancellationReason: null,
  version: 1,
  transactionTime: TRANSACTION_TIME,
  recordedAt: RECORDED_AT,
  dispatchedAt: null,
  deliveredAt: null,
  returns: [],
};

const queryFor = (delivery: DeliveryDto) =>
  ({
    isPending: false,
    isError: false,
    error: null,
    data: delivery,
  }) as const;

const meta = {
  title: "Screens/Deliveries/Detail",
  component: DeliveryDetailView,
  args: {
    query: queryFor(base),
    canDispatch: true,
    canComplete: true,
    canReturn: true,
    canGenerateDocument: true,
    dispatchLocked: false,
    completeLocked: false,
    documentLocked: false,
    onDispatch: () => undefined,
    onComplete: () => undefined,
    onGenerateDocument: () => undefined,
    onRetry: () => undefined,
  },
} satisfies Meta<typeof DeliveryDetailView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Draft: Story = {};
export const DraftMobile: Story = { globals: { viewport: { value: "mobile" } } };
export const DispatchedWithReturnForm: Story = {
  args: {
    query: queryFor({
      ...base,
      status: "dispatched",
      version: 2,
      dispatchedAt: LATER_TRANSACTION_TIME,
    }),
    renderReturnPanel: (delivery) => (
      <DeliveryReturnPanel
        lines={delivery.lines}
        completed={false}
        locked={false}
        onSubmit={() => undefined}
        onStartAnother={() => undefined}
      />
    ),
  },
};
export const DeliveredWithPreviousReturn: Story = {
  args: {
    query: queryFor({
      ...base,
      status: "delivered",
      version: 3,
      dispatchedAt: LATER_TRANSACTION_TIME,
      deliveredAt: LATER_RECORDED_AT,
      lines: [{ ...base.lines[0]!, returnedQuantity: { valueScaled: 3_000, unit: "kg" } }],
      returns: [
        {
          id: testUuid("7", 3) as DeliveryDto["returns"][number]["id"],
          reason: "Khách trả lại hàng dập",
          lines: [{ deliveryLineId, quantity: { valueScaled: 3_000, unit: "kg" } }],
          transactionTime: LATER_TRANSACTION_TIME,
          recordedAt: LATER_RECORDED_AT,
          actorId: ACTOR_ID,
        },
      ],
    }),
    renderReturnPanel: (delivery) => (
      <DeliveryReturnPanel
        lines={delivery.lines}
        completed={false}
        locked={false}
        onSubmit={() => undefined}
        onStartAnother={() => undefined}
      />
    ),
  },
};
export const ReadOnly: Story = {
  args: { canDispatch: false, canComplete: false, canReturn: false, canGenerateDocument: false },
};
export const UnknownDispatchOutcome: Story = { args: { dispatchLocked: true } };
export const Loading: Story = {
  args: { query: { isPending: true, isError: false, error: null, data: undefined } },
};
export const NetworkFailure: Story = {
  args: {
    query: { isPending: false, isError: true, error: new Error("offline"), data: undefined },
  },
};
