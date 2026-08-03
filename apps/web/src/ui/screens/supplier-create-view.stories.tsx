import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import { SupplierCreateView } from "./supplier-create-view.tsx";

const idle: CommandOutcomeView = {
  phase: { kind: "idle" },
  pending: null,
  error: null,
  requestId: null,
  wasDuplicateSafeRetry: false,
  resend: async () => undefined,
};

const meta = {
  title: "Screens/Suppliers/Create",
  component: SupplierCreateView,
  args: {
    displayName: "",
    phone: "",
    note: "",
    command: idle,
    onDisplayName: () => undefined,
    onPhone: () => undefined,
    onNote: () => undefined,
    onCreate: () => undefined,
  },
} satisfies Meta<typeof SupplierCreateView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyForm: Story = { globals: { viewport: { value: "mobile" } } };
export const FilledForm: Story = {
  args: {
    displayName: "HTX Rau sạch Bình Điền",
    phone: "0903 112 233",
    note: "Giao trước 06:00, gọi trước khi tới",
  },
};
export const Saving: Story = { args: { command: { ...idle, phase: { kind: "sending" } } } };
export const UnknownResult: Story = { args: { command: { ...idle, phase: { kind: "unknown" } } } };
