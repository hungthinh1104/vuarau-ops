"use client";

import type { Money } from "@vuarau/domain-contracts";
import { formatMoney } from "@/ui/format.ts";
import { Button } from "@/ui/primitives/button.tsx";

export function QuickSaleFooter(props: {
  readonly total: Money;
  readonly draftExists: boolean;
  readonly locallyQueued: boolean;
  readonly replacementPending: boolean;
  readonly mayPost: boolean;
  readonly fulfilmentReady: boolean;
  readonly commandLocked: boolean;
  readonly posted: boolean;
  readonly onDiscard: () => void;
  readonly onSaveDraft: () => void;
  readonly onConfirm: () => void;
}) {
  const postDisabledReason = !props.mayPost
    ? "Bạn không có quyền chốt đơn."
    : !props.fulfilmentReady
      ? "Chọn mặt hàng và hạng hàng cho mọi dòng trước khi chốt."
      : props.replacementPending
        ? "Đang tải đơn cần thay thế…"
        : props.locallyQueued
          ? "Đơn đã được lưu an toàn trên thiết bị."
          : props.commandLocked
            ? "Đang gửi…"
            : props.posted
              ? "Đã chốt."
              : null;
  const draftDisabledReason = props.locallyQueued
    ? "Đơn đã được lưu an toàn trên thiết bị."
    : props.replacementPending
      ? "Đang tải đơn cần thay thế…"
      : null;

  return (
    <div className="fixed inset-x-0 bottom-16 z-20 border-t border-border bg-surface px-4 py-3 lg:bottom-0">
      <div className="mx-auto flex max-w-[1440px] items-center gap-2 lg:justify-end lg:px-8">
        <div className="mr-auto min-w-0">
          <p className="text-caption font-medium text-ink-muted">Tổng đơn</p>
          <p className="tabular truncate text-subheading font-semibold tracking-[-0.02em] text-ink">
            {formatMoney(props.total)}
          </p>
        </div>
        <Button
          tone="secondary"
          className="hidden sm:inline-flex"
          onClick={props.onDiscard}
          {...(props.locallyQueued ? { disabledReason: "Đơn đang chờ máy chủ xác nhận." } : {})}
        >
          {props.draftExists ? "Bỏ đơn" : "Huỷ"}
        </Button>
        <Button
          tone="secondary"
          onClick={props.onSaveDraft}
          {...(draftDisabledReason === null ? {} : { disabledReason: draftDisabledReason })}
        >
          Lưu nháp
        </Button>
        <Button
          className="min-w-32 sm:min-w-40"
          onClick={props.onConfirm}
          {...(postDisabledReason === null ? {} : { disabledReason: postDisabledReason })}
        >
          Chốt đơn
        </Button>
      </div>
    </div>
  );
}
