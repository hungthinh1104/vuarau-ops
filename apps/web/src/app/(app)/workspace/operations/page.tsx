"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  WorkspaceBackup,
  WorkspaceBackupV3,
  WorkspaceRestoreResultDto,
} from "@vuarau/domain-contracts";
import { workspaceBackupSchema } from "@vuarau/domain-contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "../../../../api/session-gate.tsx";
import { useTRPC } from "../../../../api/providers.tsx";
import { useOffline } from "../../../../offline/provider.tsx";
import { QueryStates } from "../../../../ui/patterns/query-states.tsx";
import { Button } from "../../../../ui/primitives/button.tsx";
import { Badge } from "../../../../ui/primitives/badge.tsx";
import { useCommand } from "../../../../api/use-command.ts";
import { CommandOutcome } from "../../../../ui/patterns/command-outcome.tsx";
import { INPUT_CLASS } from "../../../../ui/primitives/field.tsx";

export default function OperationsPage() {
  const { workspaceId, session } = useSession();
  const offline = useOffline();
  const trpc = useTRPC();
  const [backup, setBackup] = useState<WorkspaceBackup | null>(null);
  const [restoreReason, setRestoreReason] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const integrity = useQuery(trpc.operations.integrity.queryOptions({ workspaceId }));
  const exportMutation = useMutation(trpc.operations.exportBackup.mutationOptions());
  const exportCommand = useCommand<Record<string, never>, WorkspaceBackupV3>((envelope) =>
    exportMutation.mutateAsync(envelope as never),
  );
  const validation = useQuery({
    ...trpc.operations.validateBackup.queryOptions({
      workspaceId,
      backup: backup as WorkspaceBackup,
    }),
    enabled: backup !== null,
  });
  const restoreMutation = useMutation(trpc.operations.restoreBackup.mutationOptions());
  const restore = useCommand<
    { backup: WorkspaceBackup; reason: string },
    WorkspaceRestoreResultDto
  >((envelope) => restoreMutation.mutateAsync(envelope as never));

  useEffect(() => {
    if (!exportCommand.result) return;
    const blob = new Blob([JSON.stringify(exportCommand.result, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `vuarau-backup-${workspaceId}-${exportCommand.result.digest.slice(0, 12)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [exportCommand.result, workspaceId]);

  if (!session.permissions.includes("workspace.manage")) {
    return <p role="alert">Chỉ chủ vựa được mở khu vực vận hành.</p>;
  }
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <h1 className="text-heading font-bold">Vận hành và bảo toàn dữ liệu</h1>
      <section className="rounded-card border border-border bg-surface p-4">
        <h2 className="text-subheading font-semibold">Đồng bộ thiết bị</h2>
        <p>
          {offline.queuedCount} lệnh đang chờ · {offline.blockedCount} lệnh cần xử lý
        </p>
        <p className="text-caption text-ink-muted">
          Lần đồng bộ thành công: {offline.lastSuccessfulSync ?? "chưa có"}
        </p>
        <Button tone="secondary" onClick={() => void offline.retry()}>
          Thử đồng bộ
        </Button>
      </section>
      <QueryStates
        query={integrity}
        loadingLabel="Đang kiểm tra toàn vẹn"
        onRetry={() => void integrity.refetch()}
      >
        {(result) => (
          <section className="rounded-card border border-border bg-surface p-4">
            <div className="flex justify-between">
              <h2 className="text-subheading font-semibold">Toàn vẹn sổ</h2>
              <Badge tone={result.status === "healthy" ? "positive" : "warning"}>
                {result.status === "healthy" ? "Nhất quán" : "Cần kiểm tra"}
              </Badge>
            </div>
            <p>
              {result.healthyCustomers} tài khoản tốt · {result.anomalousCustomers} bất thường
            </p>
            <p className="text-caption text-ink-muted">
              Projection drift {result.projectionDrift}; thiếu nguồn {result.missingSources}; trùng
              nguồn {result.duplicateSources}.
            </p>
            <p className="text-caption text-ink-muted">
              Nhà cung cấp: {result.healthySuppliers} tốt, {result.anomalousSuppliers} bất thường ·
              tồn kho bất thường: {result.anomalousInventoryKeys}.
            </p>
          </section>
        )}
      </QueryStates>
      <section className="rounded-card border border-border bg-surface p-4">
        <h2 className="text-subheading font-semibold">Bản sao lưu logic V2</h2>
        <p className="text-body-sm">
          File JSON có checksum SHA-256, dữ liệu canonical và lịch sử command để giữ retry-safe.
          Không chứa token, mật khẩu hay khoá Supabase.
        </p>
        <Button
          onClick={() => void exportCommand.submit({})}
          disabled={exportCommand.phase.kind === "sending"}
        >
          {exportCommand.phase.kind === "sending" ? "Đang tạo" : "Xuất bản sao lưu"}
        </Button>
        <CommandOutcome
          command={exportCommand}
          attemptedAction="Xuất bản sao lưu"
          onReload={() => undefined}
        />
        <label className="mt-3 block text-label">
          Kiểm tra file trước khi phục hồi
          <input
            type="file"
            accept="application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setFileError(null);
              void file.text().then((text) => {
                try {
                  const parsed = workspaceBackupSchema.safeParse(JSON.parse(text));
                  if (!parsed.success) {
                    setBackup(null);
                    setFileError("File không đúng định dạng WorkspaceBackup V1 hoặc V2.");
                    return;
                  }
                  setBackup(parsed.data);
                } catch {
                  setBackup(null);
                  setFileError("File không phải JSON hợp lệ.");
                }
              });
            }}
          />
        </label>
        {fileError === null ? null : <p role="alert">{fileError}</p>}
        {validation.data ? (
          <p role="status">
            {validation.data.valid
              ? "Checksum và workspace hợp lệ."
              : `Không hợp lệ: ${validation.data.diagnostics.join(", ")}`}
          </p>
        ) : null}
        {validation.data?.valid === true && backup !== null ? (
          <div className="mt-3 flex flex-col gap-2 rounded-card border border-warning/40 p-3">
            <label className="text-label">
              Lý do phục hồi
              <input
                className={INPUT_CLASS}
                value={restoreReason}
                onChange={(event) => setRestoreReason(event.target.value)}
              />
            </label>
            <Button
              tone="secondary"
              disabled={restoreReason.trim().length === 0 || restore.phase.kind === "sending"}
              onClick={() => void restore.submit({ backup, reason: restoreReason.trim() })}
            >
              Phục hồi vào vựa trống này
            </Button>
            <CommandOutcome
              command={restore}
              attemptedAction="Phục hồi bản sao lưu"
              onReload={() => void integrity.refetch()}
            />
          </div>
        ) : null}
        <p className="mt-3 text-caption text-ink-muted">
          Phục hồi logic chỉ được phép vào target trống và không phải database disaster recovery. Hạ
          tầng PITR/restore vật lý thuộc deployment provider; hệ thống không merge backup vào sổ
          đang hoạt động.
        </p>
      </section>
      <Link href="/workspace" className="text-info underline">
        ← Quản lý vựa
      </Link>
    </div>
  );
}
