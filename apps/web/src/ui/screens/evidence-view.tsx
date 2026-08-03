"use client";

import type {
  CostObservationCaseKind,
  CostObservationDto,
  CostObservationKind,
  Page,
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

const KIND_COPY: Readonly<Record<CostObservationKind, string>> = {
  purchase_price: "Giá mua được quan sát",
  accepted_quantity: "Số lượng nhận đạt",
  rejected_quantity: "Số lượng từ chối",
  packing_material: "Chi phí bao bì",
  labor_handling: "Chi phí công / xử lý",
  transport: "Chi phí vận chuyển",
  spoilage: "Hao hụt / hư hỏng",
  damage: "Hư hại",
  customer_return: "Hàng khách trả",
  supplier_claim: "Khiếu nại nhà cung cấp",
  supplier_credit: "Khoản ghi có nhà cung cấp",
  other: "Quan sát chi phí khác",
};

const CASE_COPY: Readonly<Record<CostObservationCaseKind, string>> = {
  normal: "Thông thường",
  partial_or_exception: "Một phần / ngoại lệ",
  correction: "Điều chỉnh bản ghi trước",
};

export function EvidenceView(props: {
  readonly canRecord: boolean;
  readonly query: QueryLike<Page<CostObservationDto>>;
  readonly items: readonly CostObservationDto[];
  readonly kind: CostObservationKind;
  readonly caseKind: CostObservationCaseKind;
  readonly description: string;
  readonly participantWording: string;
  readonly amount: string;
  readonly quantity: string;
  readonly unit: Unit;
  readonly sourceReference: string;
  readonly evidenceReferences: string;
  readonly relatedObservationId: string;
  readonly formError: string | null;
  readonly command: CommandOutcomeView;
  readonly onKind: (value: string) => void;
  readonly onCaseKind: (value: CostObservationCaseKind) => void;
  readonly onDescription: (value: string) => void;
  readonly onParticipantWording: (value: string) => void;
  readonly onAmount: (value: string) => void;
  readonly onQuantity: (value: string) => void;
  readonly onUnit: (value: Unit) => void;
  readonly onSourceReference: (value: string) => void;
  readonly onEvidenceReferences: (value: string) => void;
  readonly onRelatedObservationId: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onRetry: () => void;
}) {
  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Ghi nhận bằng chứng chi phí"
        description="Lưu quan sát nguồn cho chi phí, hao hụt và số lượng. Bản ghi này không tự tạo COGS, lợi nhuận, công nợ hay tồn kho."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/evidence/reconciliation"
              className="touch-target inline-flex min-h-11 items-center rounded-button border border-border px-4 text-label font-semibold text-ink hover:border-border-strong"
            >
              Đối soát hiện trường
            </Link>
            <Link
              href="/evidence/debt"
              className="touch-target inline-flex min-h-11 items-center rounded-button border border-border px-4 text-label font-semibold text-ink hover:border-border-strong"
            >
              Bằng chứng công nợ
            </Link>
          </div>
        }
      />
      {props.canRecord ? <ObservationForm {...props} /> : null}
      <section aria-labelledby="evidence-history-title" className="grid gap-3">
        <div>
          <h2 id="evidence-history-title" className="text-subheading font-semibold">
            Lịch sử quan sát nguồn
          </h2>
          <p className="text-caption text-ink-muted">
            Các bản ghi là append-only; sửa sai bằng một bản ghi điều chỉnh có liên kết.
          </p>
        </div>
        <QueryStates query={props.query} loadingLabel="Đang tải bằng chứng" onRetry={props.onRetry}>
          {() =>
            props.items.length === 0 ? (
              <EmptyState
                title="Chưa có quan sát"
                description="Chỉ ghi điều bạn quan sát được và luôn đính kèm nguồn tham chiếu."
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

function ObservationForm(props: Parameters<typeof EvidenceView>[0]) {
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
          label="Số tiền quan sát (₫)"
          inputMode="numeric"
          value={props.amount}
          onChange={(event) => props.onAmount(event.target.value)}
        />
        <TextInput
          label="Số lượng quan sát"
          inputMode="decimal"
          value={props.quantity}
          onChange={(event) => props.onQuantity(event.target.value)}
        />
        <Select
          label="Đơn vị"
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
      </div>
      <TextInput
        label="Tham chiếu nguồn nội bộ (tuỳ chọn)"
        value={props.sourceReference}
        onChange={(event) => props.onSourceReference(event.target.value)}
        hint="Mã phiếu hoặc liên kết canonical nếu có; không tự suy ra effect."
      />
      <Textarea
        label="Nguồn bằng chứng"
        required
        value={props.evidenceReferences}
        onChange={(event) => props.onEvidenceReferences(event.target.value)}
        hint="Mỗi dòng một ảnh, phiếu giấy, biên nhận hoặc link tới kho evidence được phê duyệt."
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
        {locked ? "Đang xác định kết quả…" : "Lưu quan sát nguồn"}
      </Button>
      <CommandOutcome
        command={props.command}
        attemptedAction="Lưu quan sát nguồn"
        onReload={() => undefined}
      />
    </section>
  );
}

function ObservationCard({ item }: { readonly item: CostObservationDto }) {
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
      <div className="mt-3 flex flex-wrap gap-3 text-body-sm">
        {item.facts.amount === null ? null : <span>{formatMoney(item.facts.amount)}</span>}
        {item.facts.quantity === null ? null : <span>{formatQuantity(item.facts.quantity)}</span>}
        {item.facts.sourceReference === null ? null : <code>{item.facts.sourceReference}</code>}
      </div>
      <SourceEvidenceList references={item.evidenceReferences} className="mt-3" />
      {item.relatedObservationId === null ? null : (
        <p className="mt-2 text-caption text-warning">
          Điều chỉnh quan sát: <code>{item.relatedObservationId}</code>
        </p>
      )}
    </li>
  );
}
