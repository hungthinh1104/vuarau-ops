import type { Meta, StoryObj } from "@storybook/react-vite";
import { ownerSession, salesSession, warehouseSession } from "@/fixtures/session.fixtures.ts";
import { todayActionsFor } from "@/ui/patterns/today-actions.ts";
import { TodayView, type TodayQueueState } from "./today-view.tsx";

const populated: TodayQueueState = {
  loading: false,
  error: false,
  items: [
    { id: "one", href: "/deliveries/one", primary: "Cà chua · 20 kg", secondary: "Cần xuất" },
    {
      id: "two",
      href: "/deliveries/two",
      primary: "Rau muống · 35 bó",
      secondary: "Cần xuất · +1 mặt hàng",
    },
    { id: "three", href: "/deliveries/three", primary: "Ớt hiểm · 2 thùng", secondary: "Cần xuất" },
    { id: "four", href: "/deliveries/four", primary: "Khoai tây · 40 kg", secondary: "Cần xuất" },
  ],
};
const quiet: TodayQueueState = { loading: false, error: false, items: [] };
const loading: TodayQueueState = { loading: true, error: false, items: [] };
const failed: TodayQueueState = { loading: false, error: true, items: [] };

const meta = {
  title: "Screens/Today",
  component: TodayView,
  args: {
    actions: todayActionsFor(ownerSession.permissions, ownerSession.role),
    deliveryQueuesVisible: true,
    purchaseQueueVisible: true,
    draftDeliveries: populated,
    dispatchedDeliveries: quiet,
    openPurchases: populated,
  },
} satisfies Meta<typeof TodayView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const OwnerDesktop: Story = { globals: { viewport: { value: "desktop" } } };
export const OwnerMobile: Story = { globals: { viewport: { value: "mobile" } } };
export const SalesWorker: Story = {
  args: {
    actions: todayActionsFor(salesSession.permissions, salesSession.role),
    deliveryQueuesVisible: salesSession.permissions.includes("delivery.read"),
    purchaseQueueVisible: salesSession.permissions.includes("purchase.read"),
    draftDeliveries: quiet,
    dispatchedDeliveries: quiet,
    openPurchases: quiet,
  },
};
export const WarehouseLoading: Story = {
  args: {
    actions: todayActionsFor(warehouseSession.permissions, warehouseSession.role),
    deliveryQueuesVisible: warehouseSession.permissions.includes("delivery.read"),
    purchaseQueueVisible: warehouseSession.permissions.includes("purchase.read"),
    draftDeliveries: loading,
    dispatchedDeliveries: loading,
    openPurchases: loading,
  },
};
export const PartialQueueFailure: Story = {
  args: { draftDeliveries: failed, dispatchedDeliveries: populated, openPurchases: quiet },
};
export const QuietShift: Story = {
  args: { draftDeliveries: quiet, dispatchedDeliveries: quiet, openPurchases: quiet },
};
