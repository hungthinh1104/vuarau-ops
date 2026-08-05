"use client";

import type {
  CostObservationCaseKind,
  Page,
  SupplyCommitmentObservationDto,
  SupplyCommitmentObservationKind,
  Unit,
} from "@vuarau/domain-contracts";
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
import { Select } from "@/ui/primitives/select.tsx";
import { TextInput } from "@/ui/primitives/text-input.tsx";
import { Textarea } from "@/ui/primitives/textarea.tsx";

const KIND_COPY: Readonly<Record<SupplyCommitmentObservationKind, string>> = {
  promised_supply: "Nguồn cung được hứa",
  expected_arrival: "Thời điểm dự kiến về",
  minimum_order: "Số lượng tối thiểu",
  availability_note: "Ghi chú khả năng cung ứng",
  other: "Quan sát nguồn cung khác",
};
const CASE_COPY: Readonly<Record<CostObservationCaseKind, string>> = {
  normal: "Thông thường",
  partial_or_exception: "Một phần / ngoại lệ",
  correction: "Điều chỉnh bản ghi trước",
};

export function SupplyCommitmentEvidenceView(props: {
  readonly canRecord: boolean;
  readonly query: QueryLike<Page<SupplyCommitmentObservationDto>>;
  readonly items: readonly SupplyCommitmentObservationDto[];
  readonly kind: SupplyCommitmentObservationKind;
  readonly caseKind: CostObservationCaseKind;
  readonly description: string;
  readonly participantWording: string;
  readonly counterpartyLabel: string;
  readonly promisedQuantity: string;
  readonly minimumOrder: string;
  readonly expectedArrivalAt: string;
  readonly unit: Unit;
  readonly commitmentReference: string;
  readonly evidenceReferences: string;
  readonly relatedObservationId: string;
  readonly formError: string | null;
  readonly command: CommandOutcomeView;
  readonly onKind: (value: string) => void;
  readonly onCaseKind: (value: CostObservationCaseKind) => void;
  readonly onDescription: (value: string) => void;
  readonly onParticipantWording: (value: string) => void;
  readonly onCounterpartyLabel: (value: string) => void;
  readonly onPromisedQuantity: (value: string) => void;
  readonly onMinimumOrder: (value: string) => void;
  readonly onExpectedArrivalAt: (value: string) => void;
  readonly onUnit: (value: Unit) => void;
  readonly onCommitmentReference: (value: string) => void;
  readonly onEvidenceReferences: (value: string) => void;
  readonly onRelatedObservationId: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onRetry: () => void;
}) {
  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Cam kết nguồn cung"
        description="Ghi lại lời hứa, khả năng có hàng và thời điểm dự kiến từ nhà cung cấp, nông hộ hoặc đầu mối. Bản ghi chưa tạo mua hàng, phải trả, tồn kho, đề xuất nhập thêm hay điểm nhà cung cấp."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/evidence"
              className="touch-target inline-flex min-h-11 items-center rounded-button border border-border px-4 text-label font-semibold text-ink hover:border-border-strong"
            >
              Chi phí / hao hụt
            </Link>
            <Link
              href="/evidence/reconciliation"
              className="touch-target inline-flex min-h-11 items-center rounded-button border border-border px-4 text-label font-semibold text-ink hover:border-border-strong"
            >
              Đối soát hiện trường
            </Link>
          </div>
        }
      />
      {props.canRecord ? <SupplyCommitmentForm {...props} /> : null}
      <section aria-labelledby="supply-commitment-history-title" className="grid gap-3">
        <div>
          <h2 id="supply-commitment-history-title" className="text-subheading font-semibold">
            Lịch sử quan sát nguồn cung
          </h2>
          <p className="text-caption text-ink-muted">
            Mỗi bản ghi được giữ nguyên; sửa sai bằng một bản ghi mới có liên kết tới quan sát
            trước.
          </p>
        </div>
        <QueryStates
          query={props.query}
          loadingLabel="Đang tải cam kết nguồn cung"
          onRetry={props.onRetry}
        >
          {() =>
            props.items.length === 0 ? (
              <EmptyState
                title="Chưa có quan sát nguồn cung"
                description="Chỉ ghi điều đã được nói hoặc quan sát và đính kèm nguồn tham chiếu."
              />
            ) : (
              <ul className="grid gap-3">
                {props.items.map((item) => (
                  <SupplyCommitmentCard key={item.id} item={item} />
                ))}
              </ul>
            )
          }
        </QueryStates>
      </section>
    </div>
  );
}

function SupplyCommitmentForm(props: Parameters<typeof SupplyCommitmentEvidenceView>[0]) {
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
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label="Tên nhà cung cấp / nông hộ / đầu mối"
          value={props.counterpartyLabel}
          onChange={(event) => props.onCounterpartyLabel(event.target.value)}
        />
        <TextInput
          label="Thời điểm dự kiến về"
          type="datetime-local"
          value={props.expectedArrivalAt}
          onChange={(event) => props.onExpectedArrivalAt(event.target.value)}
        />
        <TextInput
          label="Số lượng được hứa"
          inputMode="decimal"
          value={props.promisedQuantity}
          onChange={(event) => props.onPromisedQuantity(event.target.value)}
        />
        <TextInput
          label="Số lượng tối thiểu"
          inputMode="decimal"
          value={props.minimumOrder}
          onChange={(event) => props.onMinimumOrder(event.target.value)}
        />
        <Select
          label="Đơn vị"
          value={props.unit}
          options={["kg", "gram", "lang", "bo", "thung", "ro", "kien", "cai"].map((value) => ({
            value,
            label: value,
          }))}
          onChange={(event) => props.onUnit(event.target.value as Unit)}
        />
        <TextInput
          label="Mã / tham chiếu cam kết"
          value={props.commitmentReference}
          onChange={(event) => props.onCommitmentReference(event.target.value)}
        />
      </div>
      <Textarea
        label="Ảnh hoặc phiếu liên quan"
        required
        value={props.evidenceReferences}
        onChange={(event) => props.onEvidenceReferences(event.target.value)}
        hint="Mỗi dòng một ảnh, phiếu, tin nhắn hoặc liên kết đã được duyệt."
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
        {locked ? "Đang xác định kết quả…" : "Lưu quan sát nguồn cung"}
      </Button>
      <CommandOutcome
        command={props.command}
        attemptedAction="Lưu quan sát nguồn cung"
        onReload={() => undefined}
      />
    </section>
  );
}

function SupplyCommitmentCard({ item }: { readonly item: SupplyCommitmentObservationDto }) {
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
        {item.facts.promisedQuantity === null ? null : (
          <span>Số lượng hứa: {formatQuantity(item.facts.promisedQuantity)}</span>
        )}
        {item.facts.minimumOrder === null ? null : (
          <span>Tối thiểu: {formatQuantity(item.facts.minimumOrder)}</span>
        )}
        {item.facts.expectedArrivalAt === null ? null : (
          <span>Dự kiến về: {formatInstant(item.facts.expectedArrivalAt)}</span>
        )}
        {item.facts.commitmentReference === null ? null : (
          <span>Tham chiếu: {item.facts.commitmentReference}</span>
        )}
      </div>
      <p className="mt-3 text-caption text-ink-muted">
        Chưa kết luận phải trả, tồn kho, nhu cầu nhập thêm hoặc hiệu suất nhà cung cấp.
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
