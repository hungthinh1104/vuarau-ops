import type { Meta, StoryObj } from "@storybook/react-vite";
import { SaleStatus } from "./sale-status.tsx";
import { coversState } from "./catalog-state.ts";
import { REPLACEMENT_SALE_ID, VOIDED_SALE_ID } from "@vuarau/test-fixtures/ids";

const meta = {
  title: "Patterns/SaleStatus",
  component: SaleStatus,
} satisfies Meta<typeof SaleStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Draft: Story = {
  name: "sale_draft — chưa phát sinh công nợ",
  parameters: coversState("sale_draft"),
  args: { status: "draft", financialState: null, dueState: "no_due_date" },
};

/** Kept on the list and greyed. Somebody decided to throw it away; that is record. */
export const Discarded: Story = {
  name: "sale_discarded — đã bỏ, vẫn hiện",
  parameters: coversState("sale_discarded"),
  args: { status: "discarded", financialState: null, dueState: "no_due_date" },
};

export const Posted: Story = {
  name: "sale_posted — công nợ đang đứng",
  parameters: coversState("sale_posted"),
  args: { status: "posted", financialState: "active", dueState: "no_due_date" },
};

/**
 * `status` is still `posted` — voiding appends a record beside the sale rather
 * than editing an immutable row, and `voided` is derived from that record
 * (BR-SALE-013). Both badges are true at once, which is the point.
 */
export const Voided: Story = {
  name: "sale_voided — vẫn hiện, không ẩn",
  parameters: coversState("sale_voided"),
  args: {
    status: "posted",
    financialState: "voided",
    dueState: "no_due_date",
    replacedBySaleId: REPLACEMENT_SALE_ID,
  },
};

export const Replaced: Story = {
  name: "sale_replaced — đơn thay thế, có liên kết",
  parameters: coversState("sale_replaced"),
  args: {
    status: "posted",
    financialState: "active",
    dueState: "no_due_date",
    replacesSaleId: VOIDED_SALE_ID,
  },
};

/** Renders **nothing** for the term. Most depot sales have none (BR-SALE-017). */
export const NoDueDate: Story = {
  name: "no_due_date — không cảnh báo gì",
  parameters: coversState("no_due_date"),
  args: { status: "posted", financialState: "active", dueState: "no_due_date" },
};

export const Due: Story = {
  name: "due — có hạn thanh toán",
  parameters: coversState("due"),
  args: { status: "posted", financialState: "active", dueState: "due" },
};

export const Overdue: Story = {
  name: "overdue — quá hạn",
  parameters: coversState("overdue"),
  args: { status: "posted", financialState: "active", dueState: "overdue" },
};
