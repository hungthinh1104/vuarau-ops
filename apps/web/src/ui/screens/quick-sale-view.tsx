"use client";

import type { Money } from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import { formatMoney } from "@/ui/format.ts";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";

export type QuickSaleDraftState = "unsaved" | "dirty" | "saved" | "queued" | "sync_attention";

export function QuickSaleView(props: {
  readonly customerId: string;
  readonly draftState: QuickSaleDraftState;
  readonly contextNotices?: ReactNode;
  readonly customerSection: ReactNode;
  readonly linesSection: ReactNode;
  readonly operationalNotices?: ReactNode;
  readonly productResolution?: ReactNode;
  readonly noteSection: ReactNode;
  readonly total: Money;
  readonly balanceSection?: ReactNode;
  readonly outcomes?: ReactNode;
  readonly picker?: ReactNode;
  readonly confirmation?: ReactNode;
  readonly footer: ReactNode;
}) {
  const status = draftStateCopy(props.draftState);
  return (
    <div className="flex flex-col gap-6 pb-28">
      <PageHeader
        title="Đơn hàng mới"
        back={{ href: `/customers/${props.customerId}`, label: "Khách hàng" }}
        status={<Badge tone={status.tone}>{status.label}</Badge>}
      />

      <p className="text-body-sm text-info">
        Đơn nháp <strong>chưa tính vào công nợ</strong>; công nợ chỉ phát sinh khi chốt đơn.
      </p>

      {props.contextNotices}
      {props.customerSection}
      {props.linesSection}
      {props.operationalNotices}
      {props.productResolution}
      {props.noteSection}

      <section className="border-y border-border py-4">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-body-sm font-semibold text-ink-muted">Tổng đơn</span>
          <span className="tabular text-display font-bold" data-testid="sale-total">
            {formatMoney(props.total)}
          </span>
        </div>
      </section>

      {props.balanceSection}
      {props.outcomes}
      {props.picker}
      {props.confirmation}
      {props.footer}
    </div>
  );
}

function draftStateCopy(state: QuickSaleDraftState): {
  readonly label: string;
  readonly tone: "neutral" | "info" | "warning";
} {
  switch (state) {
    case "unsaved":
      return { label: "Chưa lưu", tone: "neutral" };
    case "dirty":
      return { label: "Có thay đổi chưa lưu", tone: "neutral" };
    case "saved":
      return { label: "Đã lưu nháp", tone: "info" };
    case "queued":
      return { label: "Đã lưu trên thiết bị · chờ máy chủ", tone: "warning" };
    case "sync_attention":
      return { label: "Cần xử lý đồng bộ", tone: "warning" };
  }
}
