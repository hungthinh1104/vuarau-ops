import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Page, PurchaseDto } from "@vuarau/domain-contracts";
import { PRODUCT_CA_CHUA_ID, WORKSPACE_ID, testUuid } from "@vuarau/test-fixtures/ids";
import { RECORDED_AT, TRANSACTION_TIME } from "@vuarau/test-fixtures/time";
import { PurchasesDirectoryView } from "./purchases-directory-view.tsx";

const purchase: PurchaseDto = {
  id: testUuid("b", 21) as PurchaseDto["id"],
  workspaceId: WORKSPACE_ID,
  supplierId: testUuid("a", 21) as PurchaseDto["supplierId"],
  status: "confirmed",
  currency: "VND",
  lines: [
    {
      lineId: testUuid("b", 22) as PurchaseDto["lines"][number]["lineId"],
      productId: PRODUCT_CA_CHUA_ID,
      productName: "Cà chua",
      quantity: { valueScaled: 35_000, unit: "kg" },
      unitPrice: { amountMinor: 12_000, currency: "VND" },
      lineTotal: { amountMinor: 420_000, currency: "VND" },
    },
  ],
  totalAmount: { amountMinor: 420_000, currency: "VND" },
  note: "Giao chuyến sáng",
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

const page: Page<PurchaseDto> = { items: [purchase], nextCursor: null };
const ready = { isPending: false, isError: false, error: null, data: page } as const;

const meta = {
  title: "Screens/Purchases/Directory",
  component: PurchasesDirectoryView,
  args: {
    query: ready,
    rows: [purchase],
    nextCursor: null,
    isFetching: false,
    canCreate: true,
    onRetry: () => undefined,
    onLoadMore: () => undefined,
  },
} satisfies Meta<typeof PurchasesDirectoryView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const DesktopDirectory: Story = { globals: { viewport: { value: "desktop" } } };
export const MobileDirectory: Story = { globals: { viewport: { value: "mobile" } } };
export const ReadOnly: Story = { args: { canCreate: false } };
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
