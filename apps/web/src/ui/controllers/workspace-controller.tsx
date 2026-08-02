"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  OperationalProfileFields,
  WorkspaceMemberDto,
  WorkspaceOperationalProfileDto,
  WorkspaceRole,
} from "@vuarau/domain-contracts";
import {
  addWorkspaceMemberCommandSchema,
  actorIdSchema,
  changeWorkspaceMemberRoleCommandSchema,
  normalizeWorkspaceRoles,
  operationalProfileFieldsSchema,
  reactivateWorkspaceMemberCommandSchema,
  revokeWorkspaceMembershipCommandSchema,
  updateWorkspaceOperationalProfileCommandSchema,
} from "@vuarau/domain-contracts";
import { useCallback, useEffect, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import {
  AddMemberView,
  MemberRowView,
  OperationalProfileView,
  WorkspacePermissionView,
  WorkspaceView,
} from "@/ui/screens/workspace-view.tsx";

function sameRoles(left: readonly WorkspaceRole[], right: readonly WorkspaceRole[]): boolean {
  const a = normalizeWorkspaceRoles(left);
  const b = normalizeWorkspaceRoles(right);
  return a.length === b.length && a.every((role, index) => role === b[index]);
}

export function WorkspaceController() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const workspace = useQuery(trpc.session.workspace.queryOptions({ workspaceId }));
  const operationalProfile = useQuery(
    trpc.session.operationalProfile.queryOptions({ workspaceId }),
  );
  const refresh = useCallback(() => void workspace.refetch(), [workspace.refetch]);
  const refreshProfile = useCallback(
    () => void operationalProfile.refetch(),
    [operationalProfile.refetch],
  );
  if (!session.permissions.includes("workspace.manage")) {
    return <WorkspacePermissionView role={session.role} roles={session.roles} />;
  }
  return (
    <WorkspaceView
      workspace={workspace}
      operationalProfile={operationalProfile}
      profileForm={(profile) => (
        <OperationalProfileController profile={profile} onChanged={refreshProfile} />
      )}
      addMemberForm={<AddMemberController onChanged={refresh} />}
      memberRow={(member) => <MemberRowController member={member} onChanged={refresh} />}
      onRetryWorkspace={refresh}
      onRetryProfile={refreshProfile}
    />
  );
}

function OperationalProfileController(props: {
  readonly profile: WorkspaceOperationalProfileDto;
  readonly onChanged: () => void;
}) {
  const trpc = useTRPC();
  const [fields, setFields] = useState<OperationalProfileFields>(() =>
    profileFields(props.profile),
  );
  const [reason, setReason] = useState("Cập nhật cách vựa vận hành");
  const mutation = useMutation(trpc.session.updateOperationalProfile.mutationOptions());
  const command = useContractCommand(
    updateWorkspaceOperationalProfileCommandSchema,
    mutation.mutateAsync,
  );
  useEffect(() => setFields(profileFields(props.profile)), [props.profile]);
  useEffect(() => {
    if (command.phase.kind === "succeeded") props.onChanged();
  }, [command.phase.kind, props.onChanged]);
  const parsed = operationalProfileFieldsSchema.safeParse(fields);
  const invalidMessage = parsed.success
    ? null
    : (parsed.error.issues[0]?.message ?? "Tổ hợp vận hành chưa hợp lệ.");
  return (
    <OperationalProfileView
      profile={props.profile}
      fields={fields}
      reason={reason}
      invalidMessage={invalidMessage}
      command={command}
      onFieldChange={(field, value) => setFields((current) => ({ ...current, [field]: value }))}
      onIntakeModeChange={(intakeMode) =>
        setFields((current) => ({
          ...current,
          intakeMode,
          weighingMode: intakeMode === "direct_receipt" ? "quantity_only" : current.weighingMode,
        }))
      }
      onReasonChange={setReason}
      onSubmit={() => {
        if (parsed.success)
          void command.submit(
            { ...parsed.data, reason },
            { expectedVersion: props.profile.version },
          );
      }}
      onReload={props.onChanged}
    />
  );
}

function AddMemberController(props: { readonly onChanged: () => void }) {
  const trpc = useTRPC();
  const [actorText, setActorText] = useState("");
  const [roles, setRoles] = useState<readonly WorkspaceRole[]>(["sales"]);
  const [reason, setReason] = useState("Thêm thành viên vào vựa");
  const mutation = useMutation(trpc.session.addMember.mutationOptions());
  const command = useContractCommand(addWorkspaceMemberCommandSchema, mutation.mutateAsync);
  useEffect(() => {
    if (command.phase.kind === "succeeded") props.onChanged();
  }, [command.phase.kind, props.onChanged]);
  const actor = actorIdSchema.safeParse(actorText.trim());
  return (
    <AddMemberView
      actorText={actorText}
      roles={roles}
      reason={reason}
      actorValid={actor.success}
      command={command}
      onActorChange={setActorText}
      onRolesChange={setRoles}
      onReasonChange={setReason}
      onSubmit={() => {
        if (actor.success) void command.submit({ actorId: actor.data, roles: [...roles], reason });
      }}
      onReload={props.onChanged}
    />
  );
}

function MemberRowController(props: {
  readonly member: WorkspaceMemberDto;
  readonly onChanged: () => void;
}) {
  const { session } = useSession();
  const trpc = useTRPC();
  const [roles, setRoles] = useState<readonly WorkspaceRole[]>(props.member.roles);
  const roleMutation = useMutation(trpc.session.changeMemberRole.mutationOptions());
  const revokeMutation = useMutation(trpc.session.revokeMembership.mutationOptions());
  const reactivateMutation = useMutation(trpc.session.reactivateMember.mutationOptions());
  const roleCommand = useContractCommand(
    changeWorkspaceMemberRoleCommandSchema,
    roleMutation.mutateAsync,
  );
  const revokeCommand = useContractCommand(
    revokeWorkspaceMembershipCommandSchema,
    revokeMutation.mutateAsync,
  );
  const reactivateCommand = useContractCommand(
    reactivateWorkspaceMemberCommandSchema,
    reactivateMutation.mutateAsync,
  );
  useEffect(() => setRoles(props.member.roles), [props.member.roles]);
  useEffect(() => {
    if (
      roleCommand.phase.kind === "succeeded" ||
      revokeCommand.phase.kind === "succeeded" ||
      reactivateCommand.phase.kind === "succeeded"
    )
      props.onChanged();
  }, [
    props.onChanged,
    reactivateCommand.phase.kind,
    revokeCommand.phase.kind,
    roleCommand.phase.kind,
  ]);
  return (
    <MemberRowView
      member={props.member}
      currentActorId={session.actorId}
      roles={roles}
      roleCommand={roleCommand}
      revokeCommand={revokeCommand}
      reactivateCommand={reactivateCommand}
      rolesUnchanged={sameRoles(roles, props.member.roles)}
      onRolesChange={setRoles}
      onSaveRoles={() =>
        void roleCommand.submit({
          actorId: props.member.actorId,
          expectedRoles: props.member.roles,
          roles: [...roles],
          reason: "Cập nhật phân công",
        })
      }
      onRevoke={() =>
        void revokeCommand.submit({ actorId: props.member.actorId, reason: "Ngưng quyền truy cập" })
      }
      onReactivate={() =>
        void reactivateCommand.submit({
          actorId: props.member.actorId,
          reason: "Khôi phục quyền truy cập",
        })
      }
      onReload={props.onChanged}
    />
  );
}

function profileFields(profile: WorkspaceOperationalProfileDto): OperationalProfileFields {
  return {
    purchasingMode: profile.purchasingMode,
    inventoryMode: profile.inventoryMode,
    qualityGradeMode: profile.qualityGradeMode,
    deliveryMode: profile.deliveryMode,
    cashbookMode: profile.cashbookMode,
    intakeMode: profile.intakeMode,
    weighingMode: profile.weighingMode,
    businessDayStartMinute: profile.businessDayStartMinute,
  };
}
