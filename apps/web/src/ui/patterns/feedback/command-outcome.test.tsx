import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import { mintCommandIdentity } from "@/api/command-identity.ts";
import { ACTOR_ID, WORKSPACE_ID } from "@vuarau/test-fixtures/ids";
import { CommandOutcome } from "./command-outcome.tsx";

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

function succeededCommand(): CommandOutcomeView {
  return {
    phase: { kind: "succeeded" },
    pending: {
      identity: mintCommandIdentity({ workspaceId: WORKSPACE_ID, actorId: ACTOR_ID }),
      attempts: 1,
    },
    error: null,
    requestId: null,
    wasDuplicateSafeRetry: false,
    resend: async () => undefined,
  };
}

describe("CommandOutcome success feedback", () => {
  it("uses one ephemeral toast and no persistent success notice", () => {
    const command = succeededCommand();
    const view = render(
      <CommandOutcome
        command={command}
        attemptedAction="Lưu phiếu giao"
        onReload={() => undefined}
      />,
    );

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledTimes(1);

    view.rerender(
      <CommandOutcome
        command={command}
        attemptedAction="Lưu phiếu giao"
        onReload={() => undefined}
      />,
    );
    expect(toast.success).toHaveBeenCalledTimes(1);
  });
});
