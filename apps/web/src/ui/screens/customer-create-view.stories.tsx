import type { Meta, StoryObj } from "@storybook/react-vite";
import { CUSTOMER_ID, CUSTOMER_WITH_DEBT_ID } from "@vuarau/test-fixtures/ids";
import { customerWithReceivable } from "@/fixtures/customer.fixtures.ts";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import { CustomerCreateView } from "./customer-create-view.tsx";

const idle: CommandOutcomeView = {
  phase: { kind: "idle" },
  pending: null,
  error: null,
  wasDuplicateSafeRetry: false,
  resend: async () => undefined,
};

const meta = {
  title: "Screens/Customers/Create",
  component: CustomerCreateView,
  args: {
    displayName: "",
    phone: "",
    note: "",
    duplicates: undefined,
    command: idle,
    onDisplayName: () => undefined,
    onPhone: () => undefined,
    onNote: () => undefined,
    onCreate: () => undefined,
    onReload: () => undefined,
    onCancel: () => undefined,
  },
} satisfies Meta<typeof CustomerCreateView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyForm: Story = { globals: { viewport: { value: "mobile" } } };
export const FilledForm: Story = {
  args: {
    displayName: "Chị Mai quán 7",
    phone: "0912 345 678",
    note: "Giao hàng buổi chiều",
  },
};
export const PossibleDuplicate: Story = {
  args: {
    displayName: customerWithReceivable.displayName,
    phone: customerWithReceivable.phone ?? "",
    duplicates: [
      {
        customer: {
          id: CUSTOMER_WITH_DEBT_ID,
          displayName: customerWithReceivable.displayName,
          phone: customerWithReceivable.phone,
        },
        reasons: ["same_name", "same_phone"],
      },
      {
        customer: { id: CUSTOMER_ID, displayName: "Chị Lan cũ", phone: null },
        reasons: ["same_name"],
      },
    ],
  },
};
export const Saving: Story = { args: { command: { ...idle, phase: { kind: "sending" } } } };
export const UnknownResult: Story = { args: { command: { ...idle, phase: { kind: "unknown" } } } };
