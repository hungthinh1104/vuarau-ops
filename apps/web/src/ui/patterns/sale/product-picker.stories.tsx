import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CustomerPriceHistoryDto, WorkspaceProductHistoryDto } from "@vuarau/domain-contracts";
import {
  POSTED_SALE_ID,
  PRODUCT_CA_CHUA_ID,
  PRODUCT_OT_ID,
  PRODUCT_RAU_MUONG_ID,
  SALE_ID,
} from "@vuarau/test-fixtures/ids";
import { ProductPicker, type VisibleProduct } from "./product-picker.tsx";

const customerHistory: readonly CustomerPriceHistoryDto[] = [
  {
    productId: PRODUCT_CA_CHUA_ID,
    productName: "Cà chua",
    unit: "kg",
    lastUnitPrice: { amountMinor: 18_000, currency: "VND" },
    lastTransactionTime: "2026-07-15T08:00:00Z",
    sourceSaleId: SALE_ID,
  },
  {
    productId: PRODUCT_RAU_MUONG_ID,
    productName: "Rau muống",
    unit: "bo",
    lastUnitPrice: { amountMinor: 5_000, currency: "VND" },
    lastTransactionTime: "2026-07-10T08:00:00Z",
    sourceSaleId: POSTED_SALE_ID,
  },
];

const workspaceHistory: readonly WorkspaceProductHistoryDto[] = [
  {
    productId: PRODUCT_OT_ID,
    productName: "Ớt hiểm",
    unit: "thung",
    lastUnitPrice: null,
  },
];

const visibleProducts: readonly VisibleProduct[] = [
  {
    id: PRODUCT_CA_CHUA_ID,
    displayName: "Cà chua",
    aliases: ["tomato"],
    preferredUnit: "kg",
  },
  {
    id: PRODUCT_RAU_MUONG_ID,
    displayName: "Rau muống",
    aliases: ["morning glory"],
    preferredUnit: "bo",
  },
  {
    id: PRODUCT_OT_ID,
    displayName: "Ớt hiểm",
    aliases: ["chili"],
    preferredUnit: "thung",
  },
];

const meta = {
  title: "Orders/QuickOrder/ProductPicker",
  component: ProductPicker,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ProductPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithHistory: Story = {
  args: {
    open: true,
    visibleProducts,
    customerHistory,
    workspaceHistory,
    onClose: () => undefined,
    onSelectProduct: () => undefined,
    onApplyHistoricalPrice: () => undefined,
  },
};

export const Searching: Story = {
  args: {
    ...WithHistory.args,
    searching: true,
  },
};
