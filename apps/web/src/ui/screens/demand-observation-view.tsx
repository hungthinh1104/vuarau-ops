"use client";

import type {
  CostObservationCaseKind,
  DemandObservationDto,
  DemandObservationKind,
  Page,
  Unit,
} from "@vuarau/domain-contracts";
import { UNIT_LABEL_VI, UNITS } from "@vuarau/domain-contracts";
import Link from "next/link";
import { formatInstant, formatQuantity } from "@/ui/format.ts";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { SourceEvidenceList } from "@/ui/patterns/evidence/source-evidence-list.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { EmptyState } from "@/ui/primitives/empty-state.tsx";
import { Select, type SelectOption } from "@/ui/primitives/select.tsx";
import { TextInput } from "@/ui/primitives/text-input.tsx";
import { Textarea } from "@/ui/primitives/textarea.tsx";

const KIND_COPY: Readonly<Record<DemandObservationKind, string>> = {
  requested_order: "Nhu cầu / đơn đặt dự kiến",
  expected_delivery: "Thời điểm cần giao",
  minimum_quantity: "Số lượng tối thiểu",
  availability_note: "Ghi chú khả năng bán",
  other: "Quan sát nhu cầu khác",
};
const CASE_COPY: Readonly<Record<CostObservationCaseKind, string>> = {
  normal: "Thông thường",
  partial_or_exception: "Một phần / ngoại lệ",
  correction: "Điều chỉnh bản ghi trước",
};

export function DemandObservationView(props: {
  readonly canRecord: boolean;
  readonly query: QueryLike<Page<DemandObservationDto>>;
  readonly items: readonly DemandObservationDto[];
  readonly customerId: string;
  readonly productId: string;
  readonly qualityGradeId: string;
  readonly customerOptions: readonly SelectOption[];
  readonly productOptions: readonly SelectOption[];
  readonly qualityGradeOptions: readonly SelectOption[];
  readonly kind: DemandObservationKind;
  readonly caseKind: CostObservationCaseKind;
  readonly description: string;
  readonly participantWording: string;
  readonly counterpartyLabel: string;
  readonly requestedQuantity: string;
  readonly minimumQuantity: string;
  readonly requestedForAt: string;
  readonly unit: Unit;
  readonly demandReference: string;
  readonly evidenceReferences: string;
  readonly relatedObservationId: string;
  readonly formError: string | null;
  readonly command: CommandOutcomeView;
  readonly onCustomerId: (value: string) => void;
  readonly onProductId: (value: string) => void;
  readonly onQualityGradeId: (value: string) => void;
  readonly onKind: (value: string) => void;
  readonly onCaseKind: (value: CostObservationCaseKind) => void;
  readonly onDescription: (value: string) => void;
  readonly onParticipantWording: (value: string) => void;
  readonly onCounterpartyLabel: (value: string) => void;
  readonly onRequestedQuantity: (value: string) => void;
  readonly onMinimumQuantity: (value: string) => void;
  readonly onRequestedForAt: (value: string) => void;
  readonly onUnit: (value: Unit) => void;
  readonly onDemandReference: (value: string) => void;
  readonly onEvidenceReferences: (value: string) => void;
  readonly onRelatedObservationId: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onRetry: () => void;
}) {
  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Nhu cầu và đơn đặt dự kiến"
        description="Ghi lại nhu cầu khách hàng trước khi chốt Sale. Bản ghi chưa tạo Sale, công nợ, tồn kho, forecast hay reorder recommendation."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/sales/new"
              className="touch-target inline-flex min-h-11 items-center rounded-button border border-border px-4 text-label font-semibold text-ink"
            >
              Tạo Sale
            </Link>
            <Link
              href="/evidence/supply"
              className="touch-target inline-flex min-h-11 items-center rounded-button border border-border px-4 text-label font-semibold text-ink"
            >
              Cam kết nguồn cung
            </Link>
          </div>
        }
      />
      {props.canRecord ? <DemandObservationForm {...props} /> : null}
      <section aria-labelledby="demand-observation-history" className="grid gap-3">
        <div>
          <h2 id="demand-observation-history" className="text-subheading font-semibold">
            Lịch sử nhu cầu
          </h2>
          <p className="text-caption text-ink-muted">
            Append-only; sửa sai bằng bản ghi mới có liên kết.
          </p>
        </div>
        <QueryStates query={props.query} loadingLabel="Đang tải nhu cầu" onRetry={props.onRetry}>
          {() =>
            props.items.length === 0 ? (
              <EmptyState
                title="Chưa có nhu cầu được ghi nhận"
                description="Chỉ ghi điều đã được nói hoặc quan sát và đính kèm nguồn."
              />
            ) : (
              <ul className="grid gap-3">
                {props.items.map((item) => (
                  <DemandObservationCard key={item.id} item={item} />
                ))}
              </ul>
            )
          }
        </QueryStates>
      </section>
    </div>
  );
}

function DemandObservationForm(props: Parameters<typeof DemandObservationView>[0]) {
  const locked = props.command.phase.kind === "sending" || props.command.phase.kind === "unknown";
  return (
    <section className="grid gap-4 rounded-card border border-border bg-surface p-4">
      <h2 className="text-subheading font-semibold">Nhu cầu mới</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Khách hàng liên quan"
          value={props.customerId}
          options={props.customerOptions}
          placeholder="Không gắn hồ sơ"
          onChange={(event) => props.onCustomerId(event.target.value)}
        />
        <Select
          label="Mặt hàng liên quan"
          value={props.productId}
          options={props.productOptions}
          placeholder="Không gắn hồ sơ"
          onChange={(event) => props.onProductId(event.target.value)}
        />
        <Select
          label="Phẩm cấp liên quan"
          value={props.qualityGradeId}
          options={props.qualityGradeOptions}
          placeholder="Không gắn phẩm cấp"
          onChange={(event) => props.onQualityGradeId(event.target.value)}
        />
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
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label="Tên khách / đầu mối nếu chưa có hồ sơ"
          value={props.counterpartyLabel}
          onChange={(event) => props.onCounterpartyLabel(event.target.value)}
        />
        <TextInput
          label="Thời điểm khách cần hàng"
          type="datetime-local"
          value={props.requestedForAt}
          onChange={(event) => props.onRequestedForAt(event.target.value)}
        />
        <TextInput
          label="Số lượng được hỏi / đặt"
          inputMode="decimal"
          value={props.requestedQuantity}
          onChange={(event) => props.onRequestedQuantity(event.target.value)}
        />
        <TextInput
          label="Số lượng tối thiểu"
          inputMode="decimal"
          value={props.minimumQuantity}
          onChange={(event) => props.onMinimumQuantity(event.target.value)}
        />
        <Select
          label="Đơn vị"
          value={props.unit}
          options={UNITS.map((value) => ({ value, label: UNIT_LABEL_VI[value] }))}
          onChange={(event) => props.onUnit(event.target.value as Unit)}
        />
        <TextInput
          label="Mã / tham chiếu nhu cầu"
          value={props.demandReference}
          onChange={(event) => props.onDemandReference(event.target.value)}
        />
      </div>
      <Textarea
        label="Nguồn bằng chứng"
        required
        value={props.evidenceReferences}
        onChange={(event) => props.onEvidenceReferences(event.target.value)}
        hint="Mỗi dòng một ảnh, phiếu, tin nhắn hoặc liên kết tới kho evidence được phê duyệt."
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
        {locked ? "Đang xác định kết quả…" : "Lưu quan sát nhu cầu"}
      </Button>
      <CommandOutcome
        command={props.command}
        attemptedAction="Lưu quan sát nhu cầu"
        onReload={() => undefined}
      />
    </section>
  );
}

function DemandObservationCard({ item }: { readonly item: DemandObservationDto }) {
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
        {item.facts.counterpartyLabel === null ? null : (
          <span>Đầu mối: {item.facts.counterpartyLabel}</span>
        )}
        {item.facts.requestedQuantity === null ? null : (
          <span>Nhu cầu: {formatQuantity(item.facts.requestedQuantity)}</span>
        )}
        {item.facts.minimumQuantity === null ? null : (
          <span>Tối thiểu: {formatQuantity(item.facts.minimumQuantity)}</span>
        )}
        {item.facts.requestedForAt === null ? null : (
          <span>Cần trước: {formatInstant(item.facts.requestedForAt)}</span>
        )}
        {item.facts.demandReference === null ? null : (
          <span>Tham chiếu: {item.facts.demandReference}</span>
        )}
      </div>
      <p className="mt-3 text-caption text-ink-muted">
        Chưa tạo Sale, công nợ, forecast, thiếu hàng hay reorder.
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
