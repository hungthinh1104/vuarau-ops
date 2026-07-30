import type { Meta, StoryObj } from "@storybook/react-vite";
import { PaymentStatus } from "./payment-status.tsx";
import { coversState } from "@/ui/patterns/sale/catalog-state.ts";
import {
  paymentPartiallyReversed,
  paymentRecorded,
  paymentReversed,
} from "@/fixtures/payment.fixtures.ts";

const meta = {
  title: "Patterns/PaymentStatus",
  component: PaymentStatus,
} satisfies Meta<typeof PaymentStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Recorded: Story = {
  name: "payment_recorded — chưa hoàn gì",
  parameters: coversState("payment_recorded"),
  args: {
    status: paymentRecorded.status,
    amount: paymentRecorded.amount,
    reversedAmount: paymentRecorded.reversedAmount,
    remainingReversibleAmount: paymentRecorded.remainingReversibleAmount,
  },
};

/**
 * All three numbers. "Hoàn 200.000 trong 500.000" and "hoàn 200.000" are different
 * facts, and only the first can be checked against a paper book.
 */
export const PartiallyReversed: Story = {
  name: "payment_partially_reversed — đủ ba con số",
  parameters: coversState("payment_partially_reversed"),
  args: {
    status: paymentPartiallyReversed.status,
    amount: paymentPartiallyReversed.amount,
    reversedAmount: paymentPartiallyReversed.reversedAmount,
    remainingReversibleAmount: paymentPartiallyReversed.remainingReversibleAmount,
  },
};

export const Reversed: Story = {
  name: "payment_reversed — trạng thái cuối",
  parameters: coversState("payment_reversed"),
  args: {
    status: paymentReversed.status,
    amount: paymentReversed.amount,
    reversedAmount: paymentReversed.reversedAmount,
    remainingReversibleAmount: paymentReversed.remainingReversibleAmount,
  },
};
