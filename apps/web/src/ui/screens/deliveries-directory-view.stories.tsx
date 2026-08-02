import type { Meta, StoryObj } from "@storybook/react-vite";
import type { DeliveryDto, Page } from "@vuarau/domain-contracts";
import {
  PRODUCT_CA_CHUA_ID,
  QUALITY_GRADE_1_ID,
  SALE_ID,
  WORKSPACE_ID,
  testUuid,
} from "@vuarau/test-fixtures/ids";
import { RECORDED_AT, TRANSACTION_TIME } from "@vuarau/test-fixtures/time";
import { DeliveriesDirectoryView } from "./deliveries-directory-view.tsx";

const delivery: DeliveryDto = {
  id: testUuid("c", 21) as DeliveryDto["id"],
  workspaceId: WORKSPACE_ID,
  saleId: SALE_ID,
  status: "dispatched",
  lines: [
    {
      deliveryLineId: testUuid("c", 22) as DeliveryDto["lines"][number]["deliveryLineId"],
      saleLineId: testUuid("f", 21) as DeliveryDto["lines"][number]["saleLineId"],
      productId: PRODUCT_CA_CHUA_ID,
      productName: "Cà chua",
      qualityGradeId: QUALITY_GRADE_1_ID,
      qualityGradeName: "Loại 1",
      quantity: { valueScaled: 20_000, unit: "kg" },
      returnedQuantity: { valueScaled: 0, unit: "kg" },
    },
  ],
  note: "Giao chợ đầu mối",
  cancellationReason: null,
  version: 2,
  transactionTime: TRANSACTION_TIME,
  recordedAt: RECORDED_AT,
  dispatchedAt: RECORDED_AT,
  deliveredAt: null,
  returns: [],
};

const page: Page<DeliveryDto> = { items: [delivery], nextCursor: null };
const ready = { isPending: false, isError: false, error: null, data: page } as const;

const meta = {
  title: "Screens/Deliveries/Directory",
  component: DeliveriesDirectoryView,
  args: {
    query: ready,
    rows: [delivery],
    nextCursor: null,
    isFetching: false,
    onRetry: () => undefined,
    onLoadMore: () => undefined,
  },
} satisfies Meta<typeof DeliveriesDirectoryView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const DesktopDirectory: Story = { globals: { viewport: { value: "desktop" } } };
export const MobileDirectory: Story = { globals: { viewport: { value: "mobile" } } };
export const Empty: Story = {
  args: { rows: [], query: { ...ready, data: { items: [], nextCursor: null } } },
};
export const Loading: Story = {
  args: { rows: [], query: { isPending: true, isError: false, error: null, data: undefined } },
};
export const NetworkFailure: Story = {
  args: {
    rows: [],
    query: { isPending: false, isError: true, error: new Error("offline"), data: undefined },
  },
};
