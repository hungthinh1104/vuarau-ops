import type { Meta, StoryObj } from "@storybook/react-vite";
import { coversState } from "@/ui/patterns/sale/catalog-state.ts";
import { Badge } from "@/ui/primitives/badge.tsx";
const meta = { title: "Deliveries/States" } satisfies Meta;
export default meta;
type Story = StoryObj;
const badge = (text: string, tone: "positive" | "neutral" | "warning" = "neutral") => (
  <Badge tone={tone}>{text}</Badge>
);
export const Draft: Story = {
  parameters: coversState("delivery_draft"),
  render: () => badge("Soạn phiếu"),
};
export const Cancelled: Story = {
  parameters: coversState("delivery_cancelled"),
  render: () => badge("Đã huỷ"),
};
export const Dispatched: Story = {
  parameters: coversState("delivery_dispatched"),
  render: () => badge("Đã xuất hàng", "warning"),
};
export const Delivered: Story = {
  parameters: coversState("delivery_delivered"),
  render: () => badge("Đã giao khách", "positive"),
};
const fulfilment = (
  label: string,
  detail: string,
  tone: "positive" | "neutral" | "warning" = "neutral",
) => (
  <section className="max-w-md rounded-card border border-border bg-surface p-4">
    <Badge tone={tone}>{label}</Badge>
    <p className="mt-2 text-body-sm">{detail}</p>
  </section>
);
export const Unfulfilled: Story = {
  parameters: coversState("fulfilment_unfulfilled"),
  render: () => fulfilment("Chưa giao", "Đặt 20 kg · còn 20 kg"),
};
export const Partial: Story = {
  parameters: coversState("fulfilment_partially_fulfilled"),
  render: () => fulfilment("Giao một phần", "Đặt 20 kg · đã giao ròng 8 kg · còn 12 kg", "warning"),
};
export const Fulfilled: Story = {
  parameters: coversState("fulfilment_fulfilled"),
  render: () => fulfilment("Đã giao đủ", "Đặt 20 kg · đã giao ròng 20 kg", "positive"),
};
export const ReturnedPartial: Story = {
  parameters: coversState("fulfilment_returned_partial"),
  render: () =>
    fulfilment("Có hàng trả lại", "Đã xuất 20 kg · trả 3 kg · còn cần giao 3 kg", "warning"),
};
export const Attention: Story = {
  parameters: coversState("fulfilment_attention"),
  render: () =>
    fulfilment(
      "Cần kiểm tra",
      "Dữ liệu lịch sử không có đủ định danh để tạo phiếu giao mới.",
      "warning",
    ),
};
