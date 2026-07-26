import type { Meta, StoryObj } from "@storybook/react-vite";
import { BusinessRejection } from "./business-rejection.tsx";
import { PermissionDenied } from "./permission-denied.tsx";
import { StaleVersionNotice } from "./stale-version-notice.tsx";
import { UnknownNetworkOutcome } from "./unknown-network-outcome.tsx";
import { CommandProgressNotice } from "./command-progress-notice.tsx";
import { Button } from "../primitives/button.tsx";
import { coversState } from "../catalog-state.ts";
import {
  rejectionCommandInProgress,
  rejectionLastOwner,
  rejectionMembershipRevoked,
  rejectionPermissionDenied,
  rejectionReversalExceeds,
  rejectionSaleEmpty,
  rejectionStaleVersion,
} from "../../fixtures/rejection.fixtures.ts";
import { COMMAND_ID, IDEMPOTENCY_KEY, WORKSPACE_ID, ACTOR_ID } from "@vuarau/test-fixtures/ids";
import { TRANSACTION_TIME } from "@vuarau/test-fixtures/time";
import type { CommandIdentity } from "../../api/command-identity.ts";

/**
 * The states nobody enjoys drawing, which is exactly why they are here: a screen
 * is incomplete if it only has the happy path (design.md).
 */
const meta = { title: "Patterns/Exception states" } satisfies Meta;
export default meta;
type Story = StoryObj;

const identity: CommandIdentity = {
  commandId: COMMAND_ID,
  idempotencyKey: IDEMPOTENCY_KEY,
  workspaceId: WORKSPACE_ID,
  actorId: ACTOR_ID,
  occurredAt: TRANSACTION_TIME,
};

export const BusinessRejectionState: Story = {
  name: "business_rejection — luật từ chối",
  parameters: coversState("business_rejection"),
  render: () => (
    <BusinessRejection
      error={rejectionSaleEmpty}
      action={<Button tone="secondary">Thêm mặt hàng</Button>}
    />
  ),
};

/** Same component, and the details carry the number the message must not be parsed for. */
export const ReversalAmountExceeded: Story = {
  name: "reversal_amount_exceeded — nêu rõ còn hoàn được bao nhiêu",
  parameters: coversState("reversal_amount_exceeded"),
  render: () => <BusinessRejection error={rejectionReversalExceeds} />,
};

export const PermissionDeniedState: Story = {
  name: "permission_denied — cần hỏi người khác",
  parameters: coversState("permission_denied"),
  render: () => (
    <PermissionDenied error={rejectionPermissionDenied} attemptedAction="Hoàn tác đơn hàng" />
  ),
};

/**
 * Reload, never an automatic retry. The catalog calls a silent retry here "a P0
 * money bug in disguise": it would post whatever the sale is *now*, not the
 * 1.200.000 ₫ this user agreed to.
 */
export const StaleVersion: Story = {
  name: "stale_version — tải lại, không tự gửi lại",
  parameters: coversState("stale_version"),
  render: () => <StaleVersionNotice error={rejectionStaleVersion} onReload={() => undefined} />,
};

export const CommandInProgress: Story = {
  name: "command_in_progress — lệnh trước còn đang chạy",
  parameters: coversState("command_in_progress"),
  render: () => <BusinessRejection error={rejectionCommandInProgress} />,
};

/**
 * The single most important state in the catalogue. The command **may have
 * committed**; the resend carries the same idempotency key, which is shown so it
 * can be seen not changing.
 */
export const UnknownNetwork: Story = {
  name: "unknown_network_outcome — chưa rõ, gửi lại đúng lệnh cũ",
  parameters: coversState("unknown_network_outcome"),
  render: () => (
    <UnknownNetworkOutcome
      identity={identity}
      attempts={1}
      attemptedAction="Ghi nhận thanh toán 500.000 ₫"
      onResend={() => undefined}
      onCancel={() => undefined}
    />
  ),
};

/** A **success**, not an error. Showing an error here trains people to submit again. */
export const DuplicateSafeRetry: Story = {
  name: "duplicate_safe_retry — đã ghi trước đó, không ghi thêm",
  parameters: coversState("duplicate_safe_retry"),
  render: () => (
    <CommandProgressNotice
      phase={{ kind: "succeeded" }}
      attemptedAction="Ghi nhận thanh toán 500.000 ₫"
      wasDuplicateSafeRetry
    />
  ),
};

/** Arrives on **any** call, not only at sign-in. Treat it as session-ending everywhere. */
export const MembershipRevoked: Story = {
  name: "membership_revoked — mất quyền giữa ca",
  parameters: coversState("membership_revoked"),
  render: () => <BusinessRejection error={rejectionMembershipRevoked} />,
};

export const LastOwnerProtected: Story = {
  name: "last_owner_protected — không thu hồi chủ vựa cuối cùng",
  parameters: coversState("last_owner_protected"),
  render: () => <BusinessRejection error={rejectionLastOwner} />,
};
