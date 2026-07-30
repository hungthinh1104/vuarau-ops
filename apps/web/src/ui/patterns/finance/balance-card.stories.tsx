import type { Meta, StoryObj } from "@storybook/react-vite";
import { BalanceCard } from "./balance-card.tsx";
import { coversState } from "@/ui/patterns/sale/catalog-state.ts";
import {
  balanceCustomerCredit,
  balanceReceivable,
  balanceSettled,
} from "@/fixtures/account.fixtures.ts";

const meta = {
  title: "Patterns/BalanceCard",
  component: BalanceCard,
} satisfies Meta<typeof BalanceCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Receivable: Story = {
  name: "balance_receivable — khách còn nợ",
  parameters: coversState("balance_receivable"),
  args: {
    customerName: "Chị Lan — chợ Bình Điền",
    balance: balanceReceivable.balance,
    classification: balanceReceivable.classification,
    lastEntryTransactionTime: balanceReceivable.lastEntryTransactionTime,
  },
};

export const Settled: Story = {
  name: "balance_settled — hết nợ",
  parameters: coversState("balance_settled"),
  args: {
    customerName: "Anh Tuấn — vựa Thủ Đức",
    balance: balanceSettled.balance,
    classification: balanceSettled.classification,
    lastEntryTransactionTime: null,
  },
};

/**
 * The one that matters. A negative balance is a **credit**, never a negative debt:
 * "nợ −500.000" would send somebody to collect money from a person the depot owes.
 */
export const CustomerCredit: Story = {
  name: "balance_customer_credit — vựa nợ khách",
  parameters: coversState("balance_customer_credit"),
  args: {
    customerName: "Cô Hoà — quán cơm Tân Bình",
    balance: balanceCustomerCredit.balance,
    classification: balanceCustomerCredit.classification,
    lastEntryTransactionTime: balanceCustomerCredit.lastEntryTransactionTime,
  },
};

/**
 * No number at all while the real one is arriving. A worker who reads a `0 ₫`
 * placeholder as a balance collects nothing from somebody who owes millions.
 */
export const Loading: Story = {
  name: "loading — chưa có số liệu",
  parameters: coversState("loading"),
  args: {
    customerName: "Chị Lan — chợ Bình Điền",
    balance: null,
    classification: null,
  },
};
