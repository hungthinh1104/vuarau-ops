import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("../../../api/session-gate.tsx", () => ({
  useSession: () => ({
    workspaceId: "00000000-0000-0000-0000-000000000000",
    workspaceName: "Vựa thử",
    session: {},
  }),
}));

import SelectWorkspacePage from "./page.tsx";

describe("TC-WEB-031 — selected workspace opens the operational entry", () => {
  it("routes to Today after the server session has resolved", async () => {
    render(<SelectWorkspacePage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/today"));
  });
});
