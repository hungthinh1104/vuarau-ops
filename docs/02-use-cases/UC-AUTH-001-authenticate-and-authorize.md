# UC-AUTH-001 — Authenticate and authorize a request

**Risk:** P0 · **Status:** implemented (Milestone 1) · Applies to **every**
command and query.

## Intent

Establish who is calling, from a credential they cannot forge, and decide what
that person's role lets them do — before any business data is read or written.

## Actor

A depot owner or worker holding a Supabase session.

## Main flow

1. The client sends `Authorization: Bearer <supabase access token>`.
2. The transport verifies the token: signature, `exp`, `iss`, `aud`, with the
   algorithm pinned to the configured key material (BR-AUTH-001).
3. The verified `sub` claim is resolved to a local actor via
   `actors.supabase_user_id` (BR-AUTH-005). The result is the **principal**.
4. The procedure runs. Inside the command transaction, before any business read:
   1. `command.actorId` must equal the principal's actor (BR-AUTH-002);
   2. a membership must exist for that actor in the target workspace;
   3. it must be active (BR-AUTH-003);
   4. its role must carry the command's declared permission (BR-AUTH-004).
5. Only then does the handler load aggregates and call the domain.

Steps 4.1–4.4 happen **before** the idempotency key is claimed, so an
unauthorized caller cannot burn a key the rightful actor is about to use.

## Alternate flows

| Situation                                          | Outcome                                                        |
| -------------------------------------------------- | -------------------------------------------------------------- |
| No `Authorization` header                          | `AUTHENTICATION_REQUIRED` (401)                                |
| Expired, forged, wrong issuer, or wrong audience   | `AUTHENTICATION_INVALID` (401) — the reason is never disclosed |
| `alg: none` or an algorithm the key cannot produce | `AUTHENTICATION_INVALID`                                       |
| Valid token, no matching actor                     | `ACTOR_NOT_FOUND` (403)                                        |
| `actorId` names somebody else                      | `ACTOR_IMPERSONATION_DENIED` (403)                             |
| Not a member of the workspace                      | `WORKSPACE_ACCESS_DENIED` (403)                                |
| Membership revoked                                 | `WORKSPACE_MEMBERSHIP_INACTIVE` (403)                          |
| Role lacks the permission                          | `PERMISSION_DENIED` (403), naming the permission and role      |

## Postconditions

- On refusal: **nothing** is written — no ledger entry, no audit record, no
  command receipt, and the idempotency key stays unused.
- On success: every row the command writes is attributed to the _authenticated_
  actor, not to whoever the request claimed.

## Business rules

BR-AUTH-001, BR-AUTH-002, BR-AUTH-003, BR-AUTH-004, BR-AUTH-005, BR-AUTH-006,
BR-CUSTOMER-002

## Tests

TC-AUTH-001 … TC-AUTH-011, TC-CUSTOMER-002, TC-CUSTOMER-003

## Implementation

- `apps/api/src/infrastructure/auth/jwt-verifier.ts`
- `apps/api/src/infrastructure/auth/principal.ts`
- `apps/api/src/infrastructure/trpc/context.ts`
- `apps/api/src/modules/shared/authorization.ts`
- `apps/api/src/modules/shared/command-pipeline.ts`

## Known gaps

- Supabase JWTs are verified, but nothing checks a **revocation list**: a token
  stays valid until it expires, even if the membership is deactivated
  mid-session. Access is re-checked per request, so a revoked _membership_ takes
  effect immediately (BR-AUTH-003); a revoked _session_ does not.
- Failed authentication is covered by the per-client API transport bucket. There
  is no separate credential-aware or adaptive authentication limiter.
- Postgres row-level security is not enabled (ASM-009); isolation is enforced in
  the application layer only.
