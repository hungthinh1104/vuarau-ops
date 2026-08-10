"use client";

import { Button } from "@/ui/primitives/button.tsx";

export function CorrectionTarget(props: { readonly label: string; readonly onClear: () => void }) {
  return (
    <div className="grid gap-2 rounded-input border border-border-subtle bg-canvas p-3">
      <p className="text-label font-semibold">Bản ghi cần điều chỉnh</p>
      {props.label === "" ? (
        <p className="text-body-sm text-ink-muted">
          Chọn “Điều chỉnh bản ghi này” trong lịch sử bên dưới.
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-body-sm">{props.label}</p>
          <Button tone="secondary" onClick={props.onClear}>
            Chọn lại
          </Button>
        </div>
      )}
    </div>
  );
}
