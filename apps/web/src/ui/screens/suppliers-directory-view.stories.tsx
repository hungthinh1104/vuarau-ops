import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Page, SupplierDto } from "@vuarau/domain-contracts";
import { WORKSPACE_ID, testUuid } from "@vuarau/test-fixtures/ids";
import { RECORDED_AT } from "@vuarau/test-fixtures/time";
import { SuppliersDirectoryView } from "./suppliers-directory-view.tsx";

const suppliers: readonly SupplierDto[] = [
  {
    id: testUuid("a", 21) as SupplierDto["id"],
    workspaceId: WORKSPACE_ID,
    displayName: "HTX Rau sạch Bình Điền",
    phone: "0903 112 233",
    note: "Giao trước 06:00",
    isActive: true,
    version: 2,
    createdAt: RECORDED_AT,
    updatedAt: RECORDED_AT,
  },
  {
    id: testUuid("a", 22) as SupplierDto["id"],
    workspaceId: WORKSPACE_ID,
    displayName: "Vườn rau cô Hòa",
    phone: null,
    note: null,
    isActive: false,
    version: 3,
    createdAt: RECORDED_AT,
    updatedAt: RECORDED_AT,
  },
];

const page: Page<SupplierDto> = { items: suppliers, nextCursor: null };
const ready = { isPending: false, isError: false, error: null, data: page } as const;

const meta = {
  title: "Screens/Suppliers/Directory",
  component: SuppliersDirectoryView,
  args: {
    queryText: "",
    search: ready,
    suppliers,
    nextCursor: null,
    isFetching: false,
    canCreate: true,
    onQueryChange: () => undefined,
    onClearQuery: () => undefined,
    onRetry: () => undefined,
    onLoadMore: () => undefined,
  },
} satisfies Meta<typeof SuppliersDirectoryView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const DesktopDirectory: Story = { globals: { viewport: { value: "desktop" } } };
export const MobileDirectory: Story = { globals: { viewport: { value: "mobile" } } };
export const ReadOnly: Story = { args: { canCreate: false } };
export const EmptySearch: Story = {
  args: {
    queryText: "vườn miền Tây",
    suppliers: [],
    search: { ...ready, data: { items: [], nextCursor: null } },
  },
};
export const Loading: Story = {
  args: {
    suppliers: [],
    search: { isPending: true, isError: false, error: null, data: undefined },
  },
};
export const NetworkFailure: Story = {
  args: {
    suppliers: [],
    search: { isPending: false, isError: true, error: new Error("offline"), data: undefined },
  },
};
