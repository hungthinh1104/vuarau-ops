import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Page, ProductCoverageDto, ProductDto } from "@vuarau/domain-contracts";
import { PRODUCT_CA_CHUA_ID, PRODUCT_RAU_MUONG_ID, WORKSPACE_ID } from "@vuarau/test-fixtures/ids";
import { RECORDED_AT } from "@vuarau/test-fixtures/time";
import { ProductsDirectoryView } from "./products-directory-view.tsx";

const products: readonly ProductDto[] = [
  {
    id: PRODUCT_CA_CHUA_ID,
    workspaceId: WORKSPACE_ID,
    displayName: "Cà chua",
    aliases: ["cà chua đỏ", "cà chua bi"],
    preferredUnit: "kg",
    isActive: true,
    version: 2,
    createdAt: RECORDED_AT,
    updatedAt: RECORDED_AT,
  },
  {
    id: PRODUCT_RAU_MUONG_ID,
    workspaceId: WORKSPACE_ID,
    displayName: "Rau muống",
    aliases: ["rau muống ruộng"],
    preferredUnit: "bo",
    isActive: false,
    version: 4,
    createdAt: RECORDED_AT,
    updatedAt: RECORDED_AT,
  },
];

const page: Page<ProductDto> = { items: products, nextCursor: null };
const ready = { isPending: false, isError: false, error: null, data: page } as const;
const coverage: readonly ProductCoverageDto[] = [
  {
    workspaceId: WORKSPACE_ID,
    productId: PRODUCT_CA_CHUA_ID,
    quantities: [
      {
        unit: "kg",
        onHand: { valueScaled: 20_000, unit: "kg" },
        inboundRemaining: { valueScaled: 10_000, unit: "kg" },
        outboundRemaining: { valueScaled: 45_000, unit: "kg" },
        availableAfterCommitments: { valueScaled: -15_000, unit: "kg" },
        classification: "shortage",
      },
    ],
  },
  {
    workspaceId: WORKSPACE_ID,
    productId: PRODUCT_RAU_MUONG_ID,
    quantities: [
      {
        unit: "bo",
        onHand: { valueScaled: 80_000, unit: "bo" },
        inboundRemaining: { valueScaled: 0, unit: "bo" },
        outboundRemaining: { valueScaled: 25_000, unit: "bo" },
        availableAfterCommitments: { valueScaled: 55_000, unit: "bo" },
        classification: "covered",
      },
    ],
  },
];
const readyCoverage = { isPending: false, isError: false, error: null, data: coverage } as const;

const meta = {
  title: "Screens/Products/Directory",
  component: ProductsDirectoryView,
  args: {
    queryText: "",
    activeFilter: null,
    search: ready,
    coverageQuery: readyCoverage,
    products,
    coverage,
    nextCursor: null,
    isFetching: false,
    canCreate: true,
    onQueryChange: () => undefined,
    onClearQuery: () => undefined,
    onFilterChange: () => undefined,
    onRetry: () => undefined,
    onRetryCoverage: () => undefined,
    onLoadMore: () => undefined,
  },
} satisfies Meta<typeof ProductsDirectoryView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const DesktopDirectory: Story = { globals: { viewport: { value: "desktop" } } };
export const MobileDirectory: Story = { globals: { viewport: { value: "mobile" } } };
export const ReadOnly: Story = { args: { canCreate: false } };
export const EmptySearch: Story = {
  args: {
    queryText: "rau thơm",
    products: [],
    search: { ...ready, data: { items: [], nextCursor: null } },
  },
};
export const Loading: Story = {
  args: {
    products: [],
    search: { isPending: true, isError: false, error: null, data: undefined },
  },
};
export const NetworkFailure: Story = {
  args: {
    products: [],
    search: { isPending: false, isError: true, error: new Error("offline"), data: undefined },
  },
};
