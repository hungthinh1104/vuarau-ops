"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "@/ui/primitives/button.tsx";
import { TextareaControl } from "@/ui/primitives/textarea-control.tsx";

export function ReceiptReversalPanel(props: {
  readonly locked: boolean;
  readonly feedback?: ReactNode;
  readonly onSubmit: (reason: string) => void;
  readonly onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const valid = reason.trim().length > 0;
  return (
    <section
      aria-labelledby="receipt-reversal-title"
      className="rounded-card border border-warning/40 p-4"
    >
      <h2 id="receipt-reversal-title" className="font-semibold">
        Hoàn tác phiếu nhận
      </h2>
      <p className="mt-1 text-body-sm text-ink-muted">
        Chỉ dùng khi chính phiếu nhận đã ghi sai. Hoàn tác tạo biến động ngược và giữ phiếu gốc
        trong lịch sử. Không dùng cho hàng đã nhận đúng rồi mới trả nhà cung cấp: nghiệp vụ đó còn
        Nếu hàng đã nhận đúng rồi mới trả nhà cung cấp, hãy tạo yêu cầu xử lý riêng để tránh làm sai
        tồn kho hoặc công nợ.
      </p>
      <label className="mt-3 grid gap-2 text-label">
        Giải thích
        <TextareaControl
          disabled={props.locked}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          tone="secondary"
          disabled={!valid || props.locked}
          onClick={() => props.onSubmit(reason.trim())}
        >
          Xác nhận hoàn tác
        </Button>
        <Button tone="secondary" disabled={props.locked} onClick={props.onCancel}>
          Giữ phiếu nhận
        </Button>
      </div>
      {props.feedback}
    </section>
  );
}
