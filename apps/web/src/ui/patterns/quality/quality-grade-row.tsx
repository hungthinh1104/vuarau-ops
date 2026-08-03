"use client";

import type { QualityGradeDto } from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { TextInput } from "@/ui/primitives/text-input.tsx";

export type QualityGradeUpdateIntent = {
  readonly name: string;
  readonly sortOrder: number;
};

export type QualityGradeLifecycleIntent = {
  readonly active: boolean;
  readonly reason: string;
};

export type QualityGradeRowProps = {
  readonly grade: QualityGradeDto;
  readonly mayManage: boolean;
  readonly onUpdate: (intent: QualityGradeUpdateIntent) => Promise<boolean>;
  readonly onLifecycle: (intent: QualityGradeLifecycleIntent) => Promise<boolean>;
  readonly feedback?: ReactNode;
};

export function QualityGradeRow({
  grade,
  mayManage,
  onUpdate,
  onLifecycle,
  feedback,
}: QualityGradeRowProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(grade.name);
  const [sortOrder, setSortOrder] = useState(String(grade.sortOrder));
  const [lifecycleOpen, setLifecycleOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(grade.name);
    setSortOrder(String(grade.sortOrder));
  }, [grade.name, grade.sortOrder]);

  const parsedOrder = Number(sortOrder);
  const updateValid = name.trim().length > 0 && Number.isInteger(parsedOrder);
  const lifecycleValid = reason.trim().length > 0;

  async function submitUpdate(): Promise<void> {
    if (!updateValid || busy) return;
    setBusy(true);
    try {
      const ok = await onUpdate({ name: name.trim(), sortOrder: parsedOrder });
      if (ok) setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  async function submitLifecycle(): Promise<void> {
    if (!lifecycleValid || busy) return;
    setBusy(true);
    try {
      const ok = await onLifecycle({ active: !grade.isActive, reason: reason.trim() });
      if (ok) {
        setLifecycleOpen(false);
        setReason("");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="grid gap-3 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <strong>{grade.name}</strong>
            <Badge tone={grade.isActive ? "positive" : "neutral"}>
              {grade.isActive ? "Đang dùng" : "Đã ngưng"}
            </Badge>
          </div>
          <p className="mt-1 text-caption text-ink-muted">
            Thứ tự {grade.sortOrder} · phiên bản {grade.version}
          </p>
        </div>
        {mayManage ? (
          <div className="flex flex-wrap gap-2">
            <Button
              tone="secondary"
              onClick={() => {
                setEditing((current) => !current);
                setLifecycleOpen(false);
              }}
            >
              {editing ? "Đóng sửa" : "Sửa"}
            </Button>
            <Button
              tone={grade.isActive ? "danger" : "secondary"}
              onClick={() => {
                setLifecycleOpen((current) => !current);
                setEditing(false);
              }}
            >
              {grade.isActive ? "Ngưng phẩm cấp" : "Dùng lại phẩm cấp"}
            </Button>
          </div>
        ) : null}
      </div>

      {editing ? (
        <section className="grid gap-3 rounded-card border border-border bg-surface-muted p-3 sm:grid-cols-[1fr_10rem_auto]">
          <TextInput
            label="Tên phẩm cấp"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <TextInput
            label="Thứ tự"
            inputMode="numeric"
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
          />
          <Button
            className="self-end"
            disabled={!updateValid || busy}
            onClick={() => void submitUpdate()}
          >
            Cập nhật phẩm cấp
          </Button>
        </section>
      ) : null}

      {lifecycleOpen ? (
        <section className="grid gap-3 rounded-card border border-border bg-surface-muted p-3 sm:grid-cols-[1fr_auto]">
          <TextInput
            label={grade.isActive ? "Lý do ngưng" : "Lý do dùng lại"}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={
              grade.isActive
                ? "Ví dụ: Không còn dùng cách phân loại này"
                : "Ví dụ: Dùng lại cho mùa hàng mới"
            }
          />
          <Button
            className="self-end"
            tone={grade.isActive ? "danger" : "secondary"}
            disabled={!lifecycleValid || busy}
            onClick={() => void submitLifecycle()}
          >
            {grade.isActive ? "Xác nhận ngưng" : "Xác nhận dùng lại"}
          </Button>
          <p className="text-caption text-ink-muted sm:col-span-2">
            Chỉ ảnh hưởng lựa chọn cho giao dịch mới. Chứng từ và tồn kho lịch sử vẫn giữ phẩm cấp
            đã ghi.
          </p>
        </section>
      ) : null}

      {feedback}
    </li>
  );
}
