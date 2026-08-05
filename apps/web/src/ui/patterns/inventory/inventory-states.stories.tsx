import type { Meta, StoryObj } from "@storybook/react-vite";
import { coversState } from "@/ui/patterns/sale/catalog-state.ts";
import { Badge } from "@/ui/primitives/badge.tsx";
const meta = { title: "Goods/Inventory/States" } satisfies Meta;
export default meta;
type Story = StoryObj;
const box = (
  title: string,
  value: string,
  badge: string,
  tone: "positive" | "neutral" | "warning" = "neutral",
) => (
  <section className="max-w-sm rounded-card border border-border bg-surface p-4">
    <p className="text-label text-ink-muted">{title}</p>
    <p className="mt-1 text-heading font-bold tabular-nums">{value}</p>
    <div className="mt-2">
      <Badge tone={tone}>{badge}</Badge>
    </div>
  </section>
);
export const ReceiptActive: Story = {
  parameters: coversState("receipt_active"),
  render: () => box("Phiếu nhận", "+70 kg", "Đang hiệu lực", "positive"),
};
export const ReceiptReversed: Story = {
  parameters: coversState("receipt_reversed"),
  render: () => box("Phiếu nhận", "70 kg", "Đã hoàn tác"),
};
export const Positive: Story = {
  parameters: coversState("inventory_positive"),
  render: () => box("Cà chua · Loại 1", "70 kg", "Còn hàng", "positive"),
};
export const Zero: Story = {
  parameters: coversState("inventory_zero"),
  render: () => box("Cà chua · Loại 2", "0 kg", "Hết"),
};
export const Negative: Story = {
  parameters: coversState("inventory_negative"),
  render: () => box("Rau muống · Loại 1", "−5 kg", "Cần kiểm tra", "warning"),
};
export const LegacyUnclassified: Story = {
  parameters: coversState("inventory_legacy_unclassified"),
  render: () => box("Khoai tây", "18 kg", "Chưa phân loại (lịch sử)"),
};
export const Reclassification: Story = {
  parameters: coversState("inventory_reclassification"),
  render: () => (
    <div className="max-w-md rounded-card border border-border bg-surface p-4">
      <strong>Chuyển hạng hàng</strong>
      <p className="mt-2">−10 kg Loại 1 → +10 kg Loại 2</p>
      <p className="text-caption text-ink-muted">Tổng số lượng không đổi.</p>
    </div>
  ),
};
export const Spoilage: Story = {
  parameters: coversState("inventory_spoilage"),
  render: () => box("Cà chua · Loại 2", "−4 kg", "Hư hỏng", "warning"),
};
