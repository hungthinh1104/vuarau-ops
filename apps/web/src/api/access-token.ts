/**
 * Where the bearer token comes from.
 *
 * Supabase owns the session — the sign-in, the refresh, the storage — and this
 * app deliberately reimplements none of it (ADR-0010). What it owns is the one
 * question every request asks: *what is the access token right now?*
 *
 * A getter rather than a value, because that is what makes a refresh invisible.
 * A token captured once at mount is a token that expires mid-shift, and the
 * failure looks like "the app randomly signs me out".
 *
 * The live answer is held in a module variable that `AuthProvider` keeps current
 * from `onAuthStateChange`. That is not a second session store: Supabase's client
 * is still the only thing that knows whether there *is* a session, and this is a
 * synchronous read of what it last said, because a tRPC header callback cannot
 * await.
 */
export const TOKEN_KEY = "vuarau.access_token";

export type AccessTokenSource = () => string | null;

let liveAccessToken: string | null = null;

/** Called by `AuthProvider` on every Supabase auth event, and nowhere else. */
export function setAccessToken(token: string | null): void {
  liveAccessToken = token;
}

/**
 * The end-to-end suite's way in, and the reason it is a named door rather than a
 * hole.
 *
 * Playwright runs against a real API and a real database but **no Supabase
 * project** — CI has none, and standing one up would make the suite depend on a
 * third party to answer questions about Postgres rows. So the harness mints a
 * token against the API's configured secret and writes it where this reads.
 *
 * Two locks, and both must be open:
 *
 *   1. `NEXT_PUBLIC_E2E_AUTH_BRIDGE=1` — set by the Playwright web server only.
 *   2. `NODE_ENV !== "production"` — so a production build cannot open it at all.
 *      Next replaces this comparison with a literal at build time and removes the
 *      branch, which means the bridge is not merely disabled in a production
 *      bundle; it is not in it.
 *
 * TC-WEB-024 asserts that an injected token is ignored with the flag unset,
 * because "off by default" is the property that matters and it is one line to
 * break by accident.
 */
export function e2eBridgeToken(): string | null {
  if (process.env.NODE_ENV === "production") return null;
  if (process.env["NEXT_PUBLIC_E2E_AUTH_BRIDGE"] !== "1") return null;
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function decodeJwtSubject(token: string): string | null {
  const payload = token.split(".")[1];
  if (payload === undefined) return null;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const normalized = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const decoded = JSON.parse(window.atob(normalized)) as { sub?: unknown };
    return typeof decoded.sub === "string" && decoded.sub.length > 0 ? decoded.sub : null;
  } catch {
    return null;
  }
}

/** Subject is used only to partition browser state; API identity still comes from verified JWT. */
export function e2eBridgeSubject(): string | null {
  const token = e2eBridgeToken();
  return token === null ? null : decodeJwtSubject(token);
}

export function clearE2eBridgeToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage unavailable already means the bridge cannot survive a reload.
  }
}

/**
 * The current access token, or null when nobody is signed in.
 *
 * No `sessionStorage` read on the normal path. The token a request carries is the
 * one Supabase currently holds, so signing out or letting a session expire takes
 * effect immediately rather than leaving a copy behind that still authenticates.
 */
export const browserAccessToken: AccessTokenSource = () => liveAccessToken ?? e2eBridgeToken();
