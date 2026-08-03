"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createQualityIssueCodeCommandSchema,
  deactivateQualityIssueCodeCommandSchema,
  reactivateQualityIssueCodeCommandSchema,
  updateQualityIssueCodeCommandSchema,
  type QualityIssueCodeDto,
  type QualityIssueCodeId,
} from "@vuarau/domain-contracts";
import { useEffect, useRef, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import {
  EMPTY_QUALITY_ISSUE,
  type QualityIssueEditorState,
} from "@/ui/domain/quality-issue-form.ts";
import {
  QualityIssueEditorView,
  QualityIssueLifecycleView,
  QualityIssuesPermissionView,
  QualityIssuesView,
} from "@/ui/screens/quality-issues-view.tsx";

export function QualityIssuesController() {
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
    return <QualityIssuesPermissionView role={session.role} roles={session.roles} />;
  }

  return (
    <QualityIssuesView
      issues={issues}
      editor={
        <QualityIssueEditorController
          issue={selected}
          onChanged={() => {
            setSelected(null);
            refresh();
          }}
          onCancel={() => setSelected(null)}
        />
      }
      onRetry={refresh}
      onSelect={setSelected}
      lifecycle={(issue) => <QualityIssueLifecycleController issue={issue} onChanged={refresh} />}
    />
  );
}

function QualityIssueEditorController(props: {
  readonly issue: QualityIssueCodeDto | null;
  readonly onChanged: () => void;
  readonly onCancel: () => void;
}) {
  const trpc = useTRPC();
  const createMutation = useMutation(trpc.intake.createIssueCode.mutationOptions());
  const updateMutation = useMutation(trpc.intake.updateIssueCode.mutationOptions());
  const create = useContractCommand(
    createQualityIssueCodeCommandSchema,
    createMutation.mutateAsync,
  );
  const update = useContractCommand(
    updateQualityIssueCodeCommandSchema,
    updateMutation.mutateAsync,
  );
  const issueId = useRef(crypto.randomUUID() as QualityIssueCodeId);
  const [state, setState] = useState<QualityIssueEditorState>(() =>
    props.issue === null
      ? EMPTY_QUALITY_ISSUE
      : {
          code: props.issue.code,
          displayName: props.issue.displayName,
          category: props.issue.category,
          description: props.issue.description ?? "",
        },
  );
  const command = props.issue === null ? create : update;
  useEffect(() => {
    if (command.result !== null) props.onChanged();
  }, [command.result, props.onChanged]);
  return (
    <QualityIssueEditorView
      issue={props.issue}
      state={state}
      command={command}
      onChange={(patch) => setState((current) => ({ ...current, ...patch }))}
      onCancel={props.onCancel}
      onReload={props.onChanged}
      onSubmit={() => {
        const payload = {
          qualityIssueCodeId: props.issue?.id ?? issueId.current,
          code: state.code.trim(),
          displayName: state.displayName.trim(),
          category: state.category,
          description: state.description.trim() || null,
        };
        if (props.issue === null) void create.submit(payload);
        else void update.submit(payload, { expectedVersion: props.issue.version });
      }}
    />
  );
}

function QualityIssueLifecycleController(props: {
  readonly issue: QualityIssueCodeDto;
  readonly onChanged: () => void;
}) {
  const trpc = useTRPC();
  const deactivateMutation = useMutation(trpc.intake.deactivateIssueCode.mutationOptions());
  const reactivateMutation = useMutation(trpc.intake.reactivateIssueCode.mutationOptions());
  const deactivate = useContractCommand(
    deactivateQualityIssueCodeCommandSchema,
    deactivateMutation.mutateAsync,
  );
  const reactivate = useContractCommand(
    reactivateQualityIssueCodeCommandSchema,
    reactivateMutation.mutateAsync,
  );
  const command = props.issue.isActive ? deactivate : reactivate;
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (command.result !== null) props.onChanged();
  }, [command.result, props.onChanged]);
  return (
    <QualityIssueLifecycleView
      issue={props.issue}
      reason={reason}
      command={command}
      onReasonChange={setReason}
      onReload={props.onChanged}
      onSubmit={() =>
        void command.submit(
          { qualityIssueCodeId: props.issue.id, reason: reason.trim() },
          { expectedVersion: props.issue.version },
        )
      }
    />
  );
}
