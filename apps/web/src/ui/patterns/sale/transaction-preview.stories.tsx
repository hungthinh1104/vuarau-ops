import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ResolvedLine, SaleLineDraft } from "./sale-line-editor.tsx";
import { TransactionPreview } from "./transaction-preview.tsx";

const line: SaleLineDraft = {
  lineId: "story-line-1",
  productId: null,
  productName: "Cà chua",
  qualityGradeId: null,
  qualityGradeName: "Loại 1",
  quantityText: "12,5",
  unit: "kg",
  unitPriceText: "18000",
  priceOrigin: { kind: "manual" },
};

const resolved: ResolvedLine = {
  issues: {},
  quantity: { valueScaled: 12_500, unit: "kg" },
  unitPrice: { amountMinor: 18_000, currency: "VND" },
  total: { amountMinor: 225_000, currency: "VND" },
};

const meta = {
  title: "Orders/QuickOrder/Confirmation",
  component: TransactionPreview,
  parameters: { layout: "padded" },
} satisfies Meta<typeof TransactionPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ExistingCustomer: Story = {
  args: {
    customerName: "Lan rau",
    lines: [line],
    resolved: [resolved],
    total: { amountMinor: 225_000, currency: "VND" },
    currentBalance: { amountMinor: 4_200_000, currency: "VND" },
    currentClassification: "receivable",
  },
};

export const NewCustomer: Story = {
  args: {
    ...ExistingCustomer.args,
    customerName: "Khách mới",
    currentBalance: null,
    currentClassification: null,
  },
};

export const InvalidLine: Story = {
  args: {
    ...ExistingCustomer.args,
    resolved: [
      {
        issues: { quantity: "Số lượng phải lớn hơn 0." },
        quantity: null,
        unitPrice: null,
        total: null,
      },
    ],
    total: { amountMinor: 0, currency: "VND" },
  },
};
