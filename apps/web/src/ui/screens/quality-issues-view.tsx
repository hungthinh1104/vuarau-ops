"use client";

import type { QualityIssueCodeDto } from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import type { QualityIssueEditorState } from "@/ui/domain/quality-issue-form.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { PermissionDenied } from "@/ui/patterns/feedback/permission-denied.tsx";
import { QueryStates, type QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { Input } from "@/ui/primitives/input.tsx";
import { Select } from "@/ui/primitives/select.tsx";
import { TextareaControl } from "@/ui/primitives/textarea-control.tsx";

export function QualityIssuesPermissionView(props: {
  readonly role: string;
  readonly roles: readonly string[];
}) {
  return (
    <PermissionDenied
      attemptedAction="Quản lý mã lỗi chất lượng"
      error={{
        code: "PERMISSION_DENIED",
        message: "Role set does not carry quality.issue.manage.",
        details: {
          permission: "quality.issue.manage",
          role: props.role,
          roles: props.roles,
        },
        retryable: false,
      }}
    />
  );
}

export function QualityIssuesView(props: {
  readonly issues: QueryLike<{ readonly items: readonly QualityIssueCodeDto[] }>;
  readonly editor: ReactNode;
  readonly onRetry: () => void;
  readonly onSelect: (issue: QualityIssueCodeDto) => void;
  readonly lifecycle: (issue: QualityIssueCodeDto) => ReactNode;
}) {
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Mã lỗi chất lượng"
        description="Chuẩn hóa cách ghi nhận tình trạng và lỗi; inspection giữ snapshot kể cả khi mã đổi tên."
      />
      {props.editor}
      <QueryStates
        query={props.issues}
        loadingLabel="Đang tải mã lỗi chất lượng"
        onRetry={props.onRetry}
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
                    <Button tone="secondary" onClick={() => props.onSelect(issue)}>
                      Sửa
                    </Button>
                    {props.lifecycle(issue)}
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

export function QualityIssueEditorView(props: {
  readonly issue: QualityIssueCodeDto | null;
  readonly state: QualityIssueEditorState;
  readonly command: CommandOutcomeView;
  readonly onChange: (patch: Partial<QualityIssueEditorState>) => void;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
  readonly onReload: () => void;
}) {
  const locked = props.command.phase.kind === "sending" || props.command.phase.kind === "unknown";
  const valid = props.state.code.trim().length > 0 && props.state.displayName.trim().length > 0;
  return (
    <section className="grid gap-3 rounded-card border border-border bg-surface p-4">
      <h2 className="text-subheading font-semibold">
        {props.issue === null ? "Tạo mã lỗi" : `Sửa ${props.issue.code}`}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2 text-label">
          Mã ngắn
          <Input
            value={props.state.code}
            onChange={(event) => props.onChange({ code: event.target.value })}
          />
        </label>
        <label className="grid gap-2 text-label">
          Tên hiển thị
          <Input
            value={props.state.displayName}
            onChange={(event) => props.onChange({ displayName: event.target.value })}
          />
        </label>
      </div>
      <Select
        label="Nhóm"
        options={[
          { value: "condition", label: "Tình trạng" },
          { value: "defect", label: "Lỗi" },
        ]}
        value={props.state.category}
        onChange={(event) =>
          props.onChange({ category: event.target.value as QualityIssueEditorState["category"] })
        }
      />
      <label className="grid gap-2 text-label">
        Mô tả
        <TextareaControl
          value={props.state.description}
          onChange={(event) => props.onChange({ description: event.target.value })}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button disabled={locked || !valid} onClick={props.onSubmit}>
          {locked ? "Đang lưu" : props.issue === null ? "Tạo mã lỗi" : "Lưu thay đổi"}
        </Button>
        {props.issue !== null ? (
          <Button tone="secondary" onClick={props.onCancel}>
            Hủy sửa
          </Button>
        ) : null}
      </div>
      <CommandOutcome
        command={props.command}
        attemptedAction={props.issue === null ? "Tạo mã lỗi chất lượng" : "Sửa mã lỗi chất lượng"}
        onReload={props.onReload}
      />
    </section>
  );
}

export function QualityIssueLifecycleView(props: {
  readonly issue: QualityIssueCodeDto;
  readonly reason: string;
  readonly command: CommandOutcomeView;
  readonly onReasonChange: (reason: string) => void;
  readonly onSubmit: () => void;
  readonly onReload: () => void;
}) {
  const locked = props.command.phase.kind === "sending" || props.command.phase.kind === "unknown";
  return (
    <details className="min-w-56">
      <summary className="touch-target cursor-pointer rounded-button border border-border px-3 text-label font-semibold">
        {props.issue.isActive ? "Ngừng dùng" : "Dùng lại"}
      </summary>
      <div className="mt-2 grid gap-2 rounded-card border border-border bg-canvas p-2">
        <Input
          value={props.reason}
          placeholder="Lý do thay đổi"
          onChange={(event) => props.onReasonChange(event.target.value)}
        />
        <Button
          tone={props.issue.isActive ? "danger" : "primary"}
          disabled={locked || props.reason.trim().length === 0}
          onClick={props.onSubmit}
        >
          {locked
            ? "Đang cập nhật"
            : props.issue.isActive
              ? "Xác nhận ngừng dùng"
              : "Xác nhận dùng lại"}
        </Button>
        <CommandOutcome
          command={props.command}
          attemptedAction={props.issue.isActive ? "Ngừng dùng mã lỗi" : "Dùng lại mã lỗi"}
          onReload={props.onReload}
        />
      </div>
    </details>
  );
}
