import type { Meta, StoryObj } from "@storybook/react-vite";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { customerPage } from "@/fixtures/customer.fixtures.ts";
import { CustomersDirectoryView } from "./customers-directory-view.tsx";

const readyQuery: QueryLike<unknown> = {
  isPending: false,
  isError: false,
  error: null,
  data: null,
};

const baseArgs = {
  items: customerPage,
  query: "",
  activeFilter: "all" as const,
  queryState: readyQuery,
  isFetching: false,
  isError: false,
  hasMore: true,
  canManageWorkspace: true,
  canCreateCustomer: true,
  onQueryChange: () => undefined,
  onFilterChange: () => undefined,
  onClearQuery: () => undefined,
  onLoadMore: () => undefined,
  onRetry: () => undefined,
};

const meta = {
  title: "Screens/Customers/Directory",
  component: CustomersDirectoryView,
  args: baseArgs,
} satisfies Meta<typeof CustomersDirectoryView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const DesktopDirectory: Story = {
  globals: { viewport: { value: "desktop" } },
};

export const PhoneDirectory: Story = {
  globals: { viewport: { value: "mobile" } },
};

export const Loading: Story = {
  args: {
    items: [],
    hasMore: false,
    queryState: { ...readyQuery, isPending: true },
  },
};

export const EmptySearch: Story = {
  args: {
    items: [],
    hasMore: false,
    query: "rau thơm",
  },
};

export const NetworkFailure: Story = {
  args: {
    items: [],
    hasMore: false,
    queryState: { ...readyQuery, isError: true, error: new Error("offline") },
  },
};
