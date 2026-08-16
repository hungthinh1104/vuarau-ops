"use client";

import { Badge } from "@/ui/primitives/badge.tsx";
import { formatInstant } from "@/ui/format.ts";

export type CertaintyStatusType = "confirmed" | "queued" | "stale" | "unknown" | "offline";

export type CertaintyStatusProps = {
  readonly status: CertaintyStatusType;
  readonly asOf?: string | null | undefined;
  readonly label?: string | undefined;
  readonly description?: string | undefined;
  readonly className?: string | undefined;
};

const STATUS_CONFIG: Record<
  CertaintyStatusType,
  {
    readonly defaultLabel: string;
    readonly tone: "positive" | "warning" | "neutral" | "danger";
    readonly defaultDescription?: string;
  }
> = {
  confirmed: {
    defaultLabel: "Đã xác nhận",
    tone: "positive",
    defaultDescription: "Dữ liệu khớp với máy chủ trung tâm.",
  },
  queued: {
    defaultLabel: "Chờ đồng bộ",
    tone: "warning",
    defaultDescription: "Đã lưu an toàn trên thiết bị, đang chờ gửi lên máy chủ.",
  },
  stale: {
    defaultLabel: "Dữ liệu cũ",
    tone: "warning",
    defaultDescription: "Bản chụp offline từ lần kết nối trước.",
  },
  unknown: {
    defaultLabel: "Trạng thái chưa xác định",
    tone: "neutral",
    defaultDescription: "Chưa nhận được phản hồi xác nhận từ máy chủ.",
  },
  offline: {
    defaultLabel: "Ngoại tuyến",
    tone: "warning",
    defaultDescription: "Thiết bị đang không có kết nối internet.",
  },
};

/**
 * Standardized certainty status component for displaying data trustworthiness and sync state.
 */
export function CertaintyStatus({
  status,
  asOf,
  label,
  description,
  className = "",
}: CertaintyStatusProps) {
  const config = STATUS_CONFIG[status];
  const displayLabel = label ?? config.defaultLabel;
  const displayDesc = description ?? config.defaultDescription;

  return (
    <div className={["inline-flex flex-col gap-0.5", className].filter(Boolean).join(" ")}>
      <div className="flex items-center gap-2">
        <Badge tone={config.tone}>{displayLabel}</Badge>
        {asOf ? (
          <span className="text-caption text-ink-muted">tính đến {formatInstant(asOf)}</span>
        ) : null}
      </div>
      {displayDesc ? <p className="text-caption text-ink-muted">{displayDesc}</p> : null}
    </div>
  );
}
