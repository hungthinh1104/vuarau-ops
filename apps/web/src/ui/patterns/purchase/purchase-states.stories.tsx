import type { Meta, StoryObj } from "@storybook/react-vite";
import { coversState } from "@/ui/patterns/sale/catalog-state.ts";
import { Badge } from "@/ui/primitives/badge.tsx";
const meta = { title: "Purchases/States" } satisfies Meta;
export default meta;
type Story = StoryObj;
const state = (text: string, tone: "positive" | "neutral" | "danger" = "neutral") => (
  <Badge tone={tone}>{text}</Badge>
);
export const Draft: Story = {
  parameters: coversState("purchase_draft"),
  render: () => state("Nháp"),
};
export const Confirmed: Story = {
  parameters: coversState("purchase_confirmed"),
  render: () => state("Đã xác nhận", "positive"),
};
export const Discarded: Story = {
  parameters: coversState("purchase_discarded"),
  render: () => state("Đã bỏ"),
};
export const Voided: Story = {
  parameters: coversState("purchase_voided"),
  render: () => state("Đã hoàn tác", "danger"),
};
