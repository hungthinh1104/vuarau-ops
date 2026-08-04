"use client";

import type {
  OperationalProfileFields,
  WorkspaceDetailDto,
  WorkspaceMemberDto,
  WorkspaceOperationalProfileDto,
  WorkspaceRole,
} from "@vuarau/domain-contracts";
import Link from "next/link";
import type { ReactNode } from "react";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { PermissionDenied } from "@/ui/patterns/feedback/permission-denied.tsx";
import { QueryStates, type QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { WORKSPACE_ROLE_COPY, RoleSetPicker } from "@/ui/patterns/workspace/role-set-picker.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { Input } from "@/ui/primitives/input.tsx";
import { Select } from "@/ui/primitives/select.tsx";
import { TextInput } from "@/ui/primitives/text-input.tsx";

export function WorkspacePermissionView(props: {
  readonly role: string;
  readonly roles: readonly string[];
}) {
  return (
    <PermissionDenied
      attemptedAction="Quản lý thành viên"
      error={{
        code: "PERMISSION_DENIED",
        message: "Role set does not carry workspace.manage.",
        details: { permission: "workspace.manage", role: props.role, roles: props.roles },
        retryable: false,
      }}
    />
  );
}

const minuteToTime = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const timeToMinute = (value: string) => {
  const [hour, minute] = value.split(":").map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
};

export function WorkspaceView(props: {
  readonly workspace: QueryLike<WorkspaceDetailDto>;
  readonly operationalProfile: QueryLike<WorkspaceOperationalProfileDto>;
  readonly profileForm: (profile: WorkspaceOperationalProfileDto) => ReactNode;
  readonly addMemberForm: ReactNode;
  readonly memberRow: (member: WorkspaceMemberDto) => ReactNode;
  readonly onRetryWorkspace: () => void;
  readonly onRetryProfile: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <QueryStates
        query={props.workspace}
        loadingLabel="Đang tải thành viên"
        attemptedAction="Quản lý thành viên"
        onRetry={props.onRetryWorkspace}
      >
        {(detail) => (
          <>
            <PageHeader
              title={detail.name}
              description="Một tài khoản có thể giữ nhiều vai trò; quyền là hợp của các vai trò được giao."
            />
            <QueryStates
              query={props.operationalProfile}
              loadingLabel="Đang tải cấu hình vận hành"
              attemptedAction="Xem cấu hình vận hành"
              onRetry={props.onRetryProfile}
            >
              {(profile) => props.profileForm(profile)}
            </QueryStates>
            {props.addMemberForm}
            <ul className="flex flex-col gap-3">
              {detail.members.map((member) => (
                <li key={member.actorId}>{props.memberRow(member)}</li>
              ))}
            </ul>
          </>
        )}
      </QueryStates>
      <Link href="/workspace/operations" className="text-info underline">
        Vận hành, kiểm tra và sao lưu
      </Link>
      <Link href="/workspace/policies" className="text-info underline">
        Chính sách theo vựa
      </Link>
    </div>
  );
}

export function OperationalProfileView(props: {
  readonly profile: WorkspaceOperationalProfileDto;
  readonly fields: OperationalProfileFields;
  readonly reason: string;
  readonly invalidMessage: string | null;
  readonly command: CommandOutcomeView;
  readonly onFieldChange: <K extends keyof OperationalProfileFields>(
    field: K,
    value: OperationalProfileFields[K],
  ) => void;
  readonly onIntakeModeChange: (value: OperationalProfileFields["intakeMode"]) => void;
  readonly onReasonChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onReload: () => void;
}) {
  const fields = props.fields;
  const options = {
    purchasingMode: [
      ["disabled", "Không theo dõi"],
      ["purchase_receiving", "Purchase và nhận hàng"],
    ],
    inventoryMode: [
      ["disabled", "Không theo dõi"],
      ["movement_ledger", "Sổ biến động tồn kho"],
    ],
    intakeMode: [
      ["direct_receipt", "Nhận thẳng vào kho"],
      ["inspected_arrival", "Hàng đến, kiểm định, quyết định"],
    ],
    weighingMode: [
      ["quantity_only", "Chỉ nhập số lượng"],
      ["gross_tare_net", "Gross / tare / net"],
    ],
    qualityGradeMode: [
      ["disabled", "Không bắt buộc"],
      ["required", "Bắt buộc grade"],
    ],
    deliveryMode: [
      ["disabled", "Không tách luồng"],
      ["sale_fulfilment", "Delivery riêng"],
    ],
    cashbookMode: [
      ["disabled", "Không theo dõi vị trí tiền"],
      ["accounts_ledger", "Két / ngân hàng / người giữ"],
    ],
  } as const;
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
          options={options.purchasingMode}
          onChange={(value) =>
            props.onFieldChange(
              "purchasingMode",
              value as OperationalProfileFields["purchasingMode"],
            )
          }
        />
        <ProfileSelect
          label="Tồn kho"
          value={fields.inventoryMode}
          options={options.inventoryMode}
          onChange={(value) =>
            props.onFieldChange("inventoryMode", value as OperationalProfileFields["inventoryMode"])
          }
        />
        <ProfileSelect
          label="Luồng hàng đến"
          value={fields.intakeMode}
          options={options.intakeMode}
          onChange={(value) =>
            props.onIntakeModeChange(value as OperationalProfileFields["intakeMode"])
          }
        />
        <ProfileSelect
          label="Cách cân"
          value={fields.weighingMode}
          disabled={fields.intakeMode !== "inspected_arrival"}
          options={options.weighingMode}
          onChange={(value) =>
            props.onFieldChange("weighingMode", value as OperationalProfileFields["weighingMode"])
          }
        />
        <ProfileSelect
          label="Phân loại thương mại"
          value={fields.qualityGradeMode}
          options={options.qualityGradeMode}
          onChange={(value) =>
            props.onFieldChange(
              "qualityGradeMode",
              value as OperationalProfileFields["qualityGradeMode"],
            )
          }
        />
        <ProfileSelect
          label="Giao hàng"
          value={fields.deliveryMode}
          options={options.deliveryMode}
          onChange={(value) =>
            props.onFieldChange("deliveryMode", value as OperationalProfileFields["deliveryMode"])
          }
        />
        <ProfileSelect
          label="Sổ tiền"
          value={fields.cashbookMode}
          options={options.cashbookMode}
          onChange={(value) =>
            props.onFieldChange("cashbookMode", value as OperationalProfileFields["cashbookMode"])
          }
        />
        <TextInput
          label="Giờ bắt đầu ngày kinh doanh"
          type="time"
          value={minuteToTime(fields.businessDayStartMinute)}
          onChange={(event) =>
            props.onFieldChange("businessDayStartMinute", timeToMinute(event.target.value))
          }
        />
      </div>
      {props.invalidMessage ? (
        <p className="text-caption text-danger">{props.invalidMessage}</p>
      ) : null}
      <TextInput
        label="Lý do thay đổi"
        value={props.reason}
        onChange={(event) => props.onReasonChange(event.target.value)}
      />
      <Button
        disabled={
          props.invalidMessage !== null ||
          props.reason.trim().length === 0 ||
          props.command.phase.kind === "sending"
        }
        onClick={props.onSubmit}
      >
        Lưu cấu hình vận hành
      </Button>
      <CommandOutcome
        command={props.command}
        attemptedAction="Cập nhật cấu hình vận hành"
        onReload={props.onReload}
      />
    </section>
  );
}

function ProfileSelect(props: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly (readonly [string, string])[];
  readonly disabled?: boolean;
  readonly onChange: (value: string) => void;
}) {
  return (
    <Select
      label={props.label}
      value={props.value}
      disabled={props.disabled}
      onChange={(event) => props.onChange(event.target.value)}
      options={props.options.map(([value, label]) => ({ value, label }))}
    />
  );
}

export function AddMemberView(props: {
  readonly actorText: string;
  readonly roles: readonly WorkspaceRole[];
  readonly reason: string;
  readonly actorValid: boolean;
  readonly command: CommandOutcomeView;
  readonly onActorChange: (value: string) => void;
  readonly onRolesChange: (roles: readonly WorkspaceRole[]) => void;
  readonly onReasonChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onReload: () => void;
}) {
  return (
    <section
      aria-labelledby="add-member-title"
      className="flex flex-col gap-3 rounded-card border border-border p-4"
    >
      <h2 id="add-member-title" className="text-subheading font-semibold">
        Thêm tài khoản đã có
      </h2>
      <TextInput
        label="Mã tài khoản"
        value={props.actorText}
        onChange={(event) => props.onActorChange(event.target.value)}
        placeholder="UUID tài khoản"
      />
      <RoleSetPicker value={props.roles} onChange={props.onRolesChange} />
      <TextInput
        label="Lý do"
        value={props.reason}
        onChange={(event) => props.onReasonChange(event.target.value)}
      />
      <Button
        disabled={
          !props.actorValid ||
          props.reason.trim().length === 0 ||
          props.command.phase.kind === "sending"
        }
        onClick={props.onSubmit}
      >
        Thêm thành viên
      </Button>
      <CommandOutcome
        command={props.command}
        attemptedAction="Thêm thành viên"
        onReload={props.onReload}
      />
    </section>
  );
}

export function MemberRowView(props: {
  readonly member: WorkspaceMemberDto;
  readonly currentActorId: string;
  readonly roles: readonly WorkspaceRole[];
  readonly roleCommand: CommandOutcomeView;
  readonly revokeCommand: CommandOutcomeView;
  readonly reactivateCommand: CommandOutcomeView;
  readonly rolesUnchanged: boolean;
  readonly onRolesChange: (roles: readonly WorkspaceRole[]) => void;
  readonly onSaveRoles: () => void;
  readonly onRevoke: () => void;
  readonly onReactivate: () => void;
  readonly onReload: () => void;
}) {
  const isSelf = props.member.actorId === props.currentActorId;
  return (
    <article
      aria-label={`Thành viên ${props.member.displayName}`}
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-body font-semibold">{props.member.displayName}</h2>
          <p className="text-caption text-ink-muted">{props.member.actorId}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {props.member.roles.map((role) => (
              <Badge key={role} tone="info">
                {WORKSPACE_ROLE_COPY[role]}
              </Badge>
            ))}
          </div>
        </div>
        <Badge tone={props.member.isActive ? "positive" : "neutral"}>
          {props.member.isActive ? "Đang hoạt động" : "Đã thu hồi"}
        </Badge>
      </div>
      {props.member.isActive ? (
        <div className="flex flex-col gap-3">
          <RoleSetPicker value={props.roles} onChange={props.onRolesChange} disabled={isSelf} />
          {isSelf ? (
            <p className="text-caption text-ink-muted">
              Không thể tự thay đổi vai trò của chính mình.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              tone="secondary"
              disabled={
                props.rolesUnchanged || isSelf || props.roleCommand.phase.kind === "sending"
              }
              onClick={props.onSaveRoles}
            >
              Lưu vai trò
            </Button>
            <Button
              tone="danger"
              disabled={props.revokeCommand.phase.kind === "sending"}
              onClick={props.onRevoke}
            >
              Thu hồi
            </Button>
          </div>
        </div>
      ) : (
        <Button
          tone="secondary"
          disabled={props.reactivateCommand.phase.kind === "sending"}
          onClick={props.onReactivate}
        >
          Kích hoạt lại
        </Button>
      )}
      <CommandOutcome
        command={props.roleCommand}
        attemptedAction="Đổi vai trò thành viên"
        onReload={props.onReload}
      />
      <CommandOutcome
        command={props.revokeCommand}
        attemptedAction="Thu hồi quyền thành viên"
        onReload={props.onReload}
      />
      <CommandOutcome
        command={props.reactivateCommand}
        attemptedAction="Kích hoạt lại thành viên"
        onReload={props.onReload}
      />
    </article>
  );
}
