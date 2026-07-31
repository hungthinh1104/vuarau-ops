import type { Meta, StoryObj } from "@storybook/react-vite";
import { coversState } from "@/ui/patterns/sale/catalog-state.ts";
import { Badge } from "@/ui/primitives/badge.tsx";
const meta = { title: "Products/States" } satisfies Meta;
export default meta;
type Story = StoryObj;
export const Active: Story = {
  parameters: coversState("product_active"),
  render: () => <Badge tone="positive">Đang bán</Badge>,
};
export const Inactive: Story = {
  parameters: coversState("product_inactive"),
  render: () => <Badge>Đã ngưng</Badge>,
};
