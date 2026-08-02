import type { Meta, StoryObj } from "@storybook/react-vite";
import { CUSTOMER_WITH_DEBT_ID } from "@vuarau/test-fixtures/ids";
import { customerDetail } from "@/fixtures/customer.fixtures.ts";
import { vnd } from "@/fixtures/session.fixtures.ts";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import { PaymentCreateView } from "./payment-create-view.tsx";

const idle: CommandOutcomeView = {
  phase: { kind: "idle" },
  pending: null,
  error: null,
  requestId: null,
  wasDuplicateSafeRetry: false,
  resend: async () => undefined,
};

const readyCustomer = {
  isPending: false,
  isError: false,
  error: null,
  data: customerDetail,
} as const;

const meta = {
  title: "Screens/Payments/Create",
  component: PaymentCreateView,
  args: {
    customerId: CUSTOMER_WITH_DEBT_ID,
    customer: readyCustomer,
    canRecord: true,
    role: "sales",
    amountText: "500000",
    amount: vnd(500_000),
    amountError: undefined,
    method: "cash" as const,
    payerName: "",
    note: "Thu tiền chuyến sáng",
    command: idle,
    onAmount: () => undefined,
    onMethod: () => undefined,
    onPayerName: () => undefined,
    onNote: () => undefined,
    onSubmit: () => undefined,
    onRetry: () => undefined,
    onCancel: () => undefined,
  },
} satisfies Meta<typeof PaymentCreateView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const RecordCashDesktop: Story = { globals: { viewport: { value: "desktop" } } };
export const RecordTransferMobile: Story = {
  globals: { viewport: { value: "mobile" } },
  args: { method: "bank_transfer" },
};
export const PermissionDenied: Story = { args: { canRecord: false, role: "warehouse" } };
export const LoadingCustomer: Story = {
  args: { customer: { isPending: true, isError: false, error: null, data: undefined } },
};
export const InvalidAmount: Story = {
  args: { amountText: "12x", amount: null, amountError: "Số tiền phải là số nguyên VND dương." },
};
export const UnknownResult: Story = { args: { command: { ...idle, phase: { kind: "unknown" } } } };
export const NetworkFailure: Story = {
  args: {
    customer: { isPending: false, isError: true, error: new Error("offline"), data: undefined },
  },
};
