"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  clearE2eBridgeToken,
  e2eBridgeSubject,
  e2eBridgeToken,
  setAccessToken,
} from "./access-token.ts";
import { supabaseClient, supabaseConfigured } from "./supabase.ts";
import { clearIdentityBrowserState, clearIdentityQueryState } from "./identity-lifecycle.ts";

/**
 * Who is signed in, according to Supabase.
 *
 * The provider keeps the module-level access token current, exposes the Supabase
 * subject that partitions browser state, and destroys the previous subject's
 * authority caches on a transition. It holds no business profile, role or
 * permissions — those come from `session.me` against the depot the person chose,
 * because they are the server's answer and not the token's (ADR-0011).
 */
export type AuthState =
  /** Supabase has not answered yet. One frame, usually. */
  | { readonly status: "checking" }
  /** No Supabase project configured. A deployment problem with a real screen. */
  | { readonly status: "unconfigured" }
  | { readonly status: "signed_out" }
  | { readonly status: "signed_in"; readonly subject: string; readonly email: string | null };

export type Auth = AuthState & {
  signIn(email: string, password: string): Promise<{ ok: true } | { ok: false; message: string }>;
  signOut(): Promise<void>;
};

const AuthContext = createContext<Auth | null>(null);

export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (auth === null) {
    throw new Error("useAuth() outside <AuthProvider>.");
  }
  return auth;
}

/**
 * Vietnamese, keyed by what happened rather than by Supabase's message.
 *
 * Supabase's strings are English, change between releases, and describe the API
 * rather than the situation. The same rule the rejection-code copy follows: a
 * message a worker reads must say what to do next.
 */
export function signInErrorMessage(
  error: { message?: string | undefined; status?: number | undefined } | null,
): string {
  const raw = (error?.message ?? "").toLowerCase();
  if (raw.includes("rate") || error?.status === 429) {
    return "Đã thử đăng nhập quá nhiều lần. Đợi một phút rồi thử lại.";
  }
  if (
    raw.includes("invalid login credentials") ||
    raw.includes("invalid credentials") ||
    error?.status === 400 ||
    error?.status === 403
  ) {
    return "Email hoặc mật khẩu không đúng.";
  }
  if (raw.includes("fetch") || raw.includes("network") || raw.includes("timeout")) {
    return "Không kết nối được dịch vụ đăng nhập. Kiểm tra mạng rồi thử lại.";
  }
  return "Không đăng nhập được. Thử lại sau hoặc báo người vận hành.";
}

type PasswordAuth = {
  signInWithPassword(credentials: { email: string; password: string }): Promise<{
    error: { message?: string | undefined; status?: number | undefined } | null;
  }>;
};

export async function authenticateWithPassword(
  auth: PasswordAuth | null,
  email: string,
  password: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (auth === null) {
    return {
      ok: false,
      message: "Đăng nhập chưa được cấu hình. Báo người cài đặt hệ thống.",
    };
  }
  try {
    const { error } = await auth.signInWithPassword({ email, password });
    return error === null ? { ok: true } : { ok: false, message: signInErrorMessage(error) };
  } catch (error) {
    return {
      ok: false,
      message: signInErrorMessage(error instanceof Error ? error : null),
    };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(
    supabaseConfigured ? { status: "checking" } : { status: "unconfigured" },
  );

  useEffect(() => {
    /*
     * The end-to-end bridge, and the only place the rest of the app has to know
     * it exists. Playwright runs against a real API and a real database but no
     * Supabase project, so a minted token stands in for a session — behind the
     * two locks in `access-token.ts`, neither of which a production build can
     * open (TC-WEB-024).
     *
     * Checked in the effect rather than in the initial state so the server's HTML
     * and the client's first render agree; `sessionStorage` does not exist on the
     * server.
     */
    const bridgeToken = e2eBridgeToken();
    const bridgeSubject = e2eBridgeSubject();
    if (bridgeToken !== null && bridgeSubject !== null) {
      setAccessToken(bridgeToken);
      setState({ status: "signed_in", subject: bridgeSubject, email: null });
      return;
    }

    const supabase = supabaseClient();
    if (supabase === null) return;

    let cancelled = false;
    let authEventSeen = false;

    /*
     * `getSession` first, then subscribe. Without the first call a returning tab
     * with a valid stored session renders the sign-in screen until something
     * happens to fire an event, which is a person typing their email again for
     * no reason.
     */
    let activeSubject: string | null = null;
    let transitionVersion = 0;

    const applySession = async (
      session: {
        access_token: string;
        user: { id: string; email?: string | undefined };
      } | null,
    ) => {
      const version = ++transitionVersion;
      const nextSubject = session?.user.id ?? null;
      if (activeSubject !== null && activeSubject !== nextSubject) {
        setAccessToken(null);
        await clearIdentityQueryState();
        clearIdentityBrowserState(activeSubject);
      }
      if (cancelled || version !== transitionVersion) return;
      activeSubject = nextSubject;
      setAccessToken(session?.access_token ?? null);
      setState(
        session === null
          ? { status: "signed_out" }
          : {
              status: "signed_in",
              subject: session.user.id,
              email: session.user.email ?? null,
            },
      );
    };

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled || authEventSeen) return;
      void applySession(data.session);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventSeen = true;
      // Covers the refresh as well as sign-in and sign-out: the token a request
      // carries is whatever Supabase last handed us, never a captured copy.
      void applySession(session);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = supabaseClient();
    return authenticateWithPassword(supabase?.auth ?? null, email, password);
  }, []);

  const signOut = useCallback(async () => {
    const subject = state.status === "signed_in" ? state.subject : null;
    setAccessToken(null);
    await clearIdentityQueryState();
    if (subject !== null) clearIdentityBrowserState(subject);
    const supabase = supabaseClient();
    try {
      await supabase?.auth.signOut();
    } finally {
      clearE2eBridgeToken();
      setAccessToken(null);
      setState({ status: "signed_out" });
    }
  }, [state]);

  const value = useMemo<Auth>(() => ({ ...state, signIn, signOut }), [state, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
