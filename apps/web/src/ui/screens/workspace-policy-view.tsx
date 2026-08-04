"use client";

import type {
  ApproveWorkspacePolicyCommand,
  CreateWorkspacePolicyDraftCommand,
  RetireWorkspacePolicyCommand,
  SupportedWorkspacePolicyKind,
  WorkspacePolicyAvailability,
  WorkspacePolicyDto,
  WorkspacePolicyKind,
} from "@vuarau/domain-contracts";
import { supportedWorkspacePolicyVersionFieldsSchema } from "@vuarau/domain-contracts";
import { useState } from "react";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { PermissionDenied } from "@/ui/patterns/feedback/permission-denied.tsx";
import { QueryStates, type QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { Badge, type BadgeTone } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { EmptyState } from "@/ui/primitives/empty-state.tsx";
import { Select } from "@/ui/primitives/select.tsx";
import { TextInput } from "@/ui/primitives/text-input.tsx";
import { Textarea } from "@/ui/primitives/textarea.tsx";

const KIND_COPY: Readonly<Record<WorkspacePolicyKind, string>> = {
  receivable_payable_recognition: "Ghi nhận phải thu / phải trả",
  inventory_valuation: "Định giá tồn kho",
  cost_allocation: "Phân bổ chi phí",
  return_claim_credit: "Đổi trả / claim / credit",
  purchase_correction: "Sửa đơn mua sau receiving",
  payment_terms_aging: "Điều khoản và tuổi nợ",
  payment_allocation: "Phân bổ thanh toán",
  credit_limit: "Hạn mức tín dụng",
  stock_planning_reorder: "Lập kế hoạch / reorder",
  stocktake_variance: "Chênh lệch kiểm kê",
  supplier_evaluation: "Đánh giá nhà cung cấp",
  operating_cycle_reconciliation: "Đối soát chu kỳ vận hành",
  cash_custody_deposit: "Bàn giao / nộp tiền",
  management_intelligence: "Ảnh chụp vận hành",
};

const STATE_COPY: Readonly<Record<WorkspacePolicyDto["state"], string>> = {
  draft: "Bản nháp",
  approved: "Đã duyệt",
  retired: "Đã nghỉ",
};

const STATE_TONE: Readonly<Record<WorkspacePolicyDto["state"], BadgeTone>> = {
  draft: "warning",
  approved: "positive",
  retired: "neutral",
};

export type WorkspacePolicyViewProps =
  | { readonly permissionDenied: true }
  | {
      readonly permissionDenied?: false;
      readonly policies: QueryLike<{ readonly items: readonly WorkspacePolicyDto[] }>;
      readonly availability: QueryLike<readonly WorkspacePolicyAvailability[]>;
      readonly policyKinds: readonly SupportedWorkspacePolicyKind[];
      readonly canManage: boolean;
      readonly createCommand: CommandOutcomeView;
      readonly approveCommand: CommandOutcomeView;
      readonly retireCommand: CommandOutcomeView;
      readonly onCreate: (payload: CreateWorkspacePolicyDraftCommand["payload"]) => void;
      readonly onApprove: (payload: ApproveWorkspacePolicyCommand["payload"]) => void;
      readonly onRetire: (payload: RetireWorkspacePolicyCommand["payload"]) => void;
      readonly onRetry: () => void;
    };

export function WorkspacePolicyView(props: WorkspacePolicyViewProps) {
  if (props.permissionDenied) {
    return (
      <PermissionDenied
        attemptedAction="Xem chính sách của vựa"
        error={{
          code: "PERMISSION_DENIED",
          message: "Role set does not carry policy.read.",
          details: { permission: "policy.read" },
          retryable: false,
        }}
      />
    );
  }

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Chính sách theo vựa"
        description="Ghi nhận policy đang được xem xét cùng evidence. Chưa có policy nào tự làm thay đổi tiền, hàng hoặc báo cáo."
      />
      <section className="rounded-card border border-info/30 bg-info-soft px-4 py-4">
        <h2 className="text-subheading font-semibold">Ranh giới an toàn</h2>
        <p className="mt-1 text-body-sm text-ink-muted">
          Bản nháp và policy chưa tới thời điểm hiệu lực đều không được dùng làm mặc định. COGS,
          tuổi nợ, reorder, điểm nhà cung cấp và AI vẫn unavailable; ảnh chụp vận hành chỉ đọc các
          tổng số từ report nguồn đã có integrity.
        </p>
      </section>
      {props.canManage ? <PolicyDraftForm {...props} /> : null}
      <section aria-labelledby="policy-availability-title" className="grid gap-3">
        <div>
          <h2 id="policy-availability-title" className="text-subheading font-semibold">
            Khả năng áp dụng hiện tại
          </h2>
          <p className="text-caption text-ink-muted">
            Unavailable là trạng thái có chủ ý, không phải số 0.
          </p>
        </div>
        <QueryStates
          query={props.availability}
          loadingLabel="Đang tải trạng thái policy"
          onRetry={props.onRetry}
        >
          {(items) => (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <li
                  key={item.policyKind}
                  className="rounded-card border border-border bg-surface p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-label font-semibold">{KIND_COPY[item.policyKind]}</h3>
                    <Badge tone={item.availability === "available" ? "positive" : "warning"}>
                      {item.availability === "available" ? "Có thể áp dụng" : "Chưa đủ điều kiện"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-caption text-ink-muted">{availabilityCopy(item)}</p>
                </li>
              ))}
            </ul>
          )}
        </QueryStates>
      </section>
      <section aria-labelledby="policy-history-title" className="grid gap-3">
        <div>
          <h2 id="policy-history-title" className="text-subheading font-semibold">
            Lịch sử policy
          </h2>
          <p className="text-caption text-ink-muted">
            Version là bất biến; thay đổi tạo version hoặc state transition mới.
          </p>
        </div>
        <QueryStates
          query={props.policies}
          loadingLabel="Đang tải lịch sử policy"
          onRetry={props.onRetry}
        >
          {(page) =>
            page.items.length === 0 ? (
              <EmptyState
                title="Chưa có policy"
                description="Tạo bản nháp sau khi đã có evidence từ vận hành thực tế."
              />
            ) : (
              <ul className="grid gap-3">
                {page.items.map((policy) => (
                  <li key={policy.id} className="rounded-card border border-border bg-surface p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-label font-semibold">
                          {KIND_COPY[policy.policyKind]} · v{policy.version}
                        </h3>
                        <p className="mt-1 text-caption text-ink-muted">
                          Hiệu lực từ {policy.effectiveFrom.slice(0, 10)}
                          {policy.effectiveTo === null
                            ? " · không ngày kết thúc"
                            : ` đến ${policy.effectiveTo.slice(0, 10)}`}
                        </p>
                      </div>
                      <Badge tone={STATE_TONE[policy.state]}>{STATE_COPY[policy.state]}</Badge>
                    </div>
                    <p className="mt-2 text-body-sm">{policy.reason ?? "Không có ghi chú."}</p>
                    <p className="mt-1 text-caption text-ink-muted">
                      Evidence:{" "}
                      {policy.evidenceReferences.length === 0
                        ? "chưa có"
                        : policy.evidenceReferences.join(", ")}
                    </p>
                    {props.canManage ? (
                      <PolicyStateActions
                        policy={policy}
                        onApprove={props.onApprove}
                        onRetire={props.onRetire}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            )
          }
        </QueryStates>
      </section>
      {props.canManage ? (
        <div className="grid gap-2">
          <CommandOutcome
            command={props.createCommand}
            attemptedAction="Tạo bản nháp policy"
            onReload={props.onRetry}
          />
          <CommandOutcome
            command={props.approveCommand}
            attemptedAction="Duyệt policy"
            onReload={props.onRetry}
          />
          <CommandOutcome
            command={props.retireCommand}
            attemptedAction="Nghỉ policy"
            onReload={props.onRetry}
          />
        </div>
      ) : null}
    </div>
  );
}

function PolicyDraftForm(
  props: Extract<WorkspacePolicyViewProps, { readonly permissionDenied?: false }>,
) {
  const [kind, setKind] = useState<SupportedWorkspacePolicyKind>(
    props.policyKinds[0] ?? "payment_terms_aging",
  );
  const [version, setVersion] = useState("1");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 16));
  const [effectiveTo, setEffectiveTo] = useState("");
  const [evidence, setEvidence] = useState("");
  const [reason, setReason] = useState("");
  const [parameters, setParameters] = useState("{}");
  const [formError, setFormError] = useState<string | null>(null);

  function submit() {
    setFormError(null);
    const versionNumber = Number(version);
    if (!Number.isInteger(versionNumber) || versionNumber < 1 || reason.trim() === "") {
      setFormError("Cần nhập version hợp lệ và lý do.");
      return;
    }
    let parsedParameters: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(parameters);
      if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") throw new Error();
      parsedParameters = parsed as Record<string, unknown>;
    } catch {
      setFormError("Parameters phải là JSON object hợp lệ.");
      return;
    }
    const candidate = {
      policyVersionId:
        crypto.randomUUID() as CreateWorkspacePolicyDraftCommand["payload"]["policyVersionId"],
      policyKind: kind,
      version: versionNumber,
      effectiveFrom: new Date(effectiveFrom).toISOString(),
      effectiveTo: effectiveTo === "" ? null : new Date(effectiveTo).toISOString(),
      definition: { contractVersion: 1, parameters: parsedParameters },
      evidenceReferences: evidence
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean),
      reason: reason.trim(),
    };
    const parsedPayload = supportedWorkspacePolicyVersionFieldsSchema.safeParse(candidate);
    if (!parsedPayload.success) {
      setFormError(
        "Parameters không đúng contract của loại policy đã chọn; kiểm tra các trường bắt buộc.",
      );
      return;
    }
    props.onCreate(parsedPayload.data);
  }

  return (
    <section className="grid gap-4 rounded-card border border-border bg-surface p-4">
      <div>
        <h2 className="text-subheading font-semibold">Tạo bản nháp policy</h2>
        <p className="mt-1 text-caption text-ink-muted">
          Chỉ lưu cấu hình để review; chưa kích hoạt business effect.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Select
          label="Loại policy"
          value={kind}
          options={props.policyKinds.map((value) => ({ value, label: KIND_COPY[value] }))}
          onChange={(event) => setKind(event.target.value as SupportedWorkspacePolicyKind)}
        />
        <TextInput
          label="Version"
          type="number"
          min={1}
          value={version}
          onChange={(event) => setVersion(event.target.value)}
        />
        <TextInput
          label="Hiệu lực từ"
          type="datetime-local"
          value={effectiveFrom}
          onChange={(event) => setEffectiveFrom(event.target.value)}
        />
        <TextInput
          label="Hiệu lực đến (tuỳ chọn)"
          type="datetime-local"
          value={effectiveTo}
          onChange={(event) => setEffectiveTo(event.target.value)}
        />
      </div>
      <Textarea
        label="Evidence references (mỗi dòng một reference)"
        value={evidence}
        onChange={(event) => setEvidence(event.target.value)}
        hint="Bản nháp có thể để trống; approval bắt buộc phải có evidence."
      />
      <Textarea
        label="Parameters JSON"
        value={parameters}
        onChange={(event) => setParameters(event.target.value)}
        hint="Infrastructure envelope; chưa có policy adapter nào đọc nó."
      />
      <TextInput
        label="Lý do"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        required
      />
      {formError ? <p className="text-caption text-danger">{formError}</p> : null}
      <Button onClick={submit} disabled={props.createCommand.phase.kind === "sending"}>
        Lưu bản nháp
      </Button>
    </section>
  );
}

function PolicyStateActions(props: {
  readonly policy: WorkspacePolicyDto;
  readonly onApprove: (payload: ApproveWorkspacePolicyCommand["payload"]) => void;
  readonly onRetire: (payload: RetireWorkspacePolicyCommand["payload"]) => void;
}) {
  const [evidence, setEvidence] = useState("");
  const [reason, setReason] = useState("");
  const [effectiveTo, setEffectiveTo] = useState(props.policy.effectiveTo?.slice(0, 16) ?? "");
  const [error, setError] = useState<string | null>(null);
  const canApprove = props.policy.state === "draft";
  const canRetire = props.policy.state !== "retired";
  return (
    <div className="mt-4 grid gap-3 border-t border-border pt-3">
      {canApprove ? (
        <>
          <Textarea
            label="Evidence để duyệt"
            value={evidence}
            onChange={(event) => setEvidence(event.target.value)}
            hint="Mỗi dòng một reference; duyệt policy không có evidence sẽ bị từ chối."
          />
          <TextInput
            label="Lý do duyệt"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <Button
            onClick={() => {
              const evidenceReferences = evidence
                .split("\n")
                .map((value) => value.trim())
                .filter(Boolean);
              if (evidenceReferences.length === 0 || reason.trim() === "") {
                setError("Cần evidence và lý do trước khi duyệt.");
                return;
              }
              setError(null);
              props.onApprove({
                policyVersionId: props.policy.id,
                evidenceReferences,
                reason: reason.trim(),
              });
            }}
          >
            Duyệt bản nháp
          </Button>
        </>
      ) : null}
      {canRetire ? (
        <>
          <TextInput
            label="Kết thúc hiệu lực kinh doanh (tuỳ chọn)"
            type="datetime-local"
            value={effectiveTo}
            onChange={(event) => setEffectiveTo(event.target.value)}
          />
          <Button
            tone="danger"
            onClick={() => {
              if (reason.trim() === "") {
                setError("Cần lý do khi đưa policy về nghỉ.");
                return;
              }
              props.onRetire({
                policyVersionId: props.policy.id,
                effectiveTo: effectiveTo === "" ? null : new Date(effectiveTo).toISOString(),
                reason: reason.trim(),
              });
            }}
          >
            Đưa về nghỉ
          </Button>
        </>
      ) : null}
      {error ? <p className="text-caption text-danger">{error}</p> : null}
    </div>
  );
}

function availabilityCopy(item: WorkspacePolicyAvailability): string {
  if (item.availability === "available")
    return `Version ${item.version ?? "?"} đang trong thời gian hiệu lực.`;
  if (item.reason === "unsupported_definition_contract")
    return "Capability này chưa có typed definition contract và không thể áp dụng.";
  if (item.reason === "corrupt_definition")
    return "Definition lưu trong policy bị hỏng; hệ thống fail-closed.";
  if (item.reason === "corrupt_overlap")
    return "Có nhiều version chồng thời gian; cần sửa dữ liệu trước khi áp dụng.";
  if (item.reason === "effective_window_not_started")
    return "Đã duyệt nhưng chưa tới ngày hiệu lực.";
  if (item.reason === "effective_window_closed") return "Version đã qua thời gian hiệu lực.";
  return "Chưa có version đã duyệt và đang hiệu lực.";
}
