# ADR-0010 — Verify Supabase JWTs at the API boundary

**Status:** accepted · 2026-07-26

## Context

The bootstrap accepted `actorId` from the request body. Anyone who could reach the
API could attribute a debt adjustment to the depot owner, and the audit trail —
the thing that makes a contested balance answerable — was decorative.

Supabase issues access tokens. Something has to verify them, resolve them to a
local actor, and do so before any business logic runs.

## Decision

1. A bearer token is verified at the transport boundary. Verification checks the
   signature, `exp`, `iss`, and `aud`, with the algorithm **pinned** to what the
   configured key material can produce — never read from the token header.
2. The verified `sub` resolves to a local actor through
   `actors.supabase_user_id`. That actor is the principal; nothing downstream
   trusts the request body for identity.
3. Only `sub` is used. Supabase's `role` and `app_metadata` claims are ignored:
   authorization comes from `workspace_memberships`, which the depot controls
   ([ADR-0011](ADR-0011-role-permission-mapping.md)).
4. `jose` is added as a dependency for the cryptography.
5. Both key modes are supported: JWKS (asymmetric, preferred — the API then never
   holds signing material) and a legacy HS256 shared secret. Configuring both, or
   neither, is a startup error rather than a silent preference.
6. `AUTHENTICATION_INVALID` never says why. Expired, forged, and wrong-audience
   are indistinguishable to the caller.

## Alternatives considered

| Alternative                                        | Why not                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Hand-rolled verification**                       | The repository's own rule is to avoid dependencies for trivial utilities — and this is not one. `alg: none`, HMAC/RSA algorithm confusion, an unchecked `exp`, a missing `iss`: every one of these fails **open**, silently, and is a textbook CVE. Correct HS256 is achievable; correct JWKS handling with key rotation and caching is not a weekend's work, and getting it subtly wrong looks exactly like getting it right. |
| **Supabase's own client library**                  | Pulls a full data client and its transport to verify a token. `jose` is the primitive; the rest is surface we would not use.                                                                                                                                                                                                                                                                                                   |
| **Trust a gateway to verify and forward a header** | Reasonable with a gateway we control. There is none, and "the network is trusted" is the assumption that makes an internal API an open one.                                                                                                                                                                                                                                                                                    |
| **Sessions in our own database**                   | Reimplements what the auth provider already does, badly, and adds a table to keep consistent.                                                                                                                                                                                                                                                                                                                                  |
| **Read the role out of the JWT**                   | The identity provider would then decide who may move money. Roles belong to the depot, in a table it controls.                                                                                                                                                                                                                                                                                                                 |

## Consequences

**Good.** `actorId` is checkable rather than authoritative, so every ledger entry
names somebody who actually proved who they were. Ignoring provider claims means
changing auth provider is a verifier swap, not a permissions rewrite. Only `sub`
crosses the boundary, so the blast radius of a claim we misread is small.

**Bad.** One production dependency, on the path every request takes. JWKS
verification makes an outbound HTTP call on cold start (`jose` caches the key
set). The server now refuses to boot without `SUPABASE_JWT_ISSUER` and exactly one
key source — noisier than defaulting, and deliberately so.

**Not solved.** There is no revocation list: a token stays valid until it expires
even if the session was signed out. Membership _is_ re-checked every request, so
deactivating a membership takes effect immediately; deactivating a session does
not. Short token lifetimes are the mitigation, and the gap is recorded in
UC-AUTH-001.

## Revisit when

- Supabase is replaced, or a second identity provider is added — the verifier is
  a port, so this is a swap.
- Token revocation needs to be immediate, which would mean checking a
  denylist per request and accepting the latency.
- An API gateway that verifies tokens is introduced ahead of this service.
