import type { Meta, StoryObj } from "@storybook/react-vite";
import type { GoodsArrivalDto } from "@vuarau/domain-contracts";
import { ACTOR_ID, PRODUCT_CA_CHUA_ID, WORKSPACE_ID, testUuid } from "@vuarau/test-fixtures/ids";
import { RECORDED_AT, TRANSACTION_TIME } from "@vuarau/test-fixtures/time";
import { IntakeListView } from "./intake-list-view.tsx";

const arrival: GoodsArrivalDto = {
  id: testUuid("d", 21) as GoodsArrivalDto["id"],
  workspaceId: WORKSPACE_ID,
  supplierId: testUuid("a", 23) as GoodsArrivalDto["supplierId"],
  purchaseId: null,
  vehicleReference: "Xe 51C-123.45",
  lines: [
    {
      arrivalLineId: testUuid("d", 22) as GoodsArrivalDto["lines"][number]["arrivalLineId"],
      purchaseLineId: null,
      productId: PRODUCT_CA_CHUA_ID,
      productName: "Cà chua",
      arrivedQuantity: { valueScaled: 40_000, unit: "kg" },
      weighing: null,
      supplierLotCode: "LO-0703",
      note: "Thùng nguyên vẹn",
    },
  ],
  note: "Cân tại cửa số 2",
  transactionTime: TRANSACTION_TIME,
  recordedAt: RECORDED_AT,
  actorId: ACTOR_ID,
  commandId: testUuid("4", 21) as GoodsArrivalDto["commandId"],
  evidenceReferences: [],
  reversal: null,
};

const ready = {
  isPending: false,
  isError: false,
  error: null,
  data: { items: [arrival] },
} as const;

const meta = {
  title: "Screens/Intake/Directory",
  component: IntakeListView,
  args: {
    query: ready,
    canRead: true,
    role: "warehouse",
    roles: ["warehouse"],
    onRetry: () => undefined,
  },
} satisfies Meta<typeof IntakeListView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WarehouseDesktop: Story = { globals: { viewport: { value: "desktop" } } };
export const WarehouseMobile: Story = { globals: { viewport: { value: "mobile" } } };
export const PermissionDenied: Story = { args: { canRead: false, roles: ["sales"] } };
export const Empty: Story = { args: { query: { ...ready, data: { items: [] } } } };
export const Loading: Story = {
  args: { query: { isPending: true, isError: false, error: null, data: undefined } },
};
export const NetworkFailure: Story = {
  args: {
    query: { isPending: false, isError: true, error: new Error("offline"), data: undefined },
  },
};
