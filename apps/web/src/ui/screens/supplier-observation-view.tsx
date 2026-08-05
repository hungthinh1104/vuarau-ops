"use client";

import type {
  CostObservationCaseKind,
  Page,
  SupplierObservationDto,
  SupplierObservationKind,
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

const KIND_COPY: Readonly<Record<SupplierObservationKind, string>> = {
  role: "Vai trò / quan hệ",
  product_supplied: "Mặt hàng cung ứng",
  source_area: "Vùng / nguồn hàng",
  pickup_responsibility: "Trách nhiệm lấy hàng",
  packing_responsibility: "Trách nhiệm đóng gói",
  transport_responsibility: "Trách nhiệm vận chuyển",
  expected_lead_time: "Thời gian cung ứng dự kiến",
  payment_arrangement: "Thỏa thuận thanh toán",
  traceability_level: "Mức truy xuất",
  promised_quantity: "Số lượng đã hứa",
  actual_quantity: "Số lượng thực tế",
  expected_arrival: "Thời điểm dự kiến",
  actual_arrival: "Thời điểm thực tế",
  accepted_quantity: "Số lượng được nhận",
  rejected_quantity: "Số lượng trả nhà cung cấp",
  claim: "Khiếu nại",
  price: "Giá được quan sát",
  other: "Quan sát khác",
};
const CASE_COPY: Readonly<Record<CostObservationCaseKind, string>> = {
  normal: "Thông thường",
  partial_or_exception: "Một phần / ngoại lệ",
  correction: "Điều chỉnh bản ghi trước",
};

export function SupplierObservationView(props: {
  readonly canRecord: boolean;
  readonly query: QueryLike<Page<SupplierObservationDto>>;
  readonly items: readonly SupplierObservationDto[];
  readonly supplierId: string;
  readonly productId: string;
  readonly qualityGradeId: string;
  readonly supplierOptions: readonly SelectOption[];
  readonly productOptions: readonly SelectOption[];
  readonly qualityGradeOptions: readonly SelectOption[];
  readonly kind: SupplierObservationKind;
  readonly caseKind: CostObservationCaseKind;
  readonly description: string;
  readonly participantWording: string;
  readonly role: string;
  readonly sourceArea: string;
  readonly pickupResponsibility: string;
  readonly packingResponsibility: string;
  readonly transportResponsibility: string;
  readonly leadTime: string;
  readonly paymentArrangement: string;
  readonly traceabilityLevel: string;
  readonly promisedQuantity: string;
  readonly actualQuantity: string;
  readonly acceptedQuantity: string;
  readonly rejectedQuantity: string;
  readonly unit: Unit;
  readonly expectedAt: string;
  readonly actualAt: string;
  readonly price: string;
  readonly claimReference: string;
  readonly evidenceReferences: string;
  readonly relatedObservationId: string;
  readonly formError: string | null;
  readonly command: CommandOutcomeView;
  readonly onKind: (value: string) => void;
  readonly onCaseKind: (value: CostObservationCaseKind) => void;
  readonly onDescription: (value: string) => void;
  readonly onParticipantWording: (value: string) => void;
  readonly onSupplierId: (value: string) => void;
  readonly onProductId: (value: string) => void;
  readonly onQualityGradeId: (value: string) => void;
  readonly onRole: (value: string) => void;
  readonly onSourceArea: (value: string) => void;
  readonly onPickupResponsibility: (value: string) => void;
  readonly onPackingResponsibility: (value: string) => void;
  readonly onTransportResponsibility: (value: string) => void;
  readonly onLeadTime: (value: string) => void;
  readonly onPaymentArrangement: (value: string) => void;
  readonly onTraceabilityLevel: (value: string) => void;
  readonly onPromisedQuantity: (value: string) => void;
  readonly onActualQuantity: (value: string) => void;
  readonly onAcceptedQuantity: (value: string) => void;
  readonly onRejectedQuantity: (value: string) => void;
  readonly onUnit: (value: Unit) => void;
  readonly onExpectedAt: (value: string) => void;
  readonly onActualAt: (value: string) => void;
  readonly onPrice: (value: string) => void;
  readonly onClaimReference: (value: string) => void;
  readonly onEvidenceReferences: (value: string) => void;
  readonly onRelatedObservationId: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onRetry: () => void;
}) {
  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Quan sát quan hệ nhà cung cấp"
        description="Ghi lại vai trò, trách nhiệm, nguồn hàng, thời gian, số lượng và chất lượng được nói hoặc quan sát. Bản ghi chưa tạo điểm nhà cung cấp, phải trả, tồn kho hay khuyến nghị mua."
        actions={
          <Link
            href="/evidence/supply"
            className="touch-target inline-flex min-h-11 items-center rounded-button border border-border px-4 text-label font-semibold text-ink"
          >
            Cam kết nguồn cung
          </Link>
        }
      />
      {props.canRecord ? <SupplierObservationForm {...props} /> : null}
      <section aria-labelledby="supplier-observation-history" className="grid gap-3">
        <div>
          <h2 id="supplier-observation-history" className="text-subheading font-semibold">
            Lịch sử quan sát
          </h2>
          <p className="text-caption text-ink-muted">
            Mỗi bản ghi được giữ nguyên; sửa sai bằng bản ghi mới có liên kết.
          </p>
        </div>
        <QueryStates
          query={props.query}
          loadingLabel="Đang tải quan sát nhà cung cấp"
          onRetry={props.onRetry}
        >
          {() =>
            props.items.length === 0 ? (
              <EmptyState
                title="Chưa có quan sát nhà cung cấp"
                description="Chỉ ghi điều đã được nói hoặc quan sát và đính kèm nguồn."
              />
            ) : (
              <ul className="grid gap-3">
                {props.items.map((item) => (
                  <SupplierObservationCard key={item.id} item={item} />
                ))}
              </ul>
            )
          }
        </QueryStates>
      </section>
    </div>
  );
}

function SupplierObservationForm(props: Parameters<typeof SupplierObservationView>[0]) {
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
        <Select
          label="Nhà cung cấp liên quan"
          value={props.supplierId}
          options={props.supplierOptions}
          placeholder="Không gắn hồ sơ"
          onChange={(event) => props.onSupplierId(event.target.value)}
        />
        <Select
          label="Mặt hàng liên quan"
          value={props.productId}
          options={props.productOptions}
          placeholder="Không gắn hồ sơ"
          onChange={(event) => props.onProductId(event.target.value)}
        />
        <Select
          label="Hạng hàng liên quan"
          value={props.qualityGradeId}
          options={props.qualityGradeOptions}
          placeholder="Không gắn hạng hàng"
          onChange={(event) => props.onQualityGradeId(event.target.value)}
        />
        <TextInput
          label="Vai trò / quan hệ"
          value={props.role}
          onChange={(event) => props.onRole(event.target.value)}
        />
        <TextInput
          label="Vùng / nguồn hàng"
          value={props.sourceArea}
          onChange={(event) => props.onSourceArea(event.target.value)}
        />
        <TextInput
          label="Trách nhiệm lấy hàng"
          value={props.pickupResponsibility}
          onChange={(event) => props.onPickupResponsibility(event.target.value)}
        />
        <TextInput
          label="Trách nhiệm đóng gói"
          value={props.packingResponsibility}
          onChange={(event) => props.onPackingResponsibility(event.target.value)}
        />
        <TextInput
          label="Trách nhiệm vận chuyển"
          value={props.transportResponsibility}
          onChange={(event) => props.onTransportResponsibility(event.target.value)}
        />
        <TextInput
          label="Thời gian cung ứng theo lời người tham gia"
          value={props.leadTime}
          onChange={(event) => props.onLeadTime(event.target.value)}
        />
        <TextInput
          label="Thỏa thuận thanh toán"
          value={props.paymentArrangement}
          onChange={(event) => props.onPaymentArrangement(event.target.value)}
        />
        <TextInput
          label="Mức truy xuất được nói tới"
          value={props.traceabilityLevel}
          onChange={(event) => props.onTraceabilityLevel(event.target.value)}
        />
        <TextInput
          label="Số lượng đã hứa"
          inputMode="decimal"
          value={props.promisedQuantity}
          onChange={(event) => props.onPromisedQuantity(event.target.value)}
        />
        <TextInput
          label="Số lượng thực tế"
          inputMode="decimal"
          value={props.actualQuantity}
          onChange={(event) => props.onActualQuantity(event.target.value)}
        />
        <TextInput
          label="Số lượng được nhận"
          inputMode="decimal"
          value={props.acceptedQuantity}
          onChange={(event) => props.onAcceptedQuantity(event.target.value)}
        />
        <TextInput
          label="Số lượng trả nhà cung cấp"
          inputMode="decimal"
          value={props.rejectedQuantity}
          onChange={(event) => props.onRejectedQuantity(event.target.value)}
        />
        <Select
          label="Đơn vị"
          value={props.unit}
          options={UNITS.map((value) => ({ value, label: UNIT_LABEL_VI[value] }))}
          onChange={(event) => props.onUnit(event.target.value as Unit)}
        />
        <TextInput
          label="Thời điểm dự kiến"
          type="datetime-local"
          value={props.expectedAt}
          onChange={(event) => props.onExpectedAt(event.target.value)}
        />
        <TextInput
          label="Thời điểm thực tế"
          type="datetime-local"
          value={props.actualAt}
          onChange={(event) => props.onActualAt(event.target.value)}
        />
        <TextInput
          label="Giá được quan sát (VND)"
          inputMode="numeric"
          value={props.price}
          onChange={(event) => props.onPrice(event.target.value)}
        />
        <TextInput
          label="Mã khiếu nại"
          value={props.claimReference}
          onChange={(event) => props.onClaimReference(event.target.value)}
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
        {locked ? "Đang xác định kết quả…" : "Lưu quan sát nhà cung cấp"}
      </Button>
      <CommandOutcome
        command={props.command}
        attemptedAction="Lưu quan sát nhà cung cấp"
        onReload={() => undefined}
      />
    </section>
  );
}

function SupplierObservationCard({ item }: { readonly item: SupplierObservationDto }) {
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
        {item.facts.role === null ? null : <span>Vai trò: {item.facts.role}</span>}
        {item.facts.sourceArea === null ? null : <span>Nguồn hàng: {item.facts.sourceArea}</span>}
        {item.facts.pickupResponsibility === null ? null : (
          <span>Trách nhiệm lấy: {item.facts.pickupResponsibility}</span>
        )}
        {item.facts.packingResponsibility === null ? null : (
          <span>Trách nhiệm đóng gói: {item.facts.packingResponsibility}</span>
        )}
        {item.facts.transportResponsibility === null ? null : (
          <span>Trách nhiệm vận chuyển: {item.facts.transportResponsibility}</span>
        )}
        {item.facts.promisedQuantity === null ? null : (
          <span>Đã hứa: {formatQuantity(item.facts.promisedQuantity)}</span>
        )}
        {item.facts.actualQuantity === null ? null : (
          <span>Thực tế: {formatQuantity(item.facts.actualQuantity)}</span>
        )}
        {item.facts.acceptedQuantity === null ? null : (
          <span>Được nhận: {formatQuantity(item.facts.acceptedQuantity)}</span>
        )}
        {item.facts.rejectedQuantity === null ? null : (
          <span>Trả nhà cung cấp: {formatQuantity(item.facts.rejectedQuantity)}</span>
        )}
        {item.facts.price === null ? null : (
          <span>Giá quan sát: {item.facts.price.amountMinor.toLocaleString("vi-VN")} VND</span>
        )}
        {item.facts.claimReference === null ? null : (
          <span>Khiếu nại: {item.facts.claimReference}</span>
        )}
      </div>
      <p className="mt-3 text-caption text-ink-muted">
        Chưa kết luận điểm xếp hạng, phải trả, tồn kho hoặc khuyến nghị.
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
