"use client";

import type { QualityDispositionDto } from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import { formatQuantity } from "@/ui/format.ts";

export function QuarantineResolution({
  allocation,
  activeChild,
  eligibleValueScaled,
  child,
}: {
  readonly allocation: QualityDispositionDto["allocations"][number];
  readonly activeChild: boolean;
  readonly eligibleValueScaled: number;
  readonly child: ReactNode;
}) {
  return activeChild || eligibleValueScaled === 0 ? (
    <section className="rounded-card border border-border bg-canvas p-3 text-body-sm text-ink-muted">
      Lượng cách ly {formatQuantity(allocation.quantity)} đã có quyết định xử lý hiệu lực.
    </section>
  ) : (
    child
  );
}
