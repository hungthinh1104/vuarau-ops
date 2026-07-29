import { describe, expect, it } from "vitest";
import { observeSupabaseAuthPolicy } from "./supabase-auth-settings.ts";

describe("M23 — hosted Supabase authentication policy observation", () => {
  it("never infers that passwordless email is disabled from public settings", () => {
    expect(
      observeSupabaseAuthPolicy({
        external: { email: true },
        disable_signup: true,
        mailer_autoconfirm: true,
      }),
    ).toEqual({
      emailProviderEnabled: true,
      signupDisabled: true,
      emailConfirmationDisabled: true,
      passwordlessEmailCapability: "not_observable",
    });
  });

  it("keeps absent safety settings unknown rather than treating them as disabled", () => {
    expect(observeSupabaseAuthPolicy({ external: { email: true } })).toMatchObject({
      signupDisabled: null,
      emailConfirmationDisabled: null,
      passwordlessEmailCapability: "not_observable",
    });
  });
});
