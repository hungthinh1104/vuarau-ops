"use client";

import type {
  AccountReconciliationDiagnosticCode,
  AccountReconciliationEvidenceDto,
  AccountReconciliationResultDto,
  CustomerId,
} from "@vuarau/domain-contracts";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import { formatInstant, formatMoney, formatSignedMoney } from "@/ui/format.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { Textarea } from "@/ui/primitives/textarea.tsx";

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

export type AccountReconciliationViewProps = {
  readonly customerId: CustomerId;
  readonly query: QueryLike<AccountReconciliationResultDto>;
  readonly evidence: AccountReconciliationEvidenceDto | undefined;
  readonly evidenceFetching: boolean;
  readonly rebuild: CommandOutcomeView;
  readonly reason: string;
  readonly onReasonChange: (value: string) => void;
  readonly onRebuild: () => void;
  readonly onRetry: () => void;
  readonly onEvidence: () => void;
};

export function AccountReconciliationView(props: AccountReconciliationViewProps) {
  return (
    <div className="flex flex-col gap-6">
      <QueryStates
        query={props.query}
        loadingLabel="Đang đối soát công nợ"
        attemptedAction="Đối soát công nợ"
        onRetry={props.onRetry}
      >
        {(result) => <ReconciliationResult result={result} {...props} />}
      </QueryStates>

      <section className="flex flex-col gap-3">
        <Button tone="secondary" disabled={props.evidenceFetching} onClick={props.onEvidence}>
          {props.evidenceFetching ? "Đang tạo bằng chứng" : "Xuất bằng chứng JSON"}
        </Button>
        {props.evidence ? (
          <details open className="rounded-card border border-border p-4">
            <summary className="cursor-pointer font-semibold">Bằng chứng đối soát</summary>
            <section aria-label="Bằng chứng JSON" className="mt-3">
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-caption">
                {JSON.stringify(props.evidence, null, 2)}
              </pre>
            </section>
          </details>
        ) : null}
      </section>
    </div>
  );
}

function ReconciliationResult(
  props: AccountReconciliationViewProps & { readonly result: AccountReconciliationResultDto },
) {
  const { result } = props;
  if (result.kind === "not_found") {
    return <p className="text-body text-danger">Không tìm thấy khách hàng trong vựa này.</p>;
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
    <section className="flex flex-col gap-4">
      <PageHeader
        title="Giải thích công nợ"
        description={`${result.customer.displayName} · ${result.workspace.name}`}
        back={{ href: `/customers/${props.customerId}`, label: "Khách hàng" }}
      />

      <dl className="grid gap-3 rounded-card border border-border bg-surface p-4 md:grid-cols-2">
        <Summary label="Số dư đang hiển thị">
          {result.projection === null ? "Chưa có" : formatMoney(result.projection.balance)}
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
          <Textarea
            label="Lý do dựng lại bảng tổng hợp"
            value={props.reason}
            onChange={(event) => props.onReasonChange(event.target.value)}
          />
          <Button
            disabled={props.reason.trim().length === 0 || props.rebuild.phase.kind === "sending"}
            onClick={props.onRebuild}
          >
            {props.rebuild.phase.kind === "sending" ? "Đang dựng lại" : "Dựng lại số dư"}
          </Button>
          <CommandOutcome
            command={props.rebuild}
            attemptedAction="Dựng lại số dư từ sổ cái"
            onReload={props.onRetry}
          />
          {props.rebuild.phase.kind === "succeeded" ? (
            <Button tone="link" className="min-h-0 sm:min-h-0" onClick={props.onRetry}>
              Tải kết quả đối soát mới
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Summary({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
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
  readonly diagnostics: readonly AccountReconciliationDiagnosticCode[];
}) {
  return (
    <ul className="mt-2 list-disc pl-5 text-body-sm">
      {diagnostics.map((code, index) => (
        <li key={`${code}-${index}`}>{DIAGNOSTIC_COPY[code]}</li>
      ))}
    </ul>
  );
}
