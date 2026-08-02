import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Page, RecentCustomerDto } from "@vuarau/domain-contracts";
import { CUSTOMER_ID, CUSTOMER_WITH_DEBT_ID } from "@vuarau/test-fixtures/ids";
import { TRANSACTION_TIME } from "@vuarau/test-fixtures/time";
import { customerPage } from "@/fixtures/customer.fixtures.ts";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import { QuickSaleStartView } from "./quick-sale-start-view.tsx";

const idle: CommandOutcomeView = {
  phase: { kind: "idle" },
  pending: null,
  error: null,
  wasDuplicateSafeRetry: false,
  resend: async () => undefined,
};

const recentCustomers: readonly RecentCustomerDto[] = [
  {
    customerId: CUSTOMER_WITH_DEBT_ID,
    displayName: "Chị Lan — chợ Bình Điền",
    phone: "0903 112 233",
    balance: { amountMinor: 375_000, currency: "VND" },
    classification: "receivable",
    lastSaleTransactionTime: TRANSACTION_TIME,
  },
  {
    customerId: CUSTOMER_ID,
    displayName: "Cô Hoà — quán cơm Tân Bình",
    phone: "0908 445 566",
    balance: { amountMinor: -500_000, currency: "VND" },
    classification: "customer_credit",
    lastSaleTransactionTime: TRANSACTION_TIME,
  },
];

const recent = {
  isPending: false,
  isError: false,
  error: null,
  data: recentCustomers,
} as const;
const search = {
  isPending: false,
  isError: false,
  error: null,
  data: { items: customerPage, nextCursor: null } satisfies Page<(typeof customerPage)[number]>,
} as const;

const meta = {
  title: "Screens/Sales/QuickSaleStart",
  component: QuickSaleStartView,
  args: {
    recent,
    search,
    query: "",
    showingRecent: true,
    creating: false,
    name: "",
    phone: "",
    note: "",
    offlineError: null,
    createCommand: idle,
    canCreateCustomer: true,
    onQueryChange: () => undefined,
    onClearQuery: () => undefined,
    onRecentSelect: () => undefined,
    onSearchSelect: () => undefined,
    onStartCreate: () => undefined,
    onNameChange: () => undefined,
    onPhoneChange: () => undefined,
    onNoteChange: () => undefined,
    onCreateInline: () => undefined,
    onReload: () => undefined,
  },
} satisfies Meta<typeof QuickSaleStartView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const RecentCustomersMobile: Story = { globals: { viewport: { value: "mobile" } } };
export const SearchResults: Story = {
  args: { query: "lan", showingRecent: false },
};
export const InlineCustomerCreation: Story = {
  args: {
    query: "Chị Mai",
    showingRecent: false,
    creating: true,
    name: "Chị Mai quán 7",
    phone: "0912 345 678",
  },
};
export const CannotCreateCustomer: Story = {
  args: { query: "lan", showingRecent: false, canCreateCustomer: false },
};
export const LoadingRecent: Story = {
  args: { recent: { isPending: true, isError: false, error: null, data: undefined } },
};
export const EmptySearch: Story = {
  args: {
    query: "không có",
    showingRecent: false,
    search: { ...search, data: { items: [] } },
  },
};
export const OfflineCreateFailure: Story = {
  args: {
    query: "Chị Mai",
    showingRecent: false,
    creating: true,
    name: "Chị Mai quán 7",
    offlineError: "Chưa lưu được khách hàng khi đang ngoại tuyến.",
  },
};
