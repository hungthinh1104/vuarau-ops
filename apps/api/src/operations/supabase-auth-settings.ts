export type PublicSupabaseAuthSettings = {
  readonly external?: Readonly<Record<string, boolean>>;
  readonly disable_signup?: boolean;
  readonly mailer_autoconfirm?: boolean;
};

export type SupabaseAuthPolicyObservation = {
  readonly emailProviderEnabled: boolean;
  readonly signupDisabled: boolean | null;
  readonly emailConfirmationDisabled: boolean | null;
  /**
   * `/auth/v1/settings` deliberately does not expose the Auth server's
   * `magic_link_enabled` configuration. Absence is not evidence of `false`.
   */
  readonly passwordlessEmailCapability: "not_observable";
};

export function observeSupabaseAuthPolicy(
  settings: PublicSupabaseAuthSettings,
): SupabaseAuthPolicyObservation {
  return {
    emailProviderEnabled: settings.external?.["email"] ?? false,
    signupDisabled: settings.disable_signup ?? null,
    emailConfirmationDisabled: settings.mailer_autoconfirm ?? null,
    passwordlessEmailCapability: "not_observable",
  };
}
