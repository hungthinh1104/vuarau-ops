# Production threat model

## Assets and trust boundaries

| Asset            | Primary threat                                                        | Control and evidence                                                                                                       |
| ---------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Customer debt    | unauthorized read/write, duplicate effect, log leak                   | verified JWT, membership/capability pipeline, append-only source, idempotency, safe logs                                   |
| Supplier payable | cross-workspace source, over-reversal, duplicate effect               | same pipeline, workspace composite joins, source uniqueness, reconciliation                                                |
| Inventory        | forged movement, duplicate source, projection drift                   | typed commands, source uniqueness, append-only movement, rebuild/reconciliation                                            |
| Authorization    | token forgery, inactive/broad role, procedure bypass                  | JWKS in pilot, actor resolution, permission matrix, `security:m22`, ADR-0020                                               |
| Backup/export    | plaintext loss, formula injection, unsafe restore                     | owner permission, digest, AES-256-GCM envelope, literal CSV cells, empty-target atomic restore                             |
| Document share   | token disclosure/guessing, replay after revocation, tampered snapshot | high-entropy secret stored only as hash, expiry/revocation, digest verification, no-store/CSP, public rate limit           |
| Secrets/logs     | browser-published key, bearer/payload in logs, correlation injection  | startup validation, no service key, closed log vocabulary, bounded request id, safe metric labels                          |
| Browser surface  | framing, content sniffing, unnecessary device capability              | Next security headers: `DENY`, `nosniff`, strict referrer policy, denied camera/microphone/geolocation; HSTS in production |

## Attack paths and fail-closed behavior

- A foreign `workspaceId` is rejected before repository data is returned. Database
  tests use foreign actors and crafted source IDs; the router checker covers all
  49 command and 48 query procedures.
- A request above 1 MiB is refused with 413. Chunked bodies are counted while
  streaming; no body is logged.
- Authenticated/API traffic defaults to 600 requests/minute per validated client;
  public document reads default to 60/minute in a separate bucket. Forwarded
  identity is used only from an explicitly trusted immediate peer and only when it
  is one valid IP. Deployment edge limits remain mandatory for
  multi-instance/global enforcement.
- CSV cells beginning with `=`, `+`, `-`, or `@` after whitespace are forced to
  literal text before quoting.
- Public documents return no stack/driver error, use no-store, deny framing and
  verify the stored digest on every read.
- Backup ciphertext uses AES-256-GCM with authenticated metadata. Wrong keys or
  modified ciphertext fail before JSON/restore parsing.
- Readiness failure injection proves database errors and connection strings do not
  cross the unauthenticated health boundary.

## Accepted boundaries

- Application isolation is the canonical tenant policy; PostgreSQL RLS is absent.
  The database role is therefore operator-only and private (ADR-0020).
- The proxy-aware in-process rate limiter separates clients within one instance.
  A production edge must add a shared/global limiter without weakening the
  application limit.
- Metrics expose only bounded operation/rejection names and counts. `/metrics` is
  served by the private API origin and must not be routed through the public Next
  origin.

Review this model after any new public route, credential, canonical source type,
export format, support-access path, or deployment topology.
