# Pilot authentication — password accounts and identity boundary

The pilot uses Supabase email/password authentication. Supabase owns credentials,
sessions, refresh and JWT issuance. PostgreSQL owns Actors, workspace memberships,
roles, permissions and business truth. The API has no login endpoint and stores no
password, password hash, access token, refresh token, OAuth token or Supabase
session.

## Supabase dashboard configuration

Configure the pilot project before provisioning users:

| Setting                 | Required pilot value                         |
| ----------------------- | -------------------------------------------- |
| Email/password          | enabled                                      |
| Public signup           | disabled                                     |
| Email confirmation      | disabled while SMTP is unavailable           |
| Email OTP / Magic Link  | unused; do not offer it to pilot users       |
| Anonymous signup        | disabled                                     |
| Password-recovery email | disabled until SMTP is configured and tested |

Only pre-provisioned users may authenticate. Password recovery is an
operator-assisted reset in the Supabase dashboard. Never ask a user to send their
password, and never record it in a ticket, worksheet, repository or application
database.

Provisioning is explicit:

1. create the Supabase email/password user;
2. copy that user's Supabase UUID;
3. link it to the intended local Actor through the pilot provisioning command;
4. assign the intended workspace membership and role;
5. run pilot readiness and the real deployment smoke below.

Do not add a service-role/secret key to the application runtime. The browser needs
only the project URL and publishable key; the API verifies the resulting JWT using
JWKS.

## Runtime flow

```text
/login
→ Supabase signInWithPassword
→ session.workspaces (derived from verified JWT sub)
→ /select-workspace (always explicit)
→ session.me(workspaceId)
→ protected application
```

The browser partitions QueryClient, workspace selection and offline session/
permission caches by Supabase subject. Logout, expiry, remote sign-out and an A→B
subject change cancel and clear the old identity before the new one renders.

## Required deployment smoke

The deterministic Playwright suite injects a signed JWT so CI can exercise the
real API and PostgreSQL without depending on a hosted identity provider. That is
not evidence that the deployed Supabase project is configured correctly.

On the deployed pilot URL, use one real pre-provisioned account:

```text
real email/password login
→ real Supabase JWT
→ API JWKS verification
→ local Actor resolution
→ server workspace discovery
→ explicit workspace selection
→ session.me
→ logout
```

Then repeat with a second account in the same tab. The second account must choose
its workspace explicitly and must not see the first account's role, permissions,
workspace selection or cached data. Record only timestamp, release SHA, anonymised
actor/workspace references and pass/fail. Do not retain credentials or tokens.

## Future OAuth boundary

`/auth/callback` is reserved for a future Supabase PKCE code exchange. OAuth may be
added through `signInWithOAuth`, but the resulting Supabase JWT must follow the
same `sub → Actor → membership` pipeline. It must not auto-create an Actor,
workspace or membership, and it requires no business-database schema change when
the provider identity resolves to the existing Supabase user. Provider tokens are
not stored unless a future provider-API feature explicitly requires them.
