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
 * **Only the anon key belongs here.** It is a public, publishable key: it
 * identifies the project and nothing else. The JWT *signing* secret verifies
 * tokens and lives in the API process, never in a bundle a phone downloads. The
 * two are easy to confuse because both are called "a Supabase key", so this file
 * reads exactly two environment variables and would fail loudly on a third.
 */
const SUPABASE_URL = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const SUPABASE_ANON_KEY = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];

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
