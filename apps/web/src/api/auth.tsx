"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { e2eBridgeToken, setAccessToken } from "./access-token.ts";
import { supabaseClient, supabaseConfigured } from "./supabase.ts";
import { clearOfflineSessionCache } from "../offline/session-cache.ts";

/**
 * Who is signed in, according to Supabase.
 *
 * The provider does two things and nothing else: it keeps the module-level access
 * token current so a tRPC header callback can read it synchronously, and it tells
 * the tree whether there is a session at all. It holds no user profile, no role
 * and no permissions — those come from `session.me` against the depot the person
 * chose, because they are the server's answer and not the token's (ADR-0011).
 */
export type AuthState =
  /** Supabase has not answered yet. One frame, usually. */
  | { readonly status: "checking" }
  /** No Supabase project configured. A deployment problem with a real screen. */
  | { readonly status: "unconfigured" }
  | { readonly status: "signed_out" }
  | { readonly status: "signed_in"; readonly email: string | null };

export type Auth = AuthState & {
  /** Sends a one-time code to an email that already has an account. */
  requestCode(email: string): Promise<{ ok: true } | { ok: false; message: string }>;
  /** Exchanges the emailed code for a session. */
  submitCode(email: string, code: string): Promise<{ ok: true } | { ok: false; message: string }>;
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
function messageFor(
  error: { message?: string | undefined; status?: number | undefined } | null,
): string {
  const raw = (error?.message ?? "").toLowerCase();
  if (raw.includes("invalid") || raw.includes("expired") || error?.status === 403) {
    return "Mã không đúng hoặc đã hết hạn. Bấm gửi lại để nhận mã mới.";
  }
  if (raw.includes("rate") || error?.status === 429) {
    return "Đã gửi quá nhiều lần. Đợi một phút rồi thử lại.";
  }
  if (raw.includes("signups not allowed") || raw.includes("not found") || error?.status === 400) {
    return "Email này chưa được cấp quyền. Báo chủ vựa để được thêm vào.";
  }
  return "Không đăng nhập được. Kiểm tra mạng rồi thử lại.";
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
    if (e2eBridgeToken() !== null) {
      setState({ status: "signed_in", email: null });
      return;
    }

    const supabase = supabaseClient();
    if (supabase === null) return;

    let cancelled = false;

    /*
     * `getSession` first, then subscribe. Without the first call a returning tab
     * with a valid stored session renders the sign-in screen until something
     * happens to fire an event, which is a person typing their email again for
     * no reason.
     */
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setAccessToken(data.session?.access_token ?? null);
      setState(
        data.session === null
          ? { status: "signed_out" }
          : { status: "signed_in", email: data.session.user.email ?? null },
      );
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      // Covers the refresh as well as sign-in and sign-out: the token a request
      // carries is whatever Supabase last handed us, never a captured copy.
      setAccessToken(session?.access_token ?? null);
      setState(
        session === null
          ? { status: "signed_out" }
          : { status: "signed_in", email: session.user.email ?? null },
      );
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const requestCode = useCallback(async (email: string) => {
    const supabase = supabaseClient();
    if (supabase === null) return { ok: false as const, message: messageFor(null) };

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        /*
         * A depot worker is provisioned by the facilitator before the pilot, so
         * an unknown email is a mistake rather than a new account. Left on, any
         * typo would create a Supabase user with no membership — a person who can
         * sign in and see nothing, which is the most confusing possible outcome.
         */
        shouldCreateUser: false,
      },
    });
    return error === null
      ? { ok: true as const }
      : { ok: false as const, message: messageFor(error) };
  }, []);

  const submitCode = useCallback(async (email: string, code: string) => {
    const supabase = supabaseClient();
    if (supabase === null) return { ok: false as const, message: messageFor(null) };

    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    return error === null
      ? { ok: true as const }
      : { ok: false as const, message: messageFor(error) };
  }, []);

  const signOut = useCallback(async () => {
    clearOfflineSessionCache();
    const supabase = supabaseClient();
    await supabase?.auth.signOut();
    setAccessToken(null);
  }, []);

  const value = useMemo<Auth>(
    () => ({ ...state, requestCode, submitCode, signOut }),
    [state, requestCode, submitCode, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
