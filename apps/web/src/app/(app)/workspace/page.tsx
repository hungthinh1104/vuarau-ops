"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  ActorId,
  OperationalProfileFields,
  WorkspaceMemberDto,
  WorkspaceMembershipDto,
  WorkspaceOperationalProfileDto,
  WorkspaceRole,
} from "@vuarau/domain-contracts";
import {
  actorIdSchema,
  normalizeWorkspaceRoles,
  operationalProfileFieldsSchema,
} from "@vuarau/domain-contracts";
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
import { RoleSetPicker, WORKSPACE_ROLE_COPY } from "@/ui/patterns/workspace/role-set-picker.tsx";

function sameRoles(left: readonly WorkspaceRole[], right: readonly WorkspaceRole[]): boolean {
  const a = normalizeWorkspaceRoles(left);
  const b = normalizeWorkspaceRoles(right);
  return a.length === b.length && a.every((role, index) => role === b[index]);
}

export default function WorkspacePage() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const workspace = useQuery(trpc.session.workspace.queryOptions({ workspaceId }));
  const operationalProfile = useQuery(
    trpc.session.operationalProfile.queryOptions({ workspaceId }),
  );
  const refresh = useCallback(() => {
    void workspace.refetch();
  }, [workspace.refetch]);
  const refreshProfile = useCallback(() => {
    void operationalProfile.refetch();
  }, [operationalProfile.refetch]);

  if (!session.permissions.includes("workspace.manage")) {
    return (
      <PermissionDenied
        attemptedAction="Quản lý thành viên"
        error={{
          code: "PERMISSION_DENIED",
          message: "Role set does not carry workspace.manage.",
          details: { permission: "workspace.manage", role: session.role, roles: session.roles },
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
            <PageHeader
              title={detail.name}
              description="Một tài khoản có thể giữ nhiều vai trò; quyền là hợp của các vai trò được giao."
            />
            <QueryStates
              query={operationalProfile}
              loadingLabel="Đang tải cấu hình vận hành"
              attemptedAction="Xem cấu hình vận hành"
              onRetry={() => void operationalProfile.refetch()}
            >
              {(profile) => <OperationalProfileForm profile={profile} onChanged={refreshProfile} />}
            </QueryStates>
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

const minuteToTime = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

const timeToMinute = (value: string) => {
  const [hour, minute] = value.split(":").map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
};

function OperationalProfileForm({
  profile,
  onChanged,
}: {
  profile: WorkspaceOperationalProfileDto;
  onChanged: () => void;
}) {
  const trpc = useTRPC();
  const [fields, setFields] = useState<OperationalProfileFields>({
    purchasingMode: profile.purchasingMode,
    inventoryMode: profile.inventoryMode,
    qualityGradeMode: profile.qualityGradeMode,
    deliveryMode: profile.deliveryMode,
    cashbookMode: profile.cashbookMode,
    intakeMode: profile.intakeMode,
    weighingMode: profile.weighingMode,
    businessDayStartMinute: profile.businessDayStartMinute,
  });
  const [reason, setReason] = useState("Cập nhật cách vựa vận hành");
  const mutation = useMutation(trpc.session.updateOperationalProfile.mutationOptions());
  const command = useCommand<
    OperationalProfileFields & { reason: string },
    WorkspaceOperationalProfileDto
  >(
    (envelope) =>
      mutation.mutateAsync(envelope as never) as Promise<WorkspaceOperationalProfileDto>,
  );

  useEffect(() => {
    setFields({
      purchasingMode: profile.purchasingMode,
      inventoryMode: profile.inventoryMode,
      qualityGradeMode: profile.qualityGradeMode,
      deliveryMode: profile.deliveryMode,
      cashbookMode: profile.cashbookMode,
      intakeMode: profile.intakeMode,
      weighingMode: profile.weighingMode,
      businessDayStartMinute: profile.businessDayStartMinute,
    });
  }, [profile]);
  useEffect(() => {
    if (command.phase.kind === "succeeded") onChanged();
  }, [command.phase.kind, onChanged]);

  const parsed = operationalProfileFieldsSchema.safeParse(fields);
  const invalidMessage = parsed.success
    ? null
    : (parsed.error.issues[0]?.message ?? "Tổ hợp vận hành chưa hợp lệ.");
  const update = <K extends keyof OperationalProfileFields>(
    field: K,
    value: OperationalProfileFields[K],
  ) => setFields((current) => ({ ...current, [field]: value }));

  return (
    <section className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4">
      <div>
        <h2 className="text-subheading font-semibold">Cấu hình cách vựa vận hành</h2>
        <p className="mt-1 text-caption text-ink-muted">
          Chỉ bật các bước vựa thực sự làm. Đổi cấu hình không xóa lịch sử cũ.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <ProfileSelect
          label="Mua hàng"
          value={fields.purchasingMode}
          onChange={(value) =>
            update("purchasingMode", value as OperationalProfileFields["purchasingMode"])
          }
          options={[
            ["disabled", "Không theo dõi"],
            ["purchase_receiving", "Purchase và nhận hàng"],
          ]}
        />
        <ProfileSelect
          label="Tồn kho"
          value={fields.inventoryMode}
          onChange={(value) =>
            update("inventoryMode", value as OperationalProfileFields["inventoryMode"])
          }
          options={[
            ["disabled", "Không theo dõi"],
            ["movement_ledger", "Sổ biến động tồn kho"],
          ]}
        />
        <ProfileSelect
          label="Luồng hàng đến"
          value={fields.intakeMode}
          onChange={(value) => {
            const intakeMode = value as OperationalProfileFields["intakeMode"];
            setFields((current) => ({
              ...current,
              intakeMode,
              weighingMode:
                intakeMode === "direct_receipt" ? "quantity_only" : current.weighingMode,
            }));
          }}
          options={[
            ["direct_receipt", "Nhận thẳng vào kho"],
            ["inspected_arrival", "Hàng đến → kiểm định → quyết định"],
          ]}
        />
        <ProfileSelect
          label="Cách cân"
          value={fields.weighingMode}
          disabled={fields.intakeMode !== "inspected_arrival"}
          onChange={(value) =>
            update("weighingMode", value as OperationalProfileFields["weighingMode"])
          }
          options={[
            ["quantity_only", "Chỉ nhập số lượng"],
            ["gross_tare_net", "Gross / tare / net"],
          ]}
        />
        <ProfileSelect
          label="Phân loại thương mại"
          value={fields.qualityGradeMode}
          onChange={(value) =>
            update("qualityGradeMode", value as OperationalProfileFields["qualityGradeMode"])
          }
          options={[
            ["disabled", "Không bắt buộc"],
            ["required", "Bắt buộc grade"],
          ]}
        />
        <ProfileSelect
          label="Giao hàng"
          value={fields.deliveryMode}
          onChange={(value) =>
            update("deliveryMode", value as OperationalProfileFields["deliveryMode"])
          }
          options={[
            ["disabled", "Không tách luồng"],
            ["sale_fulfilment", "Delivery riêng"],
          ]}
        />
        <ProfileSelect
          label="Sổ tiền"
          value={fields.cashbookMode}
          onChange={(value) =>
            update("cashbookMode", value as OperationalProfileFields["cashbookMode"])
          }
          options={[
            ["disabled", "Không theo dõi vị trí tiền"],
            ["accounts_ledger", "Két / ngân hàng / người giữ"],
          ]}
        />
        <label className="text-label">
          Giờ bắt đầu ngày kinh doanh
          <input
            type="time"
            value={minuteToTime(fields.businessDayStartMinute)}
            onChange={(event) => update("businessDayStartMinute", timeToMinute(event.target.value))}
            className="mt-1 w-full rounded-button border border-border bg-surface px-3 py-2"
          />
        </label>
      </div>
      {invalidMessage ? <p className="text-caption text-danger">{invalidMessage}</p> : null}
      <label className="text-label">
        Lý do thay đổi
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="mt-1 w-full rounded-button border border-border px-3 py-2"
        />
      </label>
      <button
        type="button"
        disabled={!parsed.success || reason.trim().length === 0 || command.phase.kind === "sending"}
        onClick={() => {
          if (parsed.success)
            void command.submit({ ...parsed.data, reason }, { expectedVersion: profile.version });
        }}
        className="touch-target rounded-button bg-leaf px-4 text-label font-semibold text-white disabled:opacity-50"
      >
        Lưu cấu hình vận hành
      </button>
      <CommandOutcome
        command={command}
        attemptedAction="Cập nhật cấu hình vận hành"
        onReload={onChanged}
      />
    </section>
  );
}

function ProfileSelect({
  label,
  value,
  options,
  disabled = false,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-label">
      {label}
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-button border border-border bg-surface px-3 py-2 disabled:opacity-60"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function AddMemberForm({ onChanged }: { onChanged: () => void }) {
  const trpc = useTRPC();
  const [actorText, setActorText] = useState("");
  const [roles, setRoles] = useState<readonly WorkspaceRole[]>(["sales"]);
  const [reason, setReason] = useState("Thêm thành viên vào vựa");
  const mutation = useMutation(trpc.session.addMember.mutationOptions());
  const command = useCommand<
    { actorId: ActorId; roles: readonly WorkspaceRole[]; reason: string },
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
      <RoleSetPicker value={roles} onChange={setRoles} />
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
          if (actor.success) void command.submit({ actorId: actor.data, roles, reason });
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
  const [roles, setRoles] = useState<readonly WorkspaceRole[]>(member.roles);
  const roleMutation = useMutation(trpc.session.changeMemberRole.mutationOptions());
  const revokeMutation = useMutation(trpc.session.revokeMembership.mutationOptions());
  const reactivateMutation = useMutation(trpc.session.reactivateMember.mutationOptions());
  const roleCommand = useCommand<
    {
      actorId: ActorId;
      expectedRoles: readonly WorkspaceRole[];
      roles: readonly WorkspaceRole[];
      reason: string;
    },
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

  useEffect(() => setRoles(member.roles), [member.roles]);
  useEffect(() => {
    if (
      roleCommand.phase.kind === "succeeded" ||
      revokeCommand.phase.kind === "succeeded" ||
      reactivateCommand.phase.kind === "succeeded"
    )
      onChanged();
  }, [onChanged, reactivateCommand.phase.kind, revokeCommand.phase.kind, roleCommand.phase.kind]);

  const isSelf = member.actorId === session.actorId;
  return (
    <article className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-body font-semibold">{member.displayName}</h2>
          <p className="text-caption text-ink-muted">{member.actorId}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {member.roles.map((role) => (
              <Badge key={role} tone="info">
                {WORKSPACE_ROLE_COPY[role]}
              </Badge>
            ))}
          </div>
        </div>
        <Badge tone={member.isActive ? "positive" : "neutral"}>
          {member.isActive ? "Đang hoạt động" : "Đã thu hồi"}
        </Badge>
      </div>

      {member.isActive ? (
        <div className="flex flex-col gap-3">
          <RoleSetPicker value={roles} onChange={setRoles} disabled={isSelf} />
          {isSelf ? (
            <p className="text-caption text-ink-muted">
              Không thể tự thay đổi vai trò của chính mình.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={
                sameRoles(roles, member.roles) || isSelf || roleCommand.phase.kind === "sending"
              }
              onClick={() =>
                void roleCommand.submit({
                  actorId: member.actorId,
                  expectedRoles: member.roles,
                  roles,
                  reason: "Cập nhật phân công",
                })
              }
              className="touch-target rounded-button border border-border px-3 text-label disabled:opacity-50"
            >
              Lưu vai trò
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
