"use client";

import type { WorkspaceIntegrityDto } from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { Input } from "@/ui/primitives/input.tsx";

export function OperationsView(props: {
  readonly canManage: boolean;
  readonly queuedCount: number;
  readonly blockedCount: number;
  readonly lastSuccessfulSync: string | null;
  readonly integrityState: "loading" | "ready" | "error";
  readonly integrity: WorkspaceIntegrityDto | null;
  readonly exportLocked: boolean;
  readonly exportCompleted: boolean;
  readonly backupSelected: boolean;
  readonly validation: { readonly valid: boolean; readonly diagnostics: readonly string[] } | null;
  readonly validationPending: boolean;
  readonly fileError: string | null;
  readonly restoreReason: string;
  readonly restoreLocked: boolean;
  readonly restoreCompleted: boolean;
  readonly exportOutcome?: ReactNode;
  readonly restoreOutcome?: ReactNode;
  readonly onRetrySync: () => void;
  readonly onRetryIntegrity: () => void;
  readonly onExport: () => void;
  readonly onResetExport: () => void;
  readonly onBackupFileSelected: (file: File) => void;
  readonly onRestoreReasonChange: (value: string) => void;
  readonly onRestore: () => void;
}) {
  if (!props.canManage) return <p role="alert">Chỉ chủ vựa được mở khu vực vận hành.</p>;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="Vận hành hệ thống" back={{ href: "/workspace", label: "Quản lý vựa" }} />

      <section className="rounded-card border border-border bg-surface p-4">
        <h2 className="text-subheading font-semibold">Đồng bộ thiết bị</h2>
        <p>
          {props.queuedCount} thay đổi đang chờ · {props.blockedCount} thay đổi cần xử lý
        </p>
        <p className="text-caption text-ink-muted">
          Lần đồng bộ thành công: {props.lastSuccessfulSync ?? "chưa có"}
        </p>
        {props.blockedCount > 0 ? (
          <p role="alert" className="mt-2 text-body-sm text-warning">
            Có intent offline bị chặn. Không tạo giao dịch thay thế trước khi xác định outcome.
          </p>
        ) : null}
        <Button className="mt-3" tone="secondary" onClick={props.onRetrySync}>
          Thử đồng bộ
        </Button>
      </section>

      <IntegrityPanel
        state={props.integrityState}
        integrity={props.integrity}
        onRetry={props.onRetryIntegrity}
      />

      <section className="rounded-card border border-border bg-surface p-4">
        <h2 className="text-subheading font-semibold">Sao lưu logic và phục hồi workspace</h2>
        <p className="text-body-sm">
          File này là bản xuất logic của dữ liệu ứng dụng để kiểm tra hoặc phục hồi vào một
          workspace trống. Đây không phải PITR hay quy trình phục hồi hạ tầng production.
        </p>
        {props.exportCompleted ? (
          <Button className="mt-3" tone="secondary" onClick={props.onResetExport}>
            Tạo bản sao lưu mới
          </Button>
        ) : (
          <Button className="mt-3" disabled={props.exportLocked} onClick={props.onExport}>
            {props.exportLocked ? "Đang xác định kết quả…" : "Xuất bản sao lưu"}
          </Button>
        )}
        {props.exportOutcome}

        <label className="mt-4 block text-label">
          Chọn file sao lưu để kiểm tra
          <Input
            type="file"
            accept="application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file !== undefined) props.onBackupFileSelected(file);
            }}
          />
        </label>
        {props.fileError === null ? null : <p role="alert">{props.fileError}</p>}
        {props.validationPending && props.backupSelected ? (
          <p role="status">Đang kiểm tra digest và compatibility…</p>
        ) : null}
        {props.validation !== null ? (
          <p role={props.validation.valid ? "status" : "alert"}>
            {props.validation.valid
              ? "File sao lưu hợp lệ và đúng vựa."
              : `Không hợp lệ: ${props.validation.diagnostics.join(", ")}`}
          </p>
        ) : null}

        {props.validation?.valid === true && props.backupSelected ? (
          <div className="mt-3 flex flex-col gap-2 rounded-card border border-warning/40 bg-warning-soft p-3">
            <p className="text-body-sm font-semibold">
              Chỉ tiếp tục nếu workspace đích trống và đây là recovery operation có chủ đích.
            </p>
            <label className="text-label">
              Lý do phục hồi
              <Input
                value={props.restoreReason}
                onChange={(event) => props.onRestoreReasonChange(event.target.value)}
              />
            </label>
            <Button
              tone="secondary"
              disabled={
                props.restoreReason.trim().length === 0 ||
                props.restoreLocked ||
                props.restoreCompleted
              }
              onClick={props.onRestore}
            >
              {props.restoreCompleted
                ? "Đã phục hồi"
                : props.restoreLocked
                  ? "Đang xác định kết quả…"
                  : "Phục hồi vào workspace trống"}
            </Button>
            {props.restoreOutcome}
          </div>
        ) : null}
        <p className="mt-3 text-caption text-ink-muted">
          Không gộp backup vào sổ đang hoạt động. PITR, encrypted daily backup, RPO/RTO và restore
          drill production được vận hành bằng runbook/provider evidence riêng.
        </p>
      </section>
    </div>
  );
}

function IntegrityPanel(props: {
  readonly state: "loading" | "ready" | "error";
  readonly integrity: WorkspaceIntegrityDto | null;
  readonly onRetry: () => void;
}) {
  if (props.state === "loading") {
    return (
      <section className="rounded-card border border-border bg-surface p-4">
        <h2 className="text-subheading font-semibold">Toàn vẹn sổ</h2>
        <p className="text-body-sm text-ink-muted">Đang đối chiếu nguồn và projection…</p>
      </section>
    );
  }
  if (props.state === "error" || props.integrity === null) {
    return (
      <section role="alert" className="rounded-card border border-danger/30 bg-surface p-4">
        <h2 className="text-subheading font-semibold">Không kiểm tra được toàn vẹn</h2>
        <p className="text-body-sm">Không được suy ra “ổn” từ việc checker không trả lời.</p>
        <Button className="mt-3" tone="secondary" onClick={props.onRetry}>
          Thử lại
        </Button>
      </section>
    );
  }
  const result = props.integrity;
  return (
    <section className="rounded-card border border-border bg-surface p-4">
      <div className="flex justify-between gap-3">
        <h2 className="text-subheading font-semibold">Toàn vẹn sổ</h2>
        <Badge tone={result.status === "healthy" ? "positive" : "warning"}>
          {result.status === "healthy" ? "Nhất quán" : "Cần kiểm tra"}
        </Badge>
      </div>
      <p>
        {result.healthyCustomers} tài khoản tốt · {result.anomalousCustomers} bất thường
      </p>
      <p className="text-caption text-ink-muted">
        Sai lệch projection: {result.projectionDrift} · thiếu nguồn: {result.missingSources} · nguồn
        lặp: {result.duplicateSources}.
      </p>
      <p className="text-caption text-ink-muted">
        Nhà cung cấp: {result.healthySuppliers} tốt, {result.anomalousSuppliers} bất thường · tồn
        kho bất thường: {result.anomalousInventoryKeys}.
      </p>
    </section>
  );
}
