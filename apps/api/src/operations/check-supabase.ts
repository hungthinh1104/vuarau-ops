import { createSupabaseJwtVerifier } from "../infrastructure/auth/jwt-verifier.ts";
import {
  observeSupabaseAuthPolicy,
  type PublicSupabaseAuthSettings,
} from "./supabase-auth-settings.ts";

/**
 * Talks to a **real** Supabase project and reports whether sign-in would work.
 *
 *   pnpm --filter @vuarau/api ops:check-supabase [--token <access token>]
 *
 * `ops:check-env` judges variables in isolation — it can tell you a URL is
 * present and shaped like a URL, and nothing more. This one makes the requests:
 * is the project reachable, is the anon key the project's, does the JWKS endpoint
 * hold keys, does the configured issuer match, and — given a token — does the
 * **real verifier** accept it.
 *
 * The gap between those two matters. A project ref with one wrong character
 * passes every static check and fails on the first person trying to sign in, at a
 * loading bay, with a facilitator watching.
 *
 * Only public values are used: the project URL and the publishable anon key. No
 * value is printed. A token passed with `--token` is verified and reported as a
 * subject prefix, never echoed.
 */

type Check = { readonly name: string; readonly ok: boolean; readonly detail: string };
const results: Check[] = [];
const record = (name: string, ok: boolean, detail: string) => results.push({ name, ok, detail });
const notes: readonly string[] = [
  "The application exposes signInWithPassword only. The public Supabase settings " +
    "endpoint does not expose magic_link_enabled, so this checker cannot prove that " +
    "hosted OTP/Magic Link capability is disabled.",
];

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  return value === undefined || value.startsWith("--") ? null : value;
}

const projectUrl = (flag("url") ?? process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "").replace(
  /\/$/,
  "",
);
/**
 * Publishable, under any of its names. Supabase renamed anon → publishable in
 * 2025, and both spellings are in the wild; a checker that knew only one would
 * report "no key" to somebody who had set one.
 */
const anonKey =
  flag("anon-key") ??
  process.env["SUPABASE_PUBLISHABLE_KEY"] ??
  process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] ??
  process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ??
  "";
const configuredIssuer = process.env["SUPABASE_JWT_ISSUER"] ?? "";
const configuredJwks = process.env["SUPABASE_JWKS_URL"] ?? "";
const audience = process.env["SUPABASE_JWT_AUDIENCE"] ?? "authenticated";

if (projectUrl.length === 0) {
  console.error("✗ nothing to connect to.\n");
  console.error("  NEXT_PUBLIC_SUPABASE_URL       the project URL, e.g. https://abcd.supabase.co");
  console.error("  SUPABASE_PUBLISHABLE_KEY       the publishable key (optional here)");
  console.error("\nBoth are public. Supabase dashboard → Project Settings → API.");
  console.error("Or pass them: --url <…> [--anon-key <…>]");
  process.exit(2);
}

/*
 * The anon key is optional, and that is deliberate rather than lax. Reachability,
 * the signing keys and the issuer are answerable without it — which is exactly the
 * state somebody is in when they have a project ref and have not finished wiring
 * the browser yet. Refusing to answer any of it until every value is present is
 * how a checker becomes the thing people skip.
 */
const canCheckKey = anonKey.length > 0;

const timeout = (ms: number) => AbortSignal.timeout(ms);

/**
 * 1. Is anything there at all? Catches a typo in the project ref immediately.
 *
 * **Any HTTP status counts as reachable**, including 401. That is not leniency: a
 * live project answers `/auth/v1/health` with 401 until an apikey is presented, so
 * requiring 2xx here reported a perfectly healthy project as unreachable — which
 * is worse than no check, because it sends somebody looking at DNS. Only a thrown
 * error — no DNS, no route, no TLS, timeout — means nothing is there.
 */
try {
  const response = await fetch(`${projectUrl}/auth/v1/health`, { signal: timeout(8000) });
  const wrongPath = response.status === 404;
  record(
    "project reachable",
    !wrongPath,
    wrongPath
      ? `${projectUrl} → 404: something answers, but it is not a Supabase auth server`
      : `${projectUrl} → ${response.status} (a live host answered)`,
  );
} catch (error) {
  record("project reachable", false, `${projectUrl} → ${(error as Error).message}`);
}

/**
 * 2. Is the publishable key this project's, and is password sign-in on?
 *
 * `/auth/v1/settings` is the endpoint the browser client itself reads. A wrong
 * key answers 401 here rather than at the first code request, and the response
 * says whether email auth is enabled, sign-up is disabled, and email confirmation
 * is bypassed. With no SMTP, all three are required for pre-provisioned password
 * accounts to authenticate without opening a public account-creation path.
 */
let signupDisabled: boolean | null = null;
if (!canCheckKey) {
  record(
    "anon key accepted",
    false,
    "not supplied — the browser cannot sign anybody in without it " + "(SUPABASE_PUBLISHABLE_KEY)",
  );
} else
  try {
    const response = await fetch(`${projectUrl}/auth/v1/settings`, {
      headers: { apikey: anonKey, authorization: `Bearer ${anonKey}` },
      signal: timeout(8000),
    });
    if (!response.ok) {
      record("anon key accepted", false, `settings → ${response.status} (key rejected)`);
    } else {
      const settings = (await response.json()) as PublicSupabaseAuthSettings;
      const observation = observeSupabaseAuthPolicy(settings);
      const emailEnabled = observation.emailProviderEnabled;
      signupDisabled = observation.signupDisabled;
      const emailConfirmationDisabled = observation.emailConfirmationDisabled;

      record("anon key accepted", true, "settings answered");
      record(
        "email/password sign-in enabled",
        emailEnabled,
        emailEnabled
          ? "external.email = true"
          : "external.email = false — password sign-in is disabled",
      );
      record(
        "public sign-up disabled",
        signupDisabled === true,
        signupDisabled === true
          ? "disable_signup = true"
          : signupDisabled === false
            ? "disable_signup = false — STOP: the project can create accounts outside the app"
            : "settings did not report disable_signup — verify it in Supabase before the pilot",
      );
      record(
        "email confirmation disabled while SMTP is unavailable",
        emailConfirmationDisabled === true,
        emailConfirmationDisabled === true
          ? "mailer_autoconfirm = true"
          : emailConfirmationDisabled === false
            ? "mailer_autoconfirm = false — pre-provisioned users may be blocked waiting for email"
            : "settings did not report mailer_autoconfirm — verify it in Supabase before the pilot",
      );
    }
  } catch (error) {
    record("anon key accepted", false, (error as Error).message);
  }

/**
 * 3. Does the JWKS endpoint hold keys?
 *
 * The pilot environment refuses HS256 (BR-OPS-002), so this is the difference
 * between a project that can run a pilot and one that cannot. A legacy project
 * answers with an **empty** key set — reachable, and useless — which is exactly
 * the failure a status check alone would miss.
 */
const jwksUrl =
  configuredJwks.length > 0 ? configuredJwks : `${projectUrl}/auth/v1/.well-known/jwks.json`;
let keyCount = 0;
try {
  const response = await fetch(jwksUrl, { signal: timeout(8000) });
  const body = (await response.json()) as { keys?: { alg?: string }[] };
  keyCount = body.keys?.length ?? 0;
  const algorithms = [...new Set((body.keys ?? []).map((key) => key.alg ?? "?"))].join(", ");
  record(
    "JWKS has signing keys",
    keyCount > 0,
    keyCount > 0
      ? `${keyCount} key(s): ${algorithms}`
      : "empty key set — this project still signs with the legacy HS256 secret, " +
          "which APP_ENV=pilot refuses. Turn on JWT signing keys in the dashboard.",
  );
} catch (error) {
  record("JWKS has signing keys", false, `${jwksUrl} → ${(error as Error).message}`);
}

/**
 * 4. Does the configured issuer match the project?
 *
 * A mismatch verifies nothing and rejects everything: the token says one issuer,
 * the server insists on another, and every sign-in ends in
 * `AUTHENTICATION_INVALID` with no clue why.
 */
const expectedIssuer = `${projectUrl}/auth/v1`;
record(
  "SUPABASE_JWT_ISSUER matches the project",
  configuredIssuer === expectedIssuer,
  configuredIssuer.length === 0
    ? "not set — should be " + expectedIssuer
    : configuredIssuer === expectedIssuer
      ? configuredIssuer
      : `configured ${configuredIssuer}, project is ${expectedIssuer}`,
);

/**
 * 5. The whole chain, if a token was supplied.
 *
 * Not a re-implementation: this is the same `createSupabaseJwtVerifier` the API
 * uses on every request. Passing here means a real sign-in would produce a
 * principal — the only claim worth making about authentication.
 */
const token = flag("token");
if (token !== null && keyCount > 0) {
  try {
    const verifier = createSupabaseJwtVerifier({ issuer: expectedIssuer, audience, jwksUrl });
    const verified = await verifier.verify(token);
    record(
      "a real token verifies through the real verifier",
      verified.ok,
      verified.ok
        ? `sub ${verified.value.subject.slice(0, 8)}… — this would resolve to an actor`
        : verified.error.code,
    );
  } catch (error) {
    record("a real token verifies through the real verifier", false, (error as Error).message);
  }
}

for (const check of results) {
  console.warn(`  ${check.ok ? "✓" : "✗"} ${check.name}`);
  console.warn(`      ${check.detail}`);
}
for (const note of notes) console.warn(`  • provider boundary\n      ${note}`);

const failed = results.filter((check) => !check.ok);
console.warn(`\n${results.length - failed.length}/${results.length} checks passed.`);

if (failed.length === 0) {
  if (token === null) {
    console.warn(
      "\nNo token was checked. Sign in on the device, copy the access token, and " +
        "re-run with --token <jwt> to prove the whole chain.",
    );
  }
  process.exit(0);
}

console.error(`\n✗ ${failed.length} check(s) failed. Sign-in would not work.`);
process.exit(1);
