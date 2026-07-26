"use client";

import type { Capability, Permission, SessionDto } from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import { Button, type ButtonTone } from "../primitives/button.tsx";
import { messageForCode } from "../copy.ts";

export type CapabilityActionProps = {
  readonly label: string;
  readonly tone?: ButtonTone;
  /** The **state** half: may this be done to *this* sale, right now. */
  readonly capability: Capability;
  /**
   * The **authority** half: may this caller do it at all. Omitted only where the
   * capability already folds authority in — the customer and account ones do,
   * because they are computed in the application layer where the role is at hand.
   */
  readonly permission?: Permission;
  readonly session?: SessionDto;
  readonly onAction: () => void;
  readonly fullWidth?: boolean;
  /** Rendered instead of the reason when the caller wants their own wording. */
  readonly children?: ReactNode;
};

/**
 * The one component that decides whether an action is available, so that decision
 * exists once.
 *
 * It combines the two halves the backend deliberately keeps apart
 * (docs/06-api-contracts/capabilities.md):
 *
 *   session permission   — may I void sales at all      (session.me)
 *   aggregate capability — may I void *this* sale        (the DTO)
 *
 * Sale and payment capabilities carry **state only**: they are computed in the
 * domain kernel, which by construction does not know who is asking. A screen that
 * checked only `capabilities.void.allowed` would offer a void button to a `sales`
 * worker, who would then be refused — a rendering bug rather than a hole, but the
 * kind that teaches people the buttons lie.
 *
 * Authority is checked first, because `PERMISSION_DENIED` sends the user to a
 * person and a state refusal sends them to a different action.
 *
 * Note what this does **not** do: recompute anything. It never asks "does this
 * sale have lines" — the server already answered, with the code it would refuse
 * with, and duplicating the rule here is how the two copies drift.
 */
export function CapabilityAction({
  label,
  tone = "primary",
  capability,
  permission,
  session,
  onAction,
  fullWidth = false,
  children,
}: CapabilityActionProps) {
  const lacksPermission =
    permission !== undefined && session !== undefined && !session.permissions.includes(permission);

  const reason = lacksPermission
    ? messageForCode("PERMISSION_DENIED")
    : !capability.allowed && capability.reasonCode !== undefined
      ? messageForCode(capability.reasonCode)
      : null;

  return (
    <div className={fullWidth ? "flex w-full flex-col gap-1" : "flex flex-col gap-1"}>
      <Button
        tone={tone}
        fullWidth={fullWidth}
        onClick={onAction}
        {...(reason !== null ? { disabledReason: reason } : {})}
      >
        {label}
      </Button>
      {reason !== null ? (
        // Visible, not only a tooltip. Hiding the control *and* the reason is
        // how a worker ends up keeping a paper book instead.
        <p className="text-caption text-ink-muted">{children ?? reason}</p>
      ) : null}
    </div>
  );
}
