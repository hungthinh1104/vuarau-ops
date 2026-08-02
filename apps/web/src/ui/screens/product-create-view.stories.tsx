import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ProductDto } from "@vuarau/domain-contracts";
import { PRODUCT_CA_CHUA_ID, WORKSPACE_ID } from "@vuarau/test-fixtures/ids";
import { RECORDED_AT } from "@vuarau/test-fixtures/time";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import { ProductCreateView } from "./product-create-view.tsx";

const idle: CommandOutcomeView = {
  phase: { kind: "idle" },
  pending: null,
  error: null,
  requestId: null,
  wasDuplicateSafeRetry: false,
  resend: async () => undefined,
};

const existingProduct: ProductDto = {
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

const meta = {
  title: "Screens/Products/Create",
  component: ProductCreateView,
  args: {
    name: "",
    aliases: "",
    unit: "" as const,
    candidates: undefined,
    command: idle,
    onName: () => undefined,
    onAliases: () => undefined,
    onUnit: () => undefined,
    onCreate: () => undefined,
  },
} satisfies Meta<typeof ProductCreateView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyForm: Story = { globals: { viewport: { value: "mobile" } } };
export const FilledForm: Story = {
  args: { name: "Rau cải xanh", aliases: "cải ngọt", unit: "kg" },
};
export const SimilarProductWarning: Story = {
  args: { name: "Cà chua", candidates: [existingProduct] },
};
export const Saving: Story = { args: { command: { ...idle, phase: { kind: "sending" } } } };
export const UnknownResult: Story = { args: { command: { ...idle, phase: { kind: "unknown" } } } };
