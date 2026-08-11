"use client";

import type { DomainError } from "@vuarau/domain-contracts";
import { Button } from "@/ui/primitives/button.tsx";
import { BusinessRejection } from "./business-rejection.tsx";

type OfflineState = "queued" | "syncing" | "confirmed" | "retry_wait" | "blocked" | "rejected";

export function OfflineCommandOutcome(props: {
  readonly state: OfflineState | null;
  readonly error: DomainError | null;
  readonly attemptedAction: string;
  readonly onRetry: () => void;
}) {
  if (props.state === null || props.state === "confirmed") return null;

  if (props.state === "rejected" || props.state === "blocked") {
    if (props.error !== null) return <BusinessRejection error={props.error} />;
    return (
      <div role="alert" className="rounded-card border border-danger/40 bg-danger-soft px-4 py-3">
        <p className="text-label font-semibold text-danger">Cần xử lý</p>
        <p className="mt-1 text-body-sm text-ink">
          {props.attemptedAction} chưa được máy chủ xác nhận. Giữ nguyên giao dịch này và liên hệ
          người quản lý trước khi ghi lại.
        </p>
      </div>
    );
  }

  const waitingForConnection = props.state === "retry_wait";
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-offline/40 bg-offline-soft px-4 py-3"
    >
      <div>
        <p className="text-label font-semibold text-offline">Đã lưu trên thiết bị</p>
        <p className="mt-1 text-body-sm text-ink">
          {waitingForConnection
            ? `${props.attemptedAction} sẽ được gửi khi có mạng trở lại.`
            : `${props.attemptedAction} đang được gửi đến máy chủ.`}
        </p>
      </div>
      {waitingForConnection ? (
        <Button tone="secondary" onClick={props.onRetry}>
          Thử đồng bộ
        </Button>
      ) : null}
    </div>
  );
}
