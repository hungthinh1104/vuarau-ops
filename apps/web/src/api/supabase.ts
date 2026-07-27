"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The Supabase browser client, and the one place it is constructed.
 *
 * Supabase owns authentication: the sign-in, the code, the session, the refresh
 * ([ADR-0010](../../../../docs/09-decisions/ADR-0010-supabase-jwt-verification.md)).
 * This app verifies tokens on the server and reimplements none of the rest — a
 * second implementation of "is this person signed in" is a second answer to it.
 *
 * **Only the publishable key belongs here.** It identifies the project and
 * authorises nothing on its own. Supabase's *secret* key — `sb_secret_…`, formerly
 * the service-role key — bypasses row-level security entirely, and this
 * application never uses it: tokens are verified against JWKS, so nothing here
 * calls Supabase with privilege. It must not appear in any environment this app
 * reads, let alone one prefixed `NEXT_PUBLIC_`.
 *
 * Both spellings are accepted. Supabase renamed anon → publishable in 2025, and a
 * deployment mid-rename should not be a deployment that cannot sign anybody in.
 */
const SUPABASE_URL = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const SUPABASE_ANON_KEY =
  process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] ??
  process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];

/** Configured means both values are present. Neither is useful alone. */
export const supabaseConfigured =
  typeof SUPABASE_URL === "string" &&
  SUPABASE_URL.length > 0 &&
  typeof SUPABASE_ANON_KEY === "string" &&
  SUPABASE_ANON_KEY.length > 0;

let client: SupabaseClient | null = null;

/**
 * Null when the project is not configured, rather than a client that throws on
 * first use. An unconfigured deployment is a real state with a real screen — a
 * facilitator who has not set the variables yet needs to be told which ones.
 */
export function supabaseClient(): SupabaseClient | null {
  if (!supabaseConfigured) return null;
  client ??= createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: {
      /*
       * `sessionStorage`, not `localStorage`: a depot phone is handed around, and
       * a session that outlives the tab is a session the next person inherits.
       * The same reasoning the access token already followed.
       */
      storage: typeof window === "undefined" ? undefined : window.sessionStorage,
      persistSession: true,
      autoRefreshToken: true,
      /*
       * Off, because this app never receives a session in a URL. Sign-in is an
       * emailed code typed into the form, so there is no callback route and no
       * fragment to parse — and a client that parses one is a client that can be
       * handed a session by a link somebody else wrote.
       */
      detectSessionInUrl: false,
    },
  });
  return client;
}
