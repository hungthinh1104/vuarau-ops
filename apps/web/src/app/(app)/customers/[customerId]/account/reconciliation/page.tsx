"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  AccountReconciliationDiagnosticCode,
  CustomerId,
  RebuildAccountProjectionResultDto,
} from "@vuarau/domain-contracts";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useCommand } from "@/api/use-command.ts";
import { useTRPC } from "@/api/providers.tsx";
import { formatInstant, formatMoney, formatSignedMoney } from "@/ui/format.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";

const DIAGNOSTIC_COPY: Readonly<Record<AccountReconciliationDiagnosticCode, string>> = {
  projection_missing: "Thiếu bảng tổng hợp số dư.",
  projection_balance_mismatch: "Số dư tổng hợp không khớp sổ cái.",
  projection_entry_count_mismatch: "Số dòng tổng hợp không khớp sổ cái.",
  projection_last_transaction_mismatch: "Mốc giao dịch cuối không khớp sổ cái.",
  ledger_currency_mismatch: "Sổ cái có nhiều loại tiền không hợp lệ.",
  ledger_zero_amount: "Sổ cái có dòng bằng 0.",
  duplicate_source_identity: "Một chứng từ nguồn tạo nhiều hiệu lực tài chính.",
  source_missing: "Không còn tìm thấy chứng từ nguồn.",
  source_workspace_mismatch: "Chứng từ nguồn thuộc vựa khác.",
  source_customer_mismatch: "Chứng từ nguồn thuộc khách khác.",
  source_amount_mismatch: "Số tiền sổ cái không khớp chứng từ nguồn.",
  malformed_source_reference: "Liên kết chứng từ nguồn không đầy đủ.",
};

export default function AccountReconciliationPage() {
  const { workspaceId } = useSession();
  const trpc = useTRPC();
  const customerId = useParams<{ customerId: string }>().customerId as CustomerId;
  const [reason, setReason] = useState("Dựng lại bảng tổng hợp sau đối soát");
  const reconciliation = useQuery(
    trpc.account.reconciliation.queryOptions({ workspaceId, customerId }),
  );
  const evidence = useQuery({
    ...trpc.account.reconciliationEvidence.queryOptions({ workspaceId, customerId }),
    enabled: false,
  });
  const rebuildMutation = useMutation(trpc.account.rebuildProjection.mutationOptions());
  const rebuild = useCommand<
    { customerId: CustomerId; reason: string },
    RebuildAccountProjectionResultDto
  >(
    (envelope) =>
      rebuildMutation.mutateAsync(envelope as never) as Promise<RebuildAccountProjectionResultDto>,
  );

  return (
    <div className="flex flex-col gap-6">
      <QueryStates
        query={reconciliation}
        loadingLabel="Đang đối soát công nợ"
        attemptedAction="Đối soát công nợ"
        onRetry={() => void reconciliation.refetch()}
      >
        {(result) => {
          if (result.kind === "not_found") {
            return (
              <p className="text-body text-danger">Không tìm thấy khách hàng trong vựa này.</p>
            );
          }
          if (result.kind === "integrity_failure") {
            return (
              <section className="rounded-card border border-danger/40 bg-danger/5 p-4">
                <h1 className="text-heading font-bold">Sổ công nợ bị lỗi toàn vẹn</h1>
                <DiagnosticList diagnostics={result.diagnostics.map((item) => item.code)} />
                <p className="mt-3 text-body-sm">
                  Hệ thống đã khóa dựng lại số dư để không che mất dữ liệu hỏng.
                </p>
              </section>
            );
          }

          return (
            <>
              <section className="flex flex-col gap-4">
                <PageHeader
                  title="Giải thích công nợ"
                  description={`${result.customer.displayName} · ${result.workspace.name}`}
                  back={{ href: `/customers/${customerId}`, label: "Khách hàng" }}
                />

                <dl className="grid gap-3 rounded-card border border-border bg-surface p-4 md:grid-cols-2">
                  <Summary label="Số dư đang hiển thị">
                    {result.projection === null
                      ? "Chưa có"
                      : formatMoney(result.projection.balance)}
                  </Summary>
                  <Summary label="Tính lại từ sổ cái">{formatMoney(result.ledger.balance)}</Summary>
                  <Summary label="Chênh lệch">{formatSignedMoney(result.difference)}</Summary>
                  <Summary label="Trạng thái">
                    {result.kind === "consistent" ? "Khớp" : "Có sai lệch"}
                  </Summary>
                  <Summary label="Số dòng sổ cái">{result.ledger.entryCount}</Summary>
                  <Summary label="Phân loại">{result.ledger.classification}</Summary>
                  <Summary label="Giao dịch mới nhất">
                    {result.ledger.latestTransactionTime === null
                      ? "Chưa có"
                      : formatInstant(result.ledger.latestTransactionTime)}
                  </Summary>
                  <Summary label="Ghi nhận mới nhất">
                    {result.ledger.latestRecordedAt === null
                      ? "Chưa có"
                      : formatInstant(result.ledger.latestRecordedAt)}
                  </Summary>
                </dl>

                {result.diagnostics.length > 0 ? (
                  <div className="rounded-card border border-warning/50 bg-warning/5 p-4">
                    <h2 className="text-subheading font-semibold">Chẩn đoán</h2>
                    <DiagnosticList diagnostics={result.diagnostics.map((item) => item.code)} />
                  </div>
                ) : null}

                {result.capabilities.rebuild.allowed && result.kind === "inconsistent" ? (
                  <div className="flex flex-col gap-3 rounded-card border border-border p-4">
                    <label className="text-label font-semibold" htmlFor="rebuild-reason">
                      Lý do dựng lại bảng tổng hợp
                    </label>
                    <textarea
                      id="rebuild-reason"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      className="rounded-button border border-border px-3 py-2"
                    />
                    <button
                      type="button"
                      disabled={reason.trim().length === 0 || rebuild.phase.kind === "sending"}
                      onClick={() => void rebuild.submit({ customerId, reason })}
                      className="touch-target rounded-button bg-leaf px-4 text-label font-semibold text-white disabled:opacity-50"
                    >
                      {rebuild.phase.kind === "sending" ? "Đang dựng lại" : "Dựng lại số dư"}
                    </button>
                    <CommandOutcome
                      command={rebuild}
                      attemptedAction="Dựng lại số dư từ sổ cái"
                      onReload={() => void reconciliation.refetch()}
                    />
                    {rebuild.phase.kind === "succeeded" ? (
                      <button
                        type="button"
                        className="text-info underline"
                        onClick={() => void reconciliation.refetch()}
                      >
                        Tải kết quả đối soát mới
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </section>
            </>
          );
        }}
      </QueryStates>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="touch-target rounded-button border border-border px-4 text-label"
            disabled={evidence.isFetching}
            onClick={() => void evidence.refetch()}
          >
            {evidence.isFetching ? "Đang tạo bằng chứng" : "Xuất bằng chứng JSON"}
          </button>
        </div>
        {evidence.data ? (
          <details className="rounded-card border border-border p-4">
            <summary className="cursor-pointer font-semibold">Bằng chứng đối soát</summary>
            <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-caption">
              {JSON.stringify(evidence.data, null, 2)}
            </pre>
          </details>
        ) : null}
      </section>
    </div>
  );
}

function Summary({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-caption text-ink-muted">{label}</dt>
      <dd className="tabular text-body font-semibold">{children}</dd>
    </div>
  );
}

function DiagnosticList({
  diagnostics,
}: {
  diagnostics: readonly AccountReconciliationDiagnosticCode[];
}) {
  return (
    <ul className="mt-2 list-disc pl-5 text-body-sm">
      {diagnostics.map((code, index) => (
        <li key={`${code}-${index}`}>{DIAGNOSTIC_COPY[code]}</li>
      ))}
    </ul>
  );
}
