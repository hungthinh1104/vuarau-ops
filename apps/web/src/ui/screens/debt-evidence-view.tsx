"use client";

import type {
  CostObservationCaseKind,
  DebtObservationDto,
  DebtObservationKind,
  Page,
} from "@vuarau/domain-contracts";
import Link from "next/link";
import { formatInstant, formatMoney } from "@/ui/format.ts";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { SourceEvidenceList } from "@/ui/patterns/evidence/source-evidence-list.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { EmptyState } from "@/ui/primitives/empty-state.tsx";
import { Select } from "@/ui/primitives/select.tsx";
import { TextInput } from "@/ui/primitives/text-input.tsx";
import { Textarea } from "@/ui/primitives/textarea.tsx";

const KIND_COPY: Readonly<Record<DebtObservationKind, string>> = {
  agreed_due_date: "Ngày hẹn thanh toán",
  payment_term: "Điều khoản thanh toán",
  promise_to_pay: "Cam kết thanh toán",
  collection_note: "Ghi chú thu hồi",
  payment_reference: "Tham chiếu thanh toán",
  allocation_proposal: "Đề xuất phân bổ",
  other: "Quan sát công nợ khác",
};
const CASE_COPY: Readonly<Record<CostObservationCaseKind, string>> = {
  normal: "Thông thường",
  partial_or_exception: "Một phần / ngoại lệ",
  correction: "Điều chỉnh bản ghi trước",
};

export function DebtEvidenceView(props: {
  readonly canRecord: boolean;
  readonly query: QueryLike<Page<DebtObservationDto>>;
  readonly items: readonly DebtObservationDto[];
  readonly kind: DebtObservationKind;
  readonly caseKind: CostObservationCaseKind;
  readonly description: string;
  readonly participantWording: string;
  readonly amount: string;
  readonly agreedDueAt: string;
  readonly promiseToPayAt: string;
  readonly termCode: string;
  readonly termText: string;
  readonly paymentReference: string;
  readonly allocationProposal: string;
  readonly evidenceReferences: string;
  readonly relatedObservationId: string;
  readonly formError: string | null;
  readonly command: CommandOutcomeView;
  readonly onKind: (value: string) => void;
  readonly onCaseKind: (value: CostObservationCaseKind) => void;
  readonly onDescription: (value: string) => void;
  readonly onParticipantWording: (value: string) => void;
  readonly onAmount: (value: string) => void;
  readonly onAgreedDueAt: (value: string) => void;
  readonly onPromiseToPayAt: (value: string) => void;
  readonly onTermCode: (value: string) => void;
  readonly onTermText: (value: string) => void;
  readonly onPaymentReference: (value: string) => void;
  readonly onAllocationProposal: (value: string) => void;
  readonly onEvidenceReferences: (value: string) => void;
  readonly onRelatedObservationId: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onRetry: () => void;
}) {
  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Bằng chứng công nợ"
        description="Lưu điều khoản, ngày hẹn và tham chiếu thu hồi từ hiện trường. Bản ghi không tự tạo overdue, phân bổ thanh toán hay thay đổi sổ công nợ."
        actions={
          <Link
            href="/evidence"
            className="touch-target inline-flex min-h-11 items-center rounded-button border border-border px-4 text-label font-semibold text-ink hover:border-border-strong"
          >
            Bằng chứng chi phí
          </Link>
        }
      />
      {props.canRecord ? <DebtObservationForm {...props} /> : null}
      <section aria-labelledby="debt-evidence-history-title" className="grid gap-3">
        <div>
          <h2 id="debt-evidence-history-title" className="text-subheading font-semibold">
            Lịch sử quan sát
          </h2>
          <p className="text-caption text-ink-muted">
            Quan sát là append-only; sửa sai bằng bản ghi điều chỉnh có liên kết.
          </p>
        </div>
        <QueryStates
          query={props.query}
          loadingLabel="Đang tải bằng chứng công nợ"
          onRetry={props.onRetry}
        >
          {() =>
            props.items.length === 0 ? (
              <EmptyState
                title="Chưa có quan sát"
                description="Chỉ ghi điều đã được nói hoặc nhìn thấy và luôn đính kèm nguồn."
              />
            ) : (
              <ul className="grid gap-3">
                {props.items.map((item) => (
                  <DebtObservationCard key={item.id} item={item} />
                ))}
              </ul>
            )
          }
        </QueryStates>
      </section>
    </div>
  );
}

function DebtObservationForm(props: Parameters<typeof DebtEvidenceView>[0]) {
  const locked = props.command.phase.kind === "sending" || props.command.phase.kind === "unknown";
  return (
    <section className="grid gap-4 rounded-card border border-border bg-surface p-4">
      <h2 className="text-subheading font-semibold">Quan sát mới</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Loại quan sát"
          value={props.kind}
          options={Object.entries(KIND_COPY).map(([value, label]) => ({ value, label }))}
          onChange={(event) => props.onKind(event.target.value)}
        />
        <Select
          label="Tình huống"
          value={props.caseKind}
          options={Object.entries(CASE_COPY).map(([value, label]) => ({ value, label }))}
          onChange={(event) => props.onCaseKind(event.target.value as CostObservationCaseKind)}
        />
      </div>
      <Textarea
        label="Mô tả điều đã quan sát"
        required
        value={props.description}
        onChange={(event) => props.onDescription(event.target.value)}
      />
      <Textarea
        label="Lời người tham gia / cách ghi tại hiện trường"
        required
        value={props.participantWording}
        onChange={(event) => props.onParticipantWording(event.target.value)}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextInput
          label="Số tiền liên quan (₫)"
          inputMode="numeric"
          value={props.amount}
          onChange={(event) => props.onAmount(event.target.value)}
        />
        <TextInput
          label="Ngày hẹn"
          type="datetime-local"
          value={props.agreedDueAt}
          onChange={(event) => props.onAgreedDueAt(event.target.value)}
        />
        <TextInput
          label="Ngày cam kết trả"
          type="datetime-local"
          value={props.promiseToPayAt}
          onChange={(event) => props.onPromiseToPayAt(event.target.value)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label="Mã điều khoản (tuỳ chọn)"
          value={props.termCode}
          onChange={(event) => props.onTermCode(event.target.value)}
        />
        <TextInput
          label="Diễn giải điều khoản (tuỳ chọn)"
          value={props.termText}
          onChange={(event) => props.onTermText(event.target.value)}
        />
        <TextInput
          label="Tham chiếu thanh toán (tuỳ chọn)"
          value={props.paymentReference}
          onChange={(event) => props.onPaymentReference(event.target.value)}
        />
        <TextInput
          label="Đề xuất phân bổ (tuỳ chọn)"
          value={props.allocationProposal}
          onChange={(event) => props.onAllocationProposal(event.target.value)}
          hint="Chỉ lưu đề xuất, không tự phân bổ vào ledger."
        />
      </div>
      <Textarea
        label="Nguồn bằng chứng"
        required
        value={props.evidenceReferences}
        onChange={(event) => props.onEvidenceReferences(event.target.value)}
        hint="Mỗi dòng một phiếu, ảnh, tin nhắn hoặc link tới kho evidence được phê duyệt."
      />
      {props.caseKind === "correction" ? (
        <TextInput
          label="ID quan sát cần điều chỉnh"
          required
          value={props.relatedObservationId}
          onChange={(event) => props.onRelatedObservationId(event.target.value)}
        />
      ) : null}
      {props.formError === null ? null : <p role="alert">{props.formError}</p>}
      <Button disabled={locked} onClick={props.onSubmit}>
        {locked ? "Đang xác định kết quả…" : "Lưu quan sát công nợ"}
      </Button>
      <CommandOutcome
        command={props.command}
        attemptedAction="Lưu quan sát công nợ"
        onReload={() => undefined}
      />
    </section>
  );
}

function DebtObservationCard({ item }: { readonly item: DebtObservationDto }) {
  return (
    <li className="rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{KIND_COPY[item.kind]}</h3>
          <p className="text-caption text-ink-muted">
            {CASE_COPY[item.caseKind]} · xảy ra {formatInstant(item.transactionTime)} · ghi{" "}
            {formatInstant(item.recordedAt)}
          </p>
        </div>
        <Badge tone={item.caseKind === "correction" ? "warning" : "info"}>
          {item.caseKind === "correction" ? "Bản điều chỉnh" : "Bản gốc"}
        </Badge>
      </div>
      <p className="mt-3">{item.description}</p>
      <p className="mt-1 text-body-sm text-ink-muted">“{item.participantWording}”</p>
      <div className="mt-3 grid gap-1 text-body-sm">
        {item.facts.amount === null ? null : (
          <span>Số tiền quan sát: {formatMoney(item.facts.amount)}</span>
        )}
        {item.facts.agreedDueAt === null ? null : (
          <span>Ngày hẹn: {formatInstant(item.facts.agreedDueAt)}</span>
        )}
        {item.facts.promiseToPayAt === null ? null : (
          <span>Cam kết trả: {formatInstant(item.facts.promiseToPayAt)}</span>
        )}
        {item.facts.termText === null ? null : <span>Điều khoản: {item.facts.termText}</span>}
        {item.facts.paymentReference === null ? null : (
          <span>Tham chiếu: {item.facts.paymentReference}</span>
        )}
        {item.facts.allocationProposal === null ? null : (
          <span>Đề xuất phân bổ: {item.facts.allocationProposal}</span>
        )}
      </div>
      <p className="mt-3 text-caption text-ink-muted">
        Chưa kết luận overdue hoặc thay đổi ledger.
      </p>
      <SourceEvidenceList references={item.evidenceReferences} className="mt-3" />
      {item.relatedObservationId === null ? null : (
        <p className="mt-2 text-caption text-warning">
          Điều chỉnh quan sát: <code>{item.relatedObservationId}</code>
        </p>
      )}
    </li>
  );
}
