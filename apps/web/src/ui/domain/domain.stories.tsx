import type { Meta, StoryObj } from "@storybook/react-vite";
import { MoneyValue } from "./money-value.tsx";
import { QuantityValue } from "./quantity-value.tsx";
import { StatusBadge } from "./status-badge.tsx";

const meta = { title: "Domain" } satisfies Meta;
export default meta;
type Story = StoryObj;

export const MoneyValues: Story = {
  name: "MoneyValue",
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-caption text-ink-muted">Neutral (Default)</p>
        <MoneyValue value={{ amountMinor: 4500000, currency: "VND" }} />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-caption text-ink-muted">Danger Tone</p>
        <MoneyValue value={{ amountMinor: -4500000, currency: "VND" }} tone="danger" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-caption text-ink-muted">Success Tone (with explicitly shown sign)</p>
        <MoneyValue value={{ amountMinor: 4500000, currency: "VND" }} tone="success" showSign />
      </div>
    </div>
  ),
};

export const QuantityValues: Story = {
  name: "QuantityValue",
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-caption text-ink-muted">Standard Kilograms</p>
        <QuantityValue quantity={{ valueScaled: 12500, unit: "kg" }} />
      </div>
    </div>
  ),
};

export const StatusBadges: Story = {
  name: "StatusBadge",
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <StatusBadge status="Còn nợ" tone="danger" />
        <StatusBadge status="Hết nợ" tone="neutral" />
        <StatusBadge status="Khách trả trước" tone="positive" />
      </div>
      <p className="text-caption text-ink-muted mt-2 max-w-prose">
        StatusBadge explicitly decouples visual representation from business rules. Tone must be
        strictly passed by the domain consumer.
      </p>
    </div>
  ),
};
