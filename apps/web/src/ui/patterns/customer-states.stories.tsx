import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CustomerSummaryDto } from "@vuarau/domain-contracts";
import { Badge } from "../primitives/badge.tsx";
import { EmptyState } from "../primitives/empty-state.tsx";
import { Button } from "../primitives/button.tsx";
import { describeBalance } from "../format.ts";
import { coversState } from "../catalog-state.ts";
import { customerInactive, customerWithReceivable } from "../../fixtures/customer.fixtures.ts";

/**
 * A customer row, composed from primitives rather than promoted to a pattern.
 *
 * The full list screen is not part of this milestone, so a `CustomerRow` component
 * would be a guess at an API nothing calls yet. What *is* worth fixing now is the
 * rule the row has to obey, and that is what these stories pin down.
 */
function CustomerRow({ customer }: { customer: CustomerSummaryDto }) {
  const balance = describeBalance(customer.balance, customer.classification);

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3 ${
        customer.isActive ? "" : "opacity-70"
      }`}
    >
      <div>
        <p className="text-body font-medium text-ink">{customer.displayName}</p>
        <p className="text-caption text-ink-muted">{customer.phone ?? "Không có số điện thoại"}</p>
      </div>
      <div className="flex items-center gap-3">
        {customer.isActive ? null : <Badge tone="neutral">Đã ngưng</Badge>}
        <span className="tabular text-body font-semibold text-ink">
          {balance.amount ?? balance.label}
        </span>
      </div>
    </div>
  );
}

const meta = { title: "Patterns/Customer states" } satisfies Meta;
export default meta;
type Story = StoryObj;

export const Active: Story = {
  name: "customer_active — trường hợp thường",
  parameters: coversState("customer_active"),
  render: () => <CustomerRow customer={customerWithReceivable} />,
};

/**
 * Greyed, labelled — and **still listed, with the balance showing**.
 *
 * BR-CUSTOMER-003: deactivation hides a customer from new sales and settles
 * nothing. A list that dropped this row would make "dọn lại danh sách khách" a way
 * to make 1.250.000 ₫ of debt disappear.
 */
export const Inactive: Story = {
  name: "customer_inactive — vẫn hiện, vẫn còn nợ",
  parameters: coversState("customer_inactive"),
  render: () => <CustomerRow customer={customerInactive} />,
};

/** Not an error, and not loading that stopped. A fact, stated. */
export const Empty: Story = {
  name: "empty — không có kết quả",
  parameters: coversState("empty"),
  render: () => (
    <EmptyState
      title="Chưa có khách hàng nào"
      description="Thêm khách hàng đầu tiên để bắt đầu ghi đơn và công nợ."
      action={<Button>Thêm khách hàng</Button>}
    />
  ),
};
