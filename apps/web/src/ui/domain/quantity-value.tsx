import type { Quantity } from "@vuarau/domain-contracts";
import { formatQuantity } from "../format.ts";

export type QuantityValueProps = {
  readonly quantity: Quantity;
  readonly className?: string;
};

/**
 * Standard unit formatting for domain quantities.
 * Wraps formatQuantity to provide a consistent component API.
 */
export function QuantityValue({ quantity, className }: QuantityValueProps) {
  return (
    <span className={["tabular-nums", className].filter(Boolean).join(" ")}>
      {formatQuantity(quantity)}
    </span>
  );
}
