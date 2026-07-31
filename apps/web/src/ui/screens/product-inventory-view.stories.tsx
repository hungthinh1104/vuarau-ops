import type { Meta, StoryObj } from "@storybook/react-vite";
import type {
  InventoryBalanceDto,
  InventoryMovementDto,
  ProductDto,
  QualityGradeDto,
} from "@vuarau/domain-contracts";
import {
  ACTOR_ID,
  COMMAND_ID,
  PRODUCT_CA_CHUA_ID,
  QUALITY_GRADE_1_ID,
  QUALITY_GRADE_2_ID,
  SECOND_COMMAND_ID,
  WORKSPACE_ID,
  testUuid,
} from "@vuarau/test-fixtures/ids";
import {
  LATER_RECORDED_AT,
  LATER_TRANSACTION_TIME,
  RECORDED_AT,
  TRANSACTION_TIME,
} from "@vuarau/test-fixtures/time";
import { InventoryAdjustmentPanel } from "@/ui/patterns/inventory/inventory-adjustment-panel.tsx";
import { InventoryReclassificationPanel } from "@/ui/patterns/inventory/inventory-reclassification-panel.tsx";
import { ProductInventoryView } from "./product-inventory-view.tsx";

const product: ProductDto = {
  id: PRODUCT_CA_CHUA_ID,
  workspaceId: WORKSPACE_ID,
  displayName: "Cà chua",
  aliases: ["cà chua đỏ"],
  preferredUnit: "kg",
  isActive: true,
  version: 2,
  createdAt: RECORDED_AT,
  updatedAt: RECORDED_AT,
};

const grades: readonly QualityGradeDto[] = [
  {
    id: QUALITY_GRADE_1_ID,
    workspaceId: WORKSPACE_ID,
    name: "Loại 1",
    sortOrder: 10,
    isActive: true,
    version: 1,
    createdAt: RECORDED_AT,
    updatedAt: RECORDED_AT,
  },
  {
    id: QUALITY_GRADE_2_ID,
    workspaceId: WORKSPACE_ID,
    name: "Loại 2",
    sortOrder: 20,
    isActive: true,
    version: 1,
    createdAt: RECORDED_AT,
    updatedAt: RECORDED_AT,
  },
];

const balances: readonly InventoryBalanceDto[] = [
  {
    workspaceId: WORKSPACE_ID,
    productId: PRODUCT_CA_CHUA_ID,
    qualityGradeId: QUALITY_GRADE_1_ID,
    qualityGradeName: "Loại 1",
    unit: "kg",
    quantityScaled: 70_000,
    classification: "positive",
    movementCount: 3,
    lastMovementTransactionTime: LATER_TRANSACTION_TIME,
    updatedAt: LATER_RECORDED_AT,
  },
  {
    workspaceId: WORKSPACE_ID,
    productId: PRODUCT_CA_CHUA_ID,
    qualityGradeId: QUALITY_GRADE_2_ID,
    qualityGradeName: "Loại 2",
    unit: "kg",
    quantityScaled: -5_000,
    classification: "negative",
    movementCount: 4,
    lastMovementTransactionTime: LATER_TRANSACTION_TIME,
    updatedAt: LATER_RECORDED_AT,
  },
  {
    workspaceId: WORKSPACE_ID,
    productId: PRODUCT_CA_CHUA_ID,
    qualityGradeId: null,
    qualityGradeName: null,
    unit: "kg",
    quantityScaled: 18_000,
    classification: "positive",
    movementCount: 1,
    lastMovementTransactionTime: TRANSACTION_TIME,
    updatedAt: RECORDED_AT,
  },
];

const movements: readonly InventoryMovementDto[] = [
  {
    id: testUuid("9", 1) as InventoryMovementDto["id"],
    workspaceId: WORKSPACE_ID,
    productId: PRODUCT_CA_CHUA_ID,
    qualityGradeId: QUALITY_GRADE_1_ID,
    qualityGradeName: "Loại 1",
    quantity: { valueScaled: 70_000, unit: "kg" },
    sourceType: "purchase_receipt",
    sourceId: testUuid("8", 1),
    sourceLineId: testUuid("8", 2),
    reversalOfMovementId: null,
    reasonCode: null,
    reason: null,
    transactionTime: TRANSACTION_TIME,
    recordedAt: RECORDED_AT,
    actorId: ACTOR_ID,
    commandId: COMMAND_ID,
    sourceDocument: { type: "receipt", id: testUuid("8", 1) },
  },
  {
    id: testUuid("9", 2) as InventoryMovementDto["id"],
    workspaceId: WORKSPACE_ID,
    productId: PRODUCT_CA_CHUA_ID,
    qualityGradeId: QUALITY_GRADE_2_ID,
    qualityGradeName: "Loại 2",
    quantity: { valueScaled: -5_000, unit: "kg" },
    sourceType: "inventory_adjustment",
    sourceId: testUuid("8", 3),
    sourceLineId: null,
    reversalOfMovementId: null,
    reasonCode: "spoilage",
    reason: "Dập sau một ngày",
    transactionTime: LATER_TRANSACTION_TIME,
    recordedAt: LATER_RECORDED_AT,
    actorId: ACTOR_ID,
    commandId: SECOND_COMMAND_ID,
    sourceDocument: { type: "inventory_adjustment", id: testUuid("8", 3) },
  },
];

const readyProduct = { isPending: false, isError: false, error: null, data: product } as const;
const readyBalances = { isPending: false, isError: false, error: null, data: balances } as const;
const readyTimeline = {
  isPending: false,
  isError: false,
  error: null,
  data: {},
  isFetching: false,
} as const;

const adjustment = (
  <InventoryAdjustmentPanel
    grades={grades}
    completed={false}
    locked={false}
    onSubmit={() => undefined}
    onStartAnother={() => undefined}
  />
);
const reclassification = (
  <InventoryReclassificationPanel
    grades={grades}
    completed={false}
    locked={false}
    onSubmit={() => undefined}
    onStartAnother={() => undefined}
  />
);

const meta = {
  title: "Screens/Goods/ProductInventory",
  component: ProductInventoryView,
  args: {
    productId: PRODUCT_CA_CHUA_ID,
    productQuery: readyProduct,
    balancesQuery: readyBalances,
    timelineQuery: readyTimeline,
    balances,
    grades,
    movements,
    gradeFilter: undefined,
    unitFilter: null,
    hasMore: true,
    adjustment,
    reclassification,
    onGradeFilterChange: () => undefined,
    onUnitFilterChange: () => undefined,
    onLoadMore: () => undefined,
    onRetryProduct: () => undefined,
    onRetryBalances: () => undefined,
    onRetryTimeline: () => undefined,
  },
} satisfies Meta<typeof ProductInventoryView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const OwnerDesktop: Story = { globals: { viewport: { value: "desktop" } } };
export const WarehouseMobile: Story = { globals: { viewport: { value: "mobile" } } };
export const ReadOnly: Story = { args: { adjustment: undefined, reclassification: undefined } };
export const EmptyInventory: Story = {
  args: {
    balances: [],
    movements: [],
    balancesQuery: { ...readyBalances, data: [] },
    hasMore: false,
  },
};
export const Loading: Story = {
  args: {
    balances: [],
    movements: [],
    productQuery: { isPending: true, isError: false, error: null, data: undefined },
    balancesQuery: { isPending: true, isError: false, error: null, data: undefined },
    timelineQuery: {
      isPending: true,
      isError: false,
      error: null,
      data: undefined,
      isFetching: true,
    },
    hasMore: false,
  },
};
export const TimelineFailure: Story = {
  args: {
    timelineQuery: {
      isPending: false,
      isError: true,
      error: new Error("offline"),
      data: undefined,
      isFetching: false,
    },
    movements: [],
    hasMore: false,
  },
};
