import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CapabilityAction } from "@/ui/patterns/capability-action.tsx";
import { PermissionDenied } from "./permission-denied.tsx";
import { StaleVersionNotice } from "./stale-version-notice.tsx";
import { UnknownNetworkOutcome } from "./unknown-network-outcome.tsx";
import { BusinessRejection } from "./business-rejection.tsx";
import { QueryStates } from "./query-states.tsx";
import type { CommandIdentity } from "@/api/command-identity.ts";
import {
  beginCommand,
  isUnknownOutcome,
  markUnknown,
  mintCommandIdentity,
  retryUnknown,
} from "@/api/command-identity.ts";
import { domainErrorOf, rejectionStateOf } from "@/api/domain-error.ts";
import { ownerSession, salesSession } from "@/fixtures/session.fixtures.ts";
import { saleVoided } from "@/fixtures/sale.fixtures.ts";
import {
  rejectionPermissionDenied,
  rejectionReversalExceeds,
  rejectionStaleVersion,
} from "@/fixtures/rejection.fixtures.ts";
import { ACTOR_ID, WORKSPACE_ID } from "@vuarau/test-fixtures/ids";

/**
 * TC-WEB-007 — a control is enabled only when **both** halves say yes.
 *
 * Sale and payment capabilities carry state only, because they are computed in the
 * domain kernel, which by construction does not know who is asking
 * (docs/06-api-contracts/capabilities.md). A screen that read only the capability
 * would offer a void button to a `sales` worker.
 */
describe("TC-WEB-007 — capability plus permission", () => {
  it("disables an action the role may not perform, even when the state allows it", async () => {
    const onAction = vi.fn();
    render(
      <CapabilityAction
        label="Hoàn tác đơn"
        capability={{ allowed: true }}
        permission="sale.void"
        session={salesSession}
        onAction={onAction}
      />,
    );

    const button = screen.getByRole("button", { name: "Hoàn tác đơn" });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onAction).not.toHaveBeenCalled();
  });

  it("disables an action the state forbids, even for an owner", () => {
    render(
      <CapabilityAction
        label="Hoàn tác đơn"
        // Already voided. The owner holds `sale.void`; the sale is still not voidable.
        capability={saleVoided.capabilities.void}
        permission="sale.void"
        session={ownerSession}
        onAction={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "Hoàn tác đơn" })).toBeDisabled();
    expect(screen.getByText("Đơn này đã được hoàn tác rồi.")).toBeInTheDocument();
  });

  it("enables the action when both halves agree, and says nothing extra", async () => {
    const onAction = vi.fn();
    render(
      <CapabilityAction
        label="Chốt đơn"
        capability={{ allowed: true }}
        permission="sale.post"
        session={salesSession}
        onAction={onAction}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Chốt đơn" }));
    expect(onAction).toHaveBeenCalledOnce();
  });

  /** Hiding the control *and* the reason is how a worker ends up keeping paper. */
  it("states the reason visibly rather than only as a tooltip", () => {
    render(
      <CapabilityAction
        label="Hoàn tác đơn"
        capability={{ allowed: true }}
        permission="sale.void"
        session={salesSession}
        onAction={() => undefined}
      />,
    );

    expect(
      screen.getByText("Bạn không có quyền thực hiện việc này. Hãy nhờ chủ vựa hoặc kế toán."),
    ).toBeInTheDocument();
  });
});

/**
 * TC-WEB-008 — a permission error stays renderable when authorization changes
 * after the screen loaded.
 */
describe("TC-WEB-008 — permission denied after load", () => {
  it("names the missing permission and the role, and points at a person", () => {
    render(
      <PermissionDenied error={rejectionPermissionDenied} attemptedAction="Hoàn tác đơn hàng" />,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("sale.void")).toBeInTheDocument();
    expect(screen.getByText("Bán hàng")).toBeInTheDocument();
    expect(screen.getByText(/Hãy nhờ chủ vựa hoặc kế toán/)).toBeInTheDocument();
  });

  it("classifies the code as its own state, not as a business rejection", () => {
    expect(rejectionStateOf("PERMISSION_DENIED")).toBe("permission_denied");
    expect(rejectionStateOf("WORKSPACE_MEMBERSHIP_INACTIVE")).toBe("membership_revoked");
    expect(rejectionStateOf("SALE_EMPTY")).toBe("business_rejection");
    // An unknown future code is still renderable rather than a crash.
    expect(rejectionStateOf("SALE_CURRENCY_MISMATCH")).toBe("business_rejection");
  });
});

/**
 * TC-WEB-009 — a stale version asks for a reload. It never resends the command.
 *
 * The catalog calls a silent retry here "a P0 money bug in disguise": it would
 * apply an intention formed against data this user never saw.
 */
describe("TC-WEB-009 — stale version reloads rather than retries", () => {
  it("offers reload, and offers nothing that resends", async () => {
    const onReload = vi.fn();
    render(<StaleVersionNotice error={rejectionStaleVersion} onReload={onReload} />);

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName("Tải lại");

    await userEvent.click(buttons[0]!);
    expect(onReload).toHaveBeenCalledOnce();
  });

  it("shows which version the user was looking at", () => {
    render(<StaleVersionNotice error={rejectionStaleVersion} onReload={() => undefined} />);
    expect(screen.getByText(/bản 1.*bản 2/)).toBeInTheDocument();
  });

  it("the server marks it not retryable, so no automatic retry can reach it", () => {
    expect(rejectionStaleVersion.retryable).toBe(false);
    expect(rejectionStateOf(rejectionStaleVersion.code)).toBe("stale_version");
  });
});

/**
 * TC-WEB-010 — an unknown network outcome preserves the command's identity.
 *
 * Regenerating the idempotency key on resubmit turns one sale into two, and no
 * server-side rule can prevent it, because a fresh key is indistinguishable from a
 * genuinely new command.
 */
describe("TC-WEB-010 — unknown outcome keeps commandId and idempotencyKey", () => {
  const identity = mintCommandIdentity({ workspaceId: WORKSPACE_ID, actorId: ACTOR_ID });

  it("hands the original identity back to the resend handler", async () => {
    const onResend = vi.fn<(identity: CommandIdentity) => void>();
    render(
      <UnknownNetworkOutcome
        identity={identity}
        attempts={1}
        attemptedAction="Ghi nhận thanh toán 500.000 ₫"
        onResend={onResend}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Gửi lại" }));

    expect(onResend).toHaveBeenCalledWith(identity);
    expect(onResend.mock.calls[0]![0].idempotencyKey).toBe(identity.idempotencyKey);
    expect(onResend.mock.calls[0]![0].commandId).toBe(identity.commandId);
  });

  it("calls it unconfirmed, not failed", () => {
    render(
      <UnknownNetworkOutcome
        identity={identity}
        attempts={2}
        attemptedAction="Ghi nhận thanh toán 500.000 ₫"
        onResend={() => undefined}
      />,
    );

    expect(screen.getByText("Chưa rõ kết quả")).toBeInTheDocument();
    expect(screen.getByTestId("idempotency-key")).toHaveTextContent(identity.idempotencyKey);
    expect(screen.queryByText(/thất bại/i)).toBeNull();
  });

  it("carries the identity unchanged across retries in client state", () => {
    let pending = beginCommand(identity, { amountMinor: 500_000 });
    pending = markUnknown(pending);
    pending = retryUnknown(pending);
    pending = retryUnknown(pending);

    expect(pending.attempts).toBe(3);
    // The only thing that moved is the counter.
    expect(pending.identity).toBe(identity);
    expect(pending.payload).toEqual({ amountMinor: 500_000 });
  });

  it("distinguishes a dropped connection from a business refusal", () => {
    expect(isUnknownOutcome(new Error("Failed to fetch"))).toBe(true);
    expect(isUnknownOutcome({ data: { domainError: rejectionReversalExceeds } })).toBe(false);
  });

  it("two freshly minted identities never collide", () => {
    const a = mintCommandIdentity({ workspaceId: WORKSPACE_ID, actorId: ACTOR_ID });
    const b = mintCommandIdentity({ workspaceId: WORKSPACE_ID, actorId: ACTOR_ID });
    expect(a.idempotencyKey).not.toBe(b.idempotencyKey);
    expect(a.commandId).not.toBe(b.commandId);
  });
});

/**
 * TC-WEB-011 — copy is keyed by code, never by the server's message.
 *
 * Messages are English today, will become Vietnamese, and will be reworded. A
 * screen that rendered them would change wording the day the server did.
 */
describe("TC-WEB-011 — rejection copy comes from the code", () => {
  it("renders Vietnamese copy while the server message is English", () => {
    render(<BusinessRejection error={rejectionReversalExceeds} />);

    expect(screen.getByText("Số tiền hoàn vượt quá phần còn hoàn được.")).toBeInTheDocument();
    expect(screen.queryByText(rejectionReversalExceeds.message)).toBeNull();
  });

  it("reads the specifics out of details rather than parsing the prose", () => {
    render(<BusinessRejection error={rejectionReversalExceeds} />);
    expect(screen.getByText("Chỉ còn hoàn được 300.000 ₫.")).toBeInTheDocument();
  });

  it("surfaces the response request id for support correlation", () => {
    render(<BusinessRejection error={rejectionReversalExceeds} requestId="req-1234.alpha" />);

    expect(screen.getByTestId("request-id")).toHaveTextContent("req-1234.alpha");
    expect(
      screen.getByText("Mã hỗ trợ: PAYMENT_REVERSAL_EXCEEDS_REMAINING_AMOUNT"),
    ).toBeInTheDocument();
  });

  it("surfaces a request id on an unexpected query failure", () => {
    render(
      <QueryStates
        query={{
          isPending: false,
          isError: true,
          error: {
            meta: {
              response: {
                headers: {
                  get: (name: string) => (name === "x-request-id" ? "req-query-1" : null),
                },
              },
            },
          },
          data: undefined,
        }}
        loadingLabel="Đang tải"
        onRetry={() => undefined}
        children={() => null}
      />,
    );

    expect(screen.getByText("Không kết nối được máy chủ")).toBeInTheDocument();
    expect(screen.getByTestId("request-id")).toHaveTextContent("req-query-1");
  });

  it("unwraps a domain error off a tRPC-shaped failure, and refuses a stray object", () => {
    expect(domainErrorOf({ data: { domainError: rejectionPermissionDenied } })).toEqual(
      rejectionPermissionDenied,
    );
    expect(domainErrorOf({ data: { domainError: { code: "NOT_A_REAL_CODE" } } })).toBeNull();
    expect(domainErrorOf(new Error("network"))).toBeNull();
  });
});
