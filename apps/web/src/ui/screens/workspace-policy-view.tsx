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
  return_claim_credit: "Đổi trả / ghi giảm",
  purchase_correction: "Sửa phần tiền sau khi nhập hàng",
  payment_terms_aging: "Điều khoản và tuổi nợ",
  payment_allocation: "Phân bổ thanh toán",
  credit_limit: "Hạn mức tín dụng",
  stock_planning_reorder: "Lập kế hoạch / nhập thêm",
  stocktake_variance: "Chênh lệch kiểm kê",
  supplier_evaluation: "Đánh giá nhà cung cấp",
  operating_cycle_reconciliation: "Đối soát chu kỳ vận hành",
  cash_custody_deposit: "Bàn giao / nộp tiền",
  management_intelligence: "Ảnh chụp vận hành",
};

const STATE_COPY: Readonly<Record<WorkspacePolicyDto["state"], string>> = {
  draft: "Bản nháp",
  approved: "Đã duyệt",
  retired: "Đã ngừng",
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
        attemptedAction="Xem quy định vận hành của vựa"
        error={{
          code: "PERMISSION_DENIED",
          message: "Bạn không có quyền xem phần quy định vận hành.",
          details: { permission: "policy.read" },
          retryable: false,
        }}
      />
    );
  }

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Quy định vận hành"
        description="Ghi nhận cách vựa xử lý tiền, hàng và báo cáo. Việc lưu quy định chưa tự thay đổi số liệu."
      />
      <section className="rounded-card border border-info/30 bg-info-soft px-4 py-4">
        <h2 className="text-subheading font-semibold">Ranh giới an toàn</h2>
        <p className="mt-1 text-body-sm text-ink-muted">
          Bản nháp và quy định chưa tới thời điểm hiệu lực chưa được dùng. Các phần chưa đủ dữ liệu
          sẽ báo rõ thay vì tự đoán.
        </p>
      </section>
      {props.canManage ? <PolicyDraftForm {...props} /> : null}
      <section aria-labelledby="policy-availability-title" className="grid gap-3">
        <div>
          <h2 id="policy-availability-title" className="text-subheading font-semibold">
            Khả năng áp dụng hiện tại
          </h2>
          <p className="text-caption text-ink-muted">
            Chưa sẵn sàng là trạng thái có chủ ý, không phải số 0.
          </p>
        </div>
        <QueryStates
          query={props.availability}
          loadingLabel="Đang tải trạng thái quy định"
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
            Lịch sử quy định
          </h2>
          <p className="text-caption text-ink-muted">
            Mỗi phiên bản đã lưu được giữ nguyên; thay đổi sẽ tạo phiên bản mới.
          </p>
        </div>
        <QueryStates
          query={props.policies}
          loadingLabel="Đang tải lịch sử quy định"
          onRetry={props.onRetry}
        >
          {(page) =>
            page.items.length === 0 ? (
              <EmptyState
                title="Chưa có quy định"
                description="Tạo bản nháp sau khi đã có thông tin từ vận hành thực tế."
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
                      Ảnh hoặc phiếu liên quan:{" "}
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
            attemptedAction="Tạo bản nháp quy định"
            onReload={props.onRetry}
          />
          <CommandOutcome
            command={props.approveCommand}
            attemptedAction="Duyệt quy định"
            onReload={props.onRetry}
          />
          <CommandOutcome
            command={props.retireCommand}
            attemptedAction="Ngừng quy định"
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
      setFormError("Thông số phải là nội dung hợp lệ.");
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
      setFormError("Thông số chưa đủ cho loại quy định đã chọn; kiểm tra các trường bắt buộc.");
      return;
    }
    props.onCreate(parsedPayload.data);
  }

  return (
    <section className="grid gap-4 rounded-card border border-border bg-surface p-4">
      <div>
        <h2 className="text-subheading font-semibold">Tạo bản nháp quy định</h2>
        <p className="mt-1 text-caption text-ink-muted">
          Chỉ lưu để xem lại; chưa làm thay đổi số liệu.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Select
          label="Loại quy định"
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
        label="Ảnh hoặc phiếu liên quan (mỗi dòng một mục)"
        value={evidence}
        onChange={(event) => setEvidence(event.target.value)}
        hint="Bản nháp có thể để trống; khi duyệt cần có thông tin liên quan."
      />
      <Textarea
        label="Thông số áp dụng"
        value={parameters}
        onChange={(event) => setParameters(event.target.value)}
        hint="Các thông số dùng để tính toán theo loại quy định đã chọn."
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
            label="Ảnh hoặc phiếu liên quan để duyệt"
            value={evidence}
            onChange={(event) => setEvidence(event.target.value)}
            hint="Mỗi dòng một mục; cần ít nhất một mục để duyệt."
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
                setError("Cần thông tin liên quan và lý do trước khi duyệt.");
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
                setError("Cần lý do khi ngừng quy định.");
                return;
              }
              props.onRetire({
                policyVersionId: props.policy.id,
                effectiveTo: effectiveTo === "" ? null : new Date(effectiveTo).toISOString(),
                reason: reason.trim(),
              });
            }}
          >
            Ngừng quy định
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
    return "Cách tính này chưa được hỗ trợ nên chưa thể áp dụng.";
  if (item.reason === "corrupt_definition")
    return "Thông tin quy định bị hỏng nên hệ thống tạm dừng áp dụng.";
  if (item.reason === "corrupt_overlap")
    return "Có nhiều phiên bản trùng thời gian; cần kiểm tra trước khi áp dụng.";
  if (item.reason === "effective_window_not_started")
    return "Đã duyệt nhưng chưa tới ngày bắt đầu.";
  if (item.reason === "effective_window_closed") return "Phiên bản đã hết thời gian áp dụng.";
  return "Chưa có phiên bản đã duyệt và đang áp dụng.";
}
