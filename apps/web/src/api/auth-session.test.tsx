import { act, render, screen, waitFor } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect, useState } from "react";

const supabase = vi.hoisted(() => {
  let listener: ((event: string, session: unknown) => void) | null = null;
  return {
    get listener() {
      return listener;
    },
    setListener(value: ((event: string, session: unknown) => void) | null) {
      listener = value;
    },
    getSession: vi.fn(async () => ({ data: { session: null } })),
    signOut: vi.fn(async () => ({ error: null })),
    signInWithPassword: vi.fn(async () => ({ error: null })),
    unsubscribe: vi.fn(),
  };
});

vi.mock("./supabase.ts", () => ({
  supabaseConfigured: true,
  supabaseClient: () => ({
    auth: {
      getSession: supabase.getSession,
      signOut: supabase.signOut,
      signInWithPassword: supabase.signInWithPassword,
      onAuthStateChange: (listener: (event: string, session: unknown) => void) => {
        supabase.setListener(listener);
        return { data: { subscription: { unsubscribe: supabase.unsubscribe } } };
      },
    },
  }),
}));

import { AuthProvider, useAuth } from "./auth.tsx";
import { ApiProvider } from "./providers.tsx";
import { browserAccessToken } from "./access-token.ts";
import { cacheSession, cachedSession } from "@/offline/session-cache.ts";
import { storeWorkspaceId, storedWorkspaceId } from "./workspace.ts";
import { salesSession } from "@/fixtures/session.fixtures.ts";
import { WORKSPACE_ID } from "@vuarau/test-fixtures/ids";

const SUBJECT = "supabase-subject-a";
const session = (token: string) => ({
  access_token: token,
  user: { id: SUBJECT, email: "a@example.com" },
});

function Probe() {
  const auth = useAuth();
  return (
    <>
      <output aria-label="auth-state">
        {auth.status === "signed_in" ? `${auth.status}:${auth.subject}` : auth.status}
      </output>
      <button type="button" onClick={() => void auth.signOut()}>
        logout
      </button>
    </>
  );
}

function QueryProbe() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [value, setValue] = useState<string | undefined>();
  useEffect(() => {
    if (auth.status === "signed_in") {
      queryClient.setQueryData(["actor-sensitive"], "A-only");
    }
    setValue(queryClient.getQueryData(["actor-sensitive"]));
    return queryClient.getQueryCache().subscribe(() => {
      setValue(queryClient.getQueryData(["actor-sensitive"]));
    });
  }, [auth.status, queryClient]);
  return <output aria-label="query-data">{value}</output>;
}

describe("TC-WEB-028 — Supabase session lifecycle", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    supabase.setListener(null);
    supabase.getSession.mockClear();
    supabase.signOut.mockClear();
  });

  it("uses refreshed tokens and clears authority when the session expires", async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByLabelText("auth-state")).toHaveTextContent("signed_out"),
    );

    await act(async () => supabase.listener?.("SIGNED_IN", session("token-1")));
    await waitFor(() =>
      expect(screen.getByLabelText("auth-state")).toHaveTextContent(`signed_in:${SUBJECT}`),
    );
    expect(browserAccessToken()).toBe("token-1");

    storeWorkspaceId(SUBJECT, WORKSPACE_ID);
    cacheSession(SUBJECT, WORKSPACE_ID, salesSession);
    await act(async () => supabase.listener?.("TOKEN_REFRESHED", session("token-2")));
    await waitFor(() => expect(browserAccessToken()).toBe("token-2"));
    expect(storedWorkspaceId(SUBJECT)).toBe(WORKSPACE_ID);

    await act(async () => supabase.listener?.("SIGNED_OUT", null));
    await waitFor(() =>
      expect(screen.getByLabelText("auth-state")).toHaveTextContent("signed_out"),
    );
    expect(browserAccessToken()).toBeNull();
    expect(storedWorkspaceId(SUBJECT)).toBeNull();
    expect(cachedSession(SUBJECT, WORKSPACE_ID)).toBeNull();
  });

  it("does not let a stale getSession result overwrite a newer auth event", async () => {
    let resolveInitial: ((value: { data: { session: null } }) => void) | undefined;
    supabase.getSession.mockImplementationOnce(
      async () =>
        new Promise<{ data: { session: null } }>((resolve) => {
          resolveInitial = resolve;
        }),
    );
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await act(async () => supabase.listener?.("SIGNED_IN", session("new-token")));
    await waitFor(() =>
      expect(screen.getByLabelText("auth-state")).toHaveTextContent(`signed_in:${SUBJECT}`),
    );
    await act(async () => resolveInitial?.({ data: { session: null } }));

    expect(screen.getByLabelText("auth-state")).toHaveTextContent(`signed_in:${SUBJECT}`);
    expect(browserAccessToken()).toBe("new-token");
  });

  it("clears QueryClient before completing explicit logout", async () => {
    render(
      <AuthProvider>
        <ApiProvider>
          <Probe />
          <QueryProbe />
        </ApiProvider>
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByLabelText("auth-state")).toHaveTextContent("signed_out"),
    );
    await act(async () => supabase.listener?.("SIGNED_IN", session("token-1")));
    await waitFor(() => expect(screen.getByLabelText("query-data")).toHaveTextContent("A-only"));

    await act(async () => screen.getByRole("button", { name: "logout" }).click());

    await waitFor(() =>
      expect(screen.getByLabelText("auth-state")).toHaveTextContent("signed_out"),
    );
    expect(supabase.signOut).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("query-data")).not.toHaveTextContent("A-only");
    expect(browserAccessToken()).toBeNull();
  });
});
