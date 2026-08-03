import type { Meta, StoryObj } from "@storybook/react-vite";
import { coversState } from "@/ui/patterns/sale/catalog-state.ts";
import { Badge } from "@/ui/primitives/badge.tsx";
const meta = { title: "Operations/Integrity states" } satisfies Meta;
export default meta;
type Story = StoryObj;
const panel = (
  title: string,
  copy: string,
  tone: "positive" | "neutral" | "warning" = "neutral",
) => (
  <section className="max-w-lg rounded-card border border-border bg-surface p-4">
    <Badge tone={tone}>{title}</Badge>
    <p className="mt-2 text-body-sm">{copy}</p>
  </section>
);
export const ReconciliationConsistent: Story = {
  parameters: coversState("reconciliation_consistent"),
  render: () => panel("Đối soát khớp", "Nguồn chuẩn và số dư dựng lại khớp nhau.", "positive"),
};
export const ReconciliationInconsistent: Story = {
  parameters: coversState("reconciliation_inconsistent"),
  render: () =>
    panel(
      "Số chiếu đang lệch",
      "Nguồn chuẩn còn hợp lệ; người có quyền có thể dựng lại projection.",
      "warning",
    ),
};
export const ReconciliationNotFound: Story = {
  parameters: coversState("reconciliation_not_found"),
  render: () =>
    panel("Không tìm thấy đối tượng", "Không có nguồn chuẩn cho định danh được yêu cầu."),
};
export const ReconciliationIntegrityFailure: Story = {
  parameters: coversState("reconciliation_integrity_failure"),
  render: () =>
    panel(
      "Không thể tự sửa",
      "Nguồn chuẩn không đủ tin cậy; không được dựng lại để che lỗi.",
      "warning",
    ),
};
export const WorkspaceHealthy: Story = {
  parameters: coversState("workspace_integrity_healthy"),
  render: () =>
    panel(
      "Vận hành bình thường",
      "Các kiểm tra nguồn, projection và tham chiếu hiện không báo chú ý.",
      "positive",
    ),
};
export const WorkspaceAttention: Story = {
  parameters: coversState("workspace_integrity_attention"),
  render: () =>
    panel(
      "Cần xử lý vận hành",
      "Có kiểm tra integrity cần người vận hành xem nguồn và bằng chứng.",
      "warning",
    ),
};
