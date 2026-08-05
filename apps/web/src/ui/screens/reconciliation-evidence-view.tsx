import type {
  CostObservationCaseKind,
  Page,
  ReconciliationObservationDto,
  ReconciliationObservationKind,
  Unit,
} from "@vuarau/domain-contracts";
import Link from "next/link";
import { formatInstant, formatMoney, formatQuantity } from "@/ui/format.ts";
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

const KIND_COPY: Readonly<Record<ReconciliationObservationKind, string>> = {
  cash_count: "Đếm tiền thực tế",
  inventory_count: "Đếm hàng thực tế",
  order_outstanding: "Đơn còn lại",
  delivery_outstanding: "Giao hàng còn lại",
  return_outstanding: "Hàng trả còn lại",
  claim_outstanding: "Khiếu nại còn lại",
  packing_discrepancy: "Sai khác đóng gói được ghi nhận",
  bank_statement_match: "Đối chiếu sao kê được ghi nhận",
  other: "Quan sát đối soát khác",
};

const CASE_COPY: Readonly<Record<CostObservationCaseKind, string>> = {
  normal: "Thông thường",
  partial_or_exception: "Một phần / ngoại lệ",
  correction: "Điều chỉnh bản ghi trước",
};

export function ReconciliationEvidenceView(props: {
  readonly canRecord: boolean;
  readonly query: QueryLike<Page<ReconciliationObservationDto>>;
  readonly items: readonly ReconciliationObservationDto[];
  readonly kind: ReconciliationObservationKind;
  readonly caseKind: CostObservationCaseKind;
  readonly description: string;
  readonly participantWording: string;
  readonly expectedAmount: string;
  readonly observedAmount: string;
  readonly expectedQuantity: string;
  readonly observedQuantity: string;
  readonly unit: Unit;
  readonly itemCount: string;
  readonly scopeReference: string;
  readonly evidenceReferences: string;
  readonly relatedObservationId: string;
  readonly formError: string | null;
  readonly command: CommandOutcomeView;
  readonly onKind: (value: string) => void;
  readonly onCaseKind: (value: CostObservationCaseKind) => void;
  readonly onDescription: (value: string) => void;
  readonly onParticipantWording: (value: string) => void;
  readonly onExpectedAmount: (value: string) => void;
  readonly onObservedAmount: (value: string) => void;
  readonly onExpectedQuantity: (value: string) => void;
  readonly onObservedQuantity: (value: string) => void;
  readonly onUnit: (value: Unit) => void;
  readonly onItemCount: (value: string) => void;
  readonly onScopeReference: (value: string) => void;
  readonly onEvidenceReferences: (value: string) => void;
  readonly onRelatedObservationId: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onRetry: () => void;
}) {
  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Ghi nhận đối soát hiện trường"
        description="Lưu riêng số kỳ vọng và số quan sát được. Màn hình này chưa tự tính chênh lệch, chưa đóng sổ và không tự thay đổi tiền hay tồn kho."
        actions={
          <Link
            href="/evidence"
            className="touch-target inline-flex min-h-11 items-center rounded-button border border-border px-4 text-label font-semibold text-ink hover:border-border-strong"
          >
            Ảnh hoặc phiếu chi phí
          </Link>
        }
      />
      {props.canRecord ? <ObservationForm {...props} /> : null}
      <section aria-labelledby="reconciliation-history-title" className="grid gap-3">
        <div>
          <h2 id="reconciliation-history-title" className="text-subheading font-semibold">
            Lịch sử quan sát đối soát
          </h2>
          <p className="text-caption text-ink-muted">
            Mỗi bản ghi được giữ nguyên; sửa sai bằng một bản ghi điều chỉnh có liên kết.
          </p>
        </div>
        <QueryStates
          query={props.query}
          loadingLabel="Đang tải quan sát đối soát"
          onRetry={props.onRetry}
        >
          {() =>
            props.items.length === 0 ? (
              <EmptyState
                title="Chưa có quan sát đối soát"
                description="Ghi riêng điều kỳ vọng và điều thực tế nhìn thấy, luôn đính kèm nguồn tham chiếu."
              />
            ) : (
              <ul className="grid gap-3">
                {props.items.map((item) => (
                  <ObservationCard key={item.id} item={item} />
                ))}
              </ul>
            )
          }
        </QueryStates>
      </section>
    </div>
  );
}

function ObservationForm(props: Parameters<typeof ReconciliationEvidenceView>[0]) {
  const locked = props.command.phase.kind === "sending" || props.command.phase.kind === "unknown";
  return (
    <section className="grid gap-4 rounded-card border border-border bg-surface p-4">
      <h2 className="text-subheading font-semibold">Quan sát mới</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Loại đối soát"
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
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label="Số kỳ vọng (₫)"
          inputMode="numeric"
          value={props.expectedAmount}
          onChange={(event) => props.onExpectedAmount(event.target.value)}
        />
        <TextInput
          label="Số quan sát được (₫)"
          inputMode="numeric"
          value={props.observedAmount}
          onChange={(event) => props.onObservedAmount(event.target.value)}
        />
        <TextInput
          label="Lượng kỳ vọng"
          inputMode="decimal"
          value={props.expectedQuantity}
          onChange={(event) => props.onExpectedQuantity(event.target.value)}
        />
        <TextInput
          label="Lượng quan sát được"
          inputMode="decimal"
          value={props.observedQuantity}
          onChange={(event) => props.onObservedQuantity(event.target.value)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Đơn vị số lượng"
          value={props.unit}
          options={[
            { value: "kg", label: "kg" },
            { value: "gram", label: "gram" },
            { value: "lang", label: "lạng" },
            { value: "bo", label: "bó" },
            { value: "thung", label: "thùng" },
            { value: "ro", label: "rổ" },
            { value: "kien", label: "kiện" },
            { value: "cai", label: "cái" },
          ]}
          onChange={(event) => props.onUnit(event.target.value as Unit)}
        />
        <TextInput
          label="Số kiện / dòng đếm (tuỳ chọn)"
          inputMode="numeric"
          value={props.itemCount}
          onChange={(event) => props.onItemCount(event.target.value)}
        />
      </div>
      <TextInput
        label="Phạm vi / mã phiếu liên quan (tuỳ chọn)"
        value={props.scopeReference}
        onChange={(event) => props.onScopeReference(event.target.value)}
      />
      <Textarea
        label="Ảnh hoặc phiếu liên quan"
        required
        value={props.evidenceReferences}
        onChange={(event) => props.onEvidenceReferences(event.target.value)}
        hint="Mỗi dòng một ảnh, phiếu giấy hoặc liên kết đã được duyệt."
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
        {locked ? "Đang xác định kết quả…" : "Lưu quan sát đối soát"}
      </Button>
      <CommandOutcome
        command={props.command}
        attemptedAction="Lưu quan sát đối soát"
        onReload={() => undefined}
      />
    </section>
  );
}

function ObservationCard({ item }: { readonly item: ReconciliationObservationDto }) {
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
      <dl className="mt-3 grid gap-2 text-body-sm sm:grid-cols-2">
        <Fact
          label="Số kỳ vọng"
          value={item.facts.expectedAmount === null ? null : formatMoney(item.facts.expectedAmount)}
        />
        <Fact
          label="Số quan sát được"
          value={item.facts.observedAmount === null ? null : formatMoney(item.facts.observedAmount)}
        />
        <Fact
          label="Lượng kỳ vọng"
          value={
            item.facts.expectedQuantity === null
              ? null
              : formatQuantity(item.facts.expectedQuantity)
          }
        />
        <Fact
          label="Lượng quan sát được"
          value={
            item.facts.observedQuantity === null
              ? null
              : formatQuantity(item.facts.observedQuantity)
          }
        />
        <Fact
          label="Số kiện / dòng"
          value={item.facts.itemCount === null ? null : String(item.facts.itemCount)}
        />
        <Fact label="Phạm vi" value={item.facts.scopeReference} />
      </dl>
      <p className="mt-3 text-caption text-ink-muted">
        Chưa tính chênh lệch và chưa tạo tác động vào sổ tiền, công nợ hoặc tồn kho.
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

function Fact({ label, value }: { readonly label: string; readonly value: string | null }) {
  return (
    <div className="rounded-input border border-border-subtle bg-canvas px-3 py-2">
      <dt className="text-caption text-ink-muted">{label}</dt>
      <dd className="font-semibold">{value ?? "Chưa ghi"}</dd>
    </div>
  );
}
