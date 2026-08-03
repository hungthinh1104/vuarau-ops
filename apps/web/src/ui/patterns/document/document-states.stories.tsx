import type { Meta, StoryObj } from "@storybook/react-vite";
import { coversState } from "@/ui/patterns/sale/catalog-state.ts";
import { Badge } from "@/ui/primitives/badge.tsx";
const meta = { title: "Documents/Share states" } satisfies Meta;
export default meta;
type Story = StoryObj;
export const Available: Story = {
  parameters: coversState("document_share_available"),
  render: () => <Badge tone="positive">Liên kết đang dùng</Badge>,
};
export const Expired: Story = {
  parameters: coversState("document_share_expired"),
  render: () => <Badge tone="warning">Liên kết đã hết hạn</Badge>,
};
export const Revoked: Story = {
  parameters: coversState("document_share_revoked"),
  render: () => <Badge>Liên kết đã thu hồi</Badge>,
};
