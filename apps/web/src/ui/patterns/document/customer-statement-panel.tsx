"use client";

import type { DocumentPeriod } from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "@/ui/primitives/button.tsx";
import { Input } from "@/ui/primitives/input.tsx";

function startOfVietnamDay(value: string): string | null {
  return value === "" ? null : `${value}T00:00:00.000+07:00`;
}

function endOfVietnamDay(value: string): string | null {
  return value === "" ? null : `${value}T23:59:59.999+07:00`;
}

export function CustomerStatementPanel(props: {
  readonly locked: boolean;
  readonly feedback?: ReactNode;
  readonly onSubmit: (period: DocumentPeriod) => void;
}) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const invalidRange = fromDate !== "" && toDate !== "" && fromDate > toDate;

  return (
    <section className="rounded-card border border-border bg-surface p-4">
      <h2 className="text-subheading font-semibold">Tạo sao kê nhiều ngày</h2>
      <p className="mt-1 text-body-sm text-ink-muted">
        Sao kê gom các đơn, thanh toán và điều chỉnh trong kỳ để in hoặc gửi. Mỗi giao dịch nguồn
        vẫn giữ ngày và mã riêng; hệ thống không biến nhiều ngày thành một đơn bán mới.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-label font-semibold">
          Từ ngày
          <Input
            type="date"
            value={fromDate}
            disabled={props.locked}
            onChange={(event) => setFromDate(event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-label font-semibold">
          Đến ngày
          <Input
            type="date"
            value={toDate}
            disabled={props.locked}
            onChange={(event) => setToDate(event.target.value)}
          />
        </label>
      </div>
      <p className="mt-2 text-caption text-ink-muted">
        Để trống cả hai ngày nếu cần in toàn bộ lịch sử công nợ.
      </p>
      {invalidRange ? (
        <p role="alert" className="mt-2 text-body-sm text-danger">
          Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.
        </p>
      ) : null}
      <Button
        className="mt-4"
        disabled={props.locked || invalidRange}
        onClick={() =>
          props.onSubmit({ from: startOfVietnamDay(fromDate), to: endOfVietnamDay(toDate) })
        }
      >
        {props.locked ? "Đang tạo sao kê" : "Tạo sao kê để in"}
      </Button>
      {props.feedback}
    </section>
  );
}
