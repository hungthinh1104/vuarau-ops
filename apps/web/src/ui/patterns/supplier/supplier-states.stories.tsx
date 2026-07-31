import type { Meta, StoryObj } from "@storybook/react-vite";
import { coversState } from "@/ui/patterns/sale/catalog-state.ts";
import { Badge } from "@/ui/primitives/badge.tsx";

const meta = { title: "Suppliers/States" } satisfies Meta;
export default meta;
type Story = StoryObj;

const account = (
  label: string,
  value: string,
  tone: "positive" | "neutral" | "warning" = "neutral",
) => (
  <section className="max-w-md rounded-card border border-border bg-surface p-4">
    <Badge tone={tone}>{label}</Badge>
    <p className="mt-3 text-heading font-bold tabular-nums">{value}</p>
  </section>
);
export const Active: Story = {
  parameters: coversState("supplier_active"),
  render: () => <Badge tone="positive">Đang dùng</Badge>,
};
export const Inactive: Story = {
  parameters: coversState("supplier_inactive"),
  render: () => <Badge>Đã ngưng</Badge>,
};
export const Payable: Story = {
  parameters: coversState("supplier_balance_payable"),
  render: () => account("Còn phải trả", "4.500.000 ₫", "warning"),
};
export const Settled: Story = {
  parameters: coversState("supplier_balance_settled"),
  render: () => account("Đã cân", "0 ₫"),
};
export const Credit: Story = {
  parameters: coversState("supplier_balance_credit"),
  render: () => account("Nhà cung cấp đang có số dư có lợi cho vựa", "500.000 ₫", "positive"),
};
