"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  ActorId,
  WorkspaceMemberDto,
  WorkspaceMembershipDto,
  WorkspaceRole,
} from "@vuarau/domain-contracts";
import { WORKSPACE_ROLES, actorIdSchema } from "@vuarau/domain-contracts";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { useCommand } from "@/api/use-command.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { PermissionDenied } from "@/ui/patterns/feedback/permission-denied.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";

export default function WorkspacePage() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const workspace = useQuery(trpc.session.workspace.queryOptions({ workspaceId }));
  const refresh = useCallback(() => {
    void workspace.refetch();
  }, [workspace.refetch]);

  if (!session.permissions.includes("workspace.manage")) {
    return (
      <PermissionDenied
        attemptedAction="Quản lý thành viên"
        error={{
          code: "PERMISSION_DENIED",
          message: "Role does not carry workspace.manage.",
          details: { permission: "workspace.manage", role: session.role },
          retryable: false,
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <QueryStates
        query={workspace}
        loadingLabel="Đang tải thành viên"
        attemptedAction="Quản lý thành viên"
        onRetry={() => void workspace.refetch()}
      >
        {(detail) => (
          <>
            <PageHeader title={detail.name} description="Thành viên và vai trò" />

            <AddMemberForm onChanged={refresh} />

            <ul className="flex flex-col gap-3">
              {detail.members.map((member) => (
                <li key={member.actorId}>
                  <MemberRow member={member} onChanged={refresh} />
                </li>
              ))}
            </ul>
          </>
        )}
      </QueryStates>
      <Link href="/workspace/operations" className="text-info underline">
        Vận hành, kiểm tra và sao lưu →
      </Link>
    </div>
  );
}

function AddMemberForm({ onChanged }: { onChanged: () => void }) {
  const trpc = useTRPC();
  const [actorText, setActorText] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("sales");
  const [reason, setReason] = useState("Thêm thành viên vào vựa");
  const mutation = useMutation(trpc.session.addMember.mutationOptions());
  const command = useCommand<
    { actorId: ActorId; role: WorkspaceRole; reason: string },
    WorkspaceMembershipDto
  >((envelope) => mutation.mutateAsync(envelope as never) as Promise<WorkspaceMembershipDto>);

  useEffect(() => {
    if (command.phase.kind !== "succeeded") return;
    onChanged();
  }, [command.phase.kind, onChanged]);

  const actor = actorIdSchema.safeParse(actorText.trim());
  return (
    <section className="flex flex-col gap-3 rounded-card border border-border p-4">
      <h2 className="text-subheading font-semibold">Thêm tài khoản đã có</h2>
      <label className="text-label">
        Mã tài khoản
        <input
          value={actorText}
          onChange={(event) => setActorText(event.target.value)}
          placeholder="UUID tài khoản"
          className="mt-1 w-full rounded-button border border-border px-3 py-2"
        />
      </label>
      <RoleSelect value={role} onChange={setRole} />
      <label className="text-label">
        Lý do
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="mt-1 w-full rounded-button border border-border px-3 py-2"
        />
      </label>
      <button
        type="button"
        disabled={!actor.success || reason.trim().length === 0 || command.phase.kind === "sending"}
        onClick={() => {
          if (actor.success) void command.submit({ actorId: actor.data, role, reason });
        }}
        className="touch-target rounded-button bg-leaf px-4 text-label font-semibold text-white disabled:opacity-50"
      >
        Thêm thành viên
      </button>
      <CommandOutcome command={command} attemptedAction="Thêm thành viên" onReload={onChanged} />
    </section>
  );
}

function MemberRow({ member, onChanged }: { member: WorkspaceMemberDto; onChanged: () => void }) {
  const { session } = useSession();
  const trpc = useTRPC();
  const [role, setRole] = useState<WorkspaceRole>(member.role);
  const roleMutation = useMutation(trpc.session.changeMemberRole.mutationOptions());
  const revokeMutation = useMutation(trpc.session.revokeMembership.mutationOptions());
  const reactivateMutation = useMutation(trpc.session.reactivateMember.mutationOptions());
  const roleCommand = useCommand<
    { actorId: ActorId; expectedRole: WorkspaceRole; role: WorkspaceRole; reason: string },
    WorkspaceMembershipDto
  >((envelope) => roleMutation.mutateAsync(envelope as never) as Promise<WorkspaceMembershipDto>);
  const revokeCommand = useCommand<
    { actorId: ActorId; reason: string | null },
    WorkspaceMembershipDto
  >((envelope) => revokeMutation.mutateAsync(envelope as never) as Promise<WorkspaceMembershipDto>);
  const reactivateCommand = useCommand<
    { actorId: ActorId; reason: string },
    WorkspaceMembershipDto
  >(
    (envelope) =>
      reactivateMutation.mutateAsync(envelope as never) as Promise<WorkspaceMembershipDto>,
  );

  useEffect(() => {
    if (
      roleCommand.phase.kind === "succeeded" ||
      revokeCommand.phase.kind === "succeeded" ||
      reactivateCommand.phase.kind === "succeeded"
    )
      onChanged();
  }, [onChanged, reactivateCommand.phase.kind, revokeCommand.phase.kind, roleCommand.phase.kind]);

  return (
    <article className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-body font-semibold">{member.displayName}</h2>
          <p className="text-caption text-ink-muted">{member.actorId}</p>
        </div>
        <Badge tone={member.isActive ? "positive" : "neutral"}>
          {member.isActive ? "Đang hoạt động" : "Đã thu hồi"}
        </Badge>
      </div>

      {member.isActive ? (
        <div className="flex flex-wrap items-end gap-2">
          <RoleSelect
            value={role}
            onChange={setRole}
            disabled={member.actorId === session.actorId}
          />
          <button
            type="button"
            disabled={
              role === member.role ||
              member.actorId === session.actorId ||
              roleCommand.phase.kind === "sending"
            }
            onClick={() =>
              void roleCommand.submit({
                actorId: member.actorId,
                expectedRole: member.role,
                role,
                reason: "Cập nhật phân công",
              })
            }
            className="touch-target rounded-button border border-border px-3 text-label disabled:opacity-50"
          >
            Đổi vai trò
          </button>
          <button
            type="button"
            disabled={revokeCommand.phase.kind === "sending"}
            onClick={() =>
              void revokeCommand.submit({
                actorId: member.actorId,
                reason: "Ngưng quyền truy cập",
              })
            }
            className="touch-target rounded-button border border-danger px-3 text-label text-danger"
          >
            Thu hồi
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={reactivateCommand.phase.kind === "sending"}
          onClick={() =>
            void reactivateCommand.submit({
              actorId: member.actorId,
              reason: "Khôi phục quyền truy cập",
            })
          }
          className="touch-target rounded-button border border-border px-3 text-label"
        >
          Kích hoạt lại
        </button>
      )}

      <CommandOutcome
        command={roleCommand}
        attemptedAction="Đổi vai trò thành viên"
        onReload={onChanged}
      />
      <CommandOutcome
        command={revokeCommand}
        attemptedAction="Thu hồi quyền thành viên"
        onReload={onChanged}
      />
      <CommandOutcome
        command={reactivateCommand}
        attemptedAction="Kích hoạt lại thành viên"
        onReload={onChanged}
      />
    </article>
  );
}

function RoleSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: WorkspaceRole;
  onChange: (role: WorkspaceRole) => void;
  disabled?: boolean;
}) {
  return (
    <label className="text-label">
      Vai trò
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as WorkspaceRole)}
        className="mt-1 block rounded-button border border-border px-3 py-2"
      >
        {WORKSPACE_ROLES.map((role) => (
          <option key={role} value={role}>
            {role}
          </option>
        ))}
      </select>
    </label>
  );
}
