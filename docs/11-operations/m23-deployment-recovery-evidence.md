# M23 deployment and provider-recovery evidence

## Deployment contract to prove

```text
real phone
→ HTTPS same-origin Next
→ private API
→ private PostgreSQL 17
→ Supabase JWKS verification
```

Repository checks prove only that configuration fails closed: pilot mode requires
HTTPS/JWKS, exact trusted immediate proxy addresses, a PostgreSQL URL and no E2E
auth bridge; `NEXT_PUBLIC_*` secret-shaped values are refused; liveness/readiness,
structured logs, safe metrics, encrypted backup envelopes and per-instance API/
public rate limits exist. A shared/global edge limiter, private network placement,
TLS/device reachability and provider backups are deployment evidence, not
repository claims.

## Deployment evidence record

```text
full release SHA:
deployment/provider:
public HTTPS origin:
private API evidence:
private PostgreSQL 17 evidence:
Supabase project/JWKS verification:
trusted immediate proxy address configuration:
shared/global edge limiter evidence:
/health/live and /health/ready:
structured log/metric observation:
real phone/model/network:
E2E authentication bridge absent:
NEXT_PUBLIC secret scan:
operator / date:
result / deviations / incident IDs:
```

The private evidence store may contain provider screenshots/links; this repository
must not contain credentials, JWTs, database URLs or real customer data.

## Provider restore drill

Policy remains:

```text
RPO ≤ 15 minutes
RTO ≤ 60 minutes
PITR granularity ≤ 15 minutes
daily encrypted logical backup
35-day retention
quarterly restore drill
```

Run against an isolated recovery environment. Never restore over the live
workspace and never use PITR to correct a business mistake.

```text
full release SHA:
provider:
backup/PITR identifier:
encrypted logical backup identifier:
recovery point:
restore start / service ready / verification end:
measured RPO:
measured RTO:
workspace integrity result:
customer reconciliation result:
supplier reconciliation result:
inventory reconciliation result:
canonical source-resolution result:
operator identity:
deviations/incidents:
final disposition of recovery environment:
```

The drill passes only when target policy is measured, integrity is healthy and all
three reconciliations are consistent. A written procedure, local migration
rehearsal or PostgreSQL integration test is repository evidence but not provider
PITR evidence.

If no provider environment exists, record:

```text
provider recovery gate: BLOCKED/PENDING
owner:
concrete trigger/date:
```

Never convert that state to pass in a fixture.

## Disposable technical dry-run

With `DATABASE_URL` pointing at the test PostgreSQL instance:

```bash
pnpm pilot:dry-run
```

The orchestrator records the exact SHA and reuses the focused M23 tests plus the
existing full Playwright browser/API/PostgreSQL suite. It covers the transaction
workflows and representative authorization, retry, stale-version, request-size,
rate-limit and readiness failures without duplicating scenario implementations.
Its JSON summary says `fieldValidation: NOT_RUN_BY_AUTOMATION`.
