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
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 pb-32 lg:gap-6 lg:px-8">
      <header className="border-b border-border pb-5">
        <PageHeader
          title="Đơn hàng mới"
          back={{ href: `/customers/${props.customerId}`, label: "Khách hàng" }}
          status={<Badge tone={status.tone}>{status.label}</Badge>}
        />
        <p className="mt-3 max-w-2xl text-body-sm text-ink-muted">
          Đơn nháp <strong className="font-semibold text-ink">chưa tính vào công nợ</strong>; công
          nợ chỉ phát sinh khi chốt đơn.
        </p>
      </header>

      {props.contextNotices}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6">
        <main className="grid min-w-0 gap-5">
          <section className="rounded-card border border-border bg-surface p-4 sm:p-5">
            {props.customerSection}
          </section>
          <section className="rounded-card border border-border bg-surface p-4 sm:p-5">
            {props.linesSection}
          </section>
          {props.operationalNotices}
          {props.productResolution}
          <section className="rounded-card border border-border bg-surface p-4 sm:p-5">
            {props.noteSection}
          </section>
          {props.outcomes}
        </main>

        <aside className="grid gap-4 lg:sticky lg:top-4">
          <section className="rounded-card border border-border bg-surface p-4 sm:p-5">
            <p className="text-label font-medium text-ink-muted">Tổng đơn</p>
            <p
              className="tabular mt-2 text-display font-semibold tracking-[-0.03em]"
              data-testid="sale-total"
            >
              {formatMoney(props.total)}
            </p>
          </section>
          {props.balanceSection}
        </aside>
      </div>

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
