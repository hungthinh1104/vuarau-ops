"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  CreateQualityIssueCodeCommand,
  DeactivateQualityIssueCodeCommand,
  QualityIssueCodeDto,
  QualityIssueCodeId,
  ReactivateQualityIssueCodeCommand,
  UpdateQualityIssueCodeCommand,
} from "@vuarau/domain-contracts";
import { useEffect, useRef, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { useCommand } from "@/api/use-command.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { PermissionDenied } from "@/ui/patterns/feedback/permission-denied.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { INPUT_CLASS } from "@/ui/primitives/field.tsx";

type EditorState = {
  code: string;
  displayName: string;
  category: "condition" | "defect";
  description: string;
};

const EMPTY: EditorState = {
  code: "",
  displayName: "",
  category: "condition",
  description: "",
};

export default function QualityIssuesPage() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const issues = useQuery(
    trpc.intake.searchIssueCodes.queryOptions({
      workspaceId,
      query: "",
      isActive: null,
      cursor: null,
      limit: 200,
    }),
  );
  const [selected, setSelected] = useState<QualityIssueCodeDto | null>(null);
  const refresh = () => void issues.refetch();

  if (!session.permissions.includes("quality.issue.manage")) {
    return (
      <PermissionDenied
        attemptedAction="Quản lý mã lỗi chất lượng"
        error={{
          code: "PERMISSION_DENIED",
          message: "Role set does not carry quality.issue.manage.",
          details: {
            permission: "quality.issue.manage",
            role: session.role,
            roles: session.roles,
          },
          retryable: false,
        }}
      />
    );
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Mã lỗi chất lượng"
        description="Chuẩn hóa cách ghi nhận tình trạng và lỗi; inspection giữ snapshot kể cả khi mã đổi tên."
      />
      <IssueEditor
        key={selected?.id ?? "new"}
        issue={selected}
        onChanged={() => {
          setSelected(null);
          refresh();
        }}
        onCancel={() => setSelected(null)}
      />
      <QueryStates
        query={issues}
        loadingLabel="Đang tải mã lỗi chất lượng"
        onRetry={() => void issues.refetch()}
      >
        {(page) =>
          page.items.length === 0 ? (
            <section className="rounded-card border border-border bg-surface p-4 text-body-sm text-ink-muted">
              Chưa có mã lỗi. Tạo mã đầu tiên ở form phía trên.
            </section>
          ) : (
            <ul className="grid gap-3">
              {page.items.map((issue) => (
                <li
                  key={issue.id}
                  className="grid gap-3 rounded-card border border-border bg-surface p-4 sm:grid-cols-[1fr_auto]"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-label font-semibold">
                        {issue.code} · {issue.displayName}
                      </h2>
                      <Badge tone={issue.isActive ? "positive" : "neutral"}>
                        {issue.isActive ? "Đang dùng" : "Ngừng dùng"}
                      </Badge>
                      <Badge tone="neutral">
                        {issue.category === "condition" ? "Tình trạng" : "Lỗi"}
                      </Badge>
                    </div>
                    {issue.description ? (
                      <p className="mt-1 text-body-sm text-ink-muted">{issue.description}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button tone="secondary" onClick={() => setSelected(issue)}>
                      Sửa
                    </Button>
                    <IssueLifecycle issue={issue} onChanged={refresh} />
                  </div>
                </li>
              ))}
            </ul>
          )
        }
      </QueryStates>
    </div>
  );
}

function IssueEditor({
  issue,
  onChanged,
  onCancel,
}: {
  issue: QualityIssueCodeDto | null;
  onChanged: () => void;
  onCancel: () => void;
}) {
  const trpc = useTRPC();
  const createMutation = useMutation(trpc.intake.createIssueCode.mutationOptions());
  const updateMutation = useMutation(trpc.intake.updateIssueCode.mutationOptions());
  const create = useCommand<CreateQualityIssueCodeCommand["payload"], QualityIssueCodeDto>(
    (envelope) => createMutation.mutateAsync(envelope as never),
  );
  const update = useCommand<UpdateQualityIssueCodeCommand["payload"], QualityIssueCodeDto>(
    (envelope) => updateMutation.mutateAsync(envelope as never),
  );
  const issueId = useRef(crypto.randomUUID() as QualityIssueCodeId);
  const [state, setState] = useState<EditorState>(
    issue === null
      ? EMPTY
      : {
          code: issue.code,
          displayName: issue.displayName,
          category: issue.category,
          description: issue.description ?? "",
        },
  );
  const command = issue === null ? create : update;
  useEffect(() => {
    if (command.result !== null) onChanged();
  }, [command.result, onChanged]);
  const locked = command.phase.kind === "sending" || command.phase.kind === "unknown";
  const valid = state.code.trim().length > 0 && state.displayName.trim().length > 0;
  return (
    <section className="grid gap-3 rounded-card border border-border bg-surface p-4">
      <h2 className="text-subheading font-semibold">
        {issue === null ? "Tạo mã lỗi" : `Sửa ${issue.code}`}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2 text-label">
          Mã ngắn
          <input
            className={INPUT_CLASS}
            value={state.code}
            onChange={(event) => setState((current) => ({ ...current, code: event.target.value }))}
          />
        </label>
        <label className="grid gap-2 text-label">
          Tên hiển thị
          <input
            className={INPUT_CLASS}
            value={state.displayName}
            onChange={(event) =>
              setState((current) => ({ ...current, displayName: event.target.value }))
            }
          />
        </label>
      </div>
      <label className="grid gap-2 text-label">
        Nhóm
        <select
          className={INPUT_CLASS}
          value={state.category}
          onChange={(event) =>
            setState((current) => ({
              ...current,
              category: event.target.value as EditorState["category"],
            }))
          }
        >
          <option value="condition">Tình trạng</option>
          <option value="defect">Lỗi</option>
        </select>
      </label>
      <label className="grid gap-2 text-label">
        Mô tả
        <textarea
          className={INPUT_CLASS}
          value={state.description}
          onChange={(event) =>
            setState((current) => ({ ...current, description: event.target.value }))
          }
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={locked || !valid}
          onClick={() => {
            const payload = {
              qualityIssueCodeId: issue?.id ?? issueId.current,
              code: state.code.trim(),
              displayName: state.displayName.trim(),
              category: state.category,
              description: state.description.trim() || null,
            };
            if (issue === null) void create.submit(payload);
            else void update.submit(payload, { expectedVersion: issue.version });
          }}
        >
          {locked ? "Đang lưu" : issue === null ? "Tạo mã lỗi" : "Lưu thay đổi"}
        </Button>
        {issue !== null ? (
          <Button tone="secondary" onClick={onCancel}>
            Hủy sửa
          </Button>
        ) : null}
      </div>
      <CommandOutcome
        command={command}
        attemptedAction={issue === null ? "Tạo mã lỗi chất lượng" : "Sửa mã lỗi chất lượng"}
        onReload={onChanged}
      />
    </section>
  );
}

function IssueLifecycle({
  issue,
  onChanged,
}: {
  issue: QualityIssueCodeDto;
  onChanged: () => void;
}) {
  const trpc = useTRPC();
  const deactivateMutation = useMutation(trpc.intake.deactivateIssueCode.mutationOptions());
  const reactivateMutation = useMutation(trpc.intake.reactivateIssueCode.mutationOptions());
  const deactivate = useCommand<DeactivateQualityIssueCodeCommand["payload"], QualityIssueCodeDto>(
    (envelope) => deactivateMutation.mutateAsync(envelope as never),
  );
  const reactivate = useCommand<ReactivateQualityIssueCodeCommand["payload"], QualityIssueCodeDto>(
    (envelope) => reactivateMutation.mutateAsync(envelope as never),
  );
  const command = issue.isActive ? deactivate : reactivate;
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (command.result !== null) onChanged();
  }, [command.result, onChanged]);
  const locked = command.phase.kind === "sending" || command.phase.kind === "unknown";
  return (
    <details className="min-w-56">
      <summary className="touch-target cursor-pointer rounded-button border border-border px-3 text-label font-semibold">
        {issue.isActive ? "Ngừng dùng" : "Dùng lại"}
      </summary>
      <div className="mt-2 grid gap-2 rounded-button border border-border bg-canvas p-2">
        <input
          className={INPUT_CLASS}
          value={reason}
          placeholder="Lý do thay đổi"
          onChange={(event) => setReason(event.target.value)}
        />
        <Button
          tone={issue.isActive ? "danger" : "primary"}
          disabled={locked || reason.trim().length === 0}
          onClick={() =>
            void command.submit(
              {
                qualityIssueCodeId: issue.id,
                reason: reason.trim(),
              },
              { expectedVersion: issue.version },
            )
          }
        >
          {locked ? "Đang cập nhật" : issue.isActive ? "Xác nhận ngừng dùng" : "Xác nhận dùng lại"}
        </Button>
        <CommandOutcome
          command={command}
          attemptedAction={issue.isActive ? "Ngừng dùng mã lỗi" : "Dùng lại mã lỗi"}
          onReload={onChanged}
        />
      </div>
    </details>
  );
}
