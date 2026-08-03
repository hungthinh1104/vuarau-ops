import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CustomerDetailDto } from "@vuarau/domain-contracts";
import { accountTimeline } from "@/fixtures/account.fixtures.ts";
import {
  customerDetail,
  customerInactive,
  customerWithCredit,
} from "@/fixtures/customer.fixtures.ts";
import { paymentPage } from "@/fixtures/payment.fixtures.ts";
import { salePage } from "@/fixtures/sale.fixtures.ts";
import { CustomerDetailView } from "./customer-detail-view.tsx";

function detailFromSummary(
  summary: typeof customerWithCredit | typeof customerInactive,
): CustomerDetailDto {
  return {
    ...customerDetail,
    customer: {
      ...customerDetail.customer,
      id: summary.id,
      displayName: summary.displayName,
      phone: summary.phone,
      isActive: summary.isActive,
      version: summary.version,
    },
    balance: summary.balance,
    classification: summary.classification,
    capabilities: summary.capabilities,
  };
}

const baseArgs = {
  detail: customerDetail,
  timelineEntries: accountTimeline,
  timelineState: "ready" as const,
  timelineHasMore: true,
  timelineFetching: false,
  recentSales: salePage.slice(0, 2),
  recentPayments: paymentPage.slice(0, 2),
  canCreateSale: true,
  canRecordPayment: true,
  canAdjustDebt: true,
  customerCommandLocked: false,
  onDeactivate: () => undefined,
  onReactivate: () => undefined,
  onLoadMore: () => undefined,
  onRetryTimeline: () => undefined,
};

const meta = {
  title: "Screens/Customers/Detail",
  component: CustomerDetailView,
  args: baseArgs,
} satisfies Meta<typeof CustomerDetailView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ReceivableOwner: Story = {};
export const MobileReceivable: Story = {
  globals: { viewport: { value: "mobile" } },
};
export const CustomerCredit: Story = {
  args: { detail: detailFromSummary(customerWithCredit) },
};
export const InactiveStillCollectsPayment: Story = {
  args: {
    detail: detailFromSummary(customerInactive),
    canCreateSale: true,
    canRecordPayment: true,
  },
};
export const ReadOnlySalesRole: Story = {
  args: {
    canAdjustDebt: false,
    recentPayments: [],
  },
};
export const EmptyAccount: Story = {
  args: {
    timelineEntries: [],
    timelineHasMore: false,
    recentSales: [],
    recentPayments: [],
    detail: {
      ...customerDetail,
      balance: { amountMinor: 0, currency: "VND" },
      classification: "settled",
    },
  },
};
export const TimelineLoading: Story = {
  args: { timelineEntries: [], timelineState: "loading", timelineHasMore: false },
};
export const TimelineNetworkFailure: Story = {
  args: { timelineEntries: [], timelineState: "error", timelineHasMore: false },
};
export const PartialTimelineFailure: Story = {
  args: { timelineState: "error", timelineHasMore: true },
};
export const UnknownCustomerMutationOutcome: Story = {
  args: {
    customerCommandLocked: true,
    outcomes: (
      <p role="status" className="rounded-card border border-warning/30 bg-warning-soft p-3">
        Chưa rõ lệnh đổi trạng thái khách đã được máy chủ ghi nhận. Tải lại trước khi tạo intent
        mới.
      </p>
    ),
  },
};
