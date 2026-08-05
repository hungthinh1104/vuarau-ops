import type { Meta, StoryObj } from "@storybook/react-vite";
import { coversState } from "@/ui/patterns/sale/catalog-state.ts";
import { Badge } from "@/ui/primitives/badge.tsx";
import { EmptyState } from "@/ui/primitives/empty-state.tsx";
const meta = { title: "Goods/QualityGrade/States" } satisfies Meta;
export default meta;
type Story = StoryObj;
export const Active: Story = {
  parameters: coversState("quality_grade_active"),
  render: () => <Badge tone="positive">Đang dùng</Badge>,
};
export const Inactive: Story = {
  parameters: coversState("quality_grade_inactive"),
  render: () => <Badge>Đã ngưng</Badge>,
};
export const NoActiveGrades: Story = {
  parameters: coversState("no_active_quality_grades"),
  render: () => (
    <div className="max-w-lg">
      <EmptyState
        title="Chưa có hạng hàng đang dùng"
        description="Theo cách tính hiện tại, cần cấu hình hạng hàng trước khi chốt đơn hoặc nhận hàng."
      />
    </div>
  ),
};
