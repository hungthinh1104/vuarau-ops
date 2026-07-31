import type { Meta, StoryObj } from "@storybook/react-vite";
import { salePage } from "@/fixtures/sale.fixtures.ts";
import { SalesListView } from "./sales-list-view.tsx";

const readyQuery = {
  isPending: false,
  isError: false,
  error: null,
  data: {},
  isFetching: false,
} as const;

const meta = {
  title: "Screens/Sales/List",
  component: SalesListView,
  args: {
    rows: salePage,
    filter: "all",
    query: readyQuery,
    canCreate: true,
    hasMore: true,
    onFilterChange: () => undefined,
    onLoadMore: () => undefined,
    onRetry: () => undefined,
  },
} satisfies Meta<typeof SalesListView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mobile: Story = {
  globals: { viewport: { value: "mobile" } },
};

export const Desktop: Story = {
  globals: { viewport: { value: "desktop" } },
};

export const Loading: Story = {
  args: {
    rows: [],
    hasMore: false,
    query: { ...readyQuery, isPending: true, data: undefined },
  },
};

export const Empty: Story = {
  args: { rows: [], hasMore: false },
};

export const NetworkFailure: Story = {
  args: {
    rows: [],
    hasMore: false,
    query: { ...readyQuery, isError: true, error: new Error("offline"), data: undefined },
  },
};

export const ReadOnlyRole: Story = {
  args: { canCreate: false, hasMore: false },
};

export const VoidedFilter: Story = {
  args: {
    filter: "voided",
    rows: salePage.filter((sale) => sale.financialState === "voided"),
    hasMore: false,
  },
};
