import type { ProductCoverageQuantityDto } from "@vuarau/domain-contracts";
import { formatQuantity } from "@/ui/format.ts";

/** Presentation only; shortage classification and quantity are server-authored. */
export function formatCoverageAvailability(quantity: ProductCoverageQuantityDto): string {
  const magnitude = {
    ...quantity.availableAfterCommitments,
    valueScaled: Math.abs(quantity.availableAfterCommitments.valueScaled),
  };
  if (quantity.classification === "shortage") return `Thiếu ${formatQuantity(magnitude)}`;
  if (quantity.classification === "idle") return "Chưa phát sinh";
  return `Còn ${formatQuantity(magnitude)}`;
}
