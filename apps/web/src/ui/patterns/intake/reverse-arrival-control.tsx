"use client";

import type { GoodsArrivalDto } from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import { Button } from "@/ui/primitives/button.tsx";
import { Input } from "@/ui/primitives/input.tsx";

export type ReverseArrivalControlProps = {
  readonly arrival: GoodsArrivalDto;
  readonly reason: string;
  readonly locked: boolean;
  readonly feedback?: ReactNode;
  readonly onReasonChange: (value: string) => void;
  readonly onSubmit: () => void;
};

export function ReverseArrivalControl({
  reason,
  locked,
  feedback,
  onReasonChange,
  onSubmit,
}: ReverseArrivalControlProps) {
  return (
    <details className="rounded-card border border-danger/30 p-3">
      <summary className="cursor-pointer text-label font-semibold text-danger">
        Hoàn tác lần hàng đến
      </summary>
      <p className="mt-2 text-caption text-ink-muted">
        Chỉ thực hiện được sau khi mọi quyết định và kiểm định hiệu lực đã được hoàn tác.
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
        <Input
          value={reason}
          placeholder="Lý do hoàn tác hàng đến"
          onChange={(event) => onReasonChange(event.target.value)}
        />
        <Button tone="danger" disabled={locked || reason.trim().length === 0} onClick={onSubmit}>
          {locked ? "Đang hoàn tác" : "Xác nhận hoàn tác hàng đến"}
        </Button>
      </div>
      {feedback}
    </details>
  );
}
