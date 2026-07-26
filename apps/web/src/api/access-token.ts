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
 * There is no sign-in screen yet. Until there is, whatever holds the Supabase
 * session writes the access token to `sessionStorage` under `TOKEN_KEY`, and the
 * pilot harness does the same with a token minted against the API's configured
 * secret. Both paths produce a **real** token that the real verifier checks; what
 * is missing is the screen, not the verification.
 */
export const TOKEN_KEY = "vuarau.access_token";

export type AccessTokenSource = () => string | null;

/**
 * Reads the current token on every call. `sessionStorage`, not `localStorage`: a
 * depot phone is handed around, and a token that outlives the tab is a token the
 * next person inherits.
 */
export const browserAccessToken: AccessTokenSource = () => {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    // Private browsing and some embedded webviews throw on storage access.
    // No token is a state the app already renders; a crash is not.
    return null;
  }
};

export function setAccessToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token === null) window.sessionStorage.removeItem(TOKEN_KEY);
    else window.sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Same as above: unavailable storage is not worth a crash.
  }
}
