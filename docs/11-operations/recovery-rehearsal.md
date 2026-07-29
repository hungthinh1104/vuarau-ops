# Deployment and recovery rehearsal

## Production requirements

These are minimum release gates, not claims that an unnamed provider already
satisfies them:

```text
RPO:                    at most 15 minutes of committed canonical transactions
RTO:                    at most 60 minutes to a verified read/write service
PITR granularity:       15 minutes or better
encrypted backup:       daily logical backup plus provider PITR
backup retention:       35 days
restore drill:          quarterly and before/after a high-risk migration
owner:                  deployment operator
```

The depot owner must accept these targets before production. A deployment whose
provider cannot prove them is not production-ready; documentation does not waive
the gate.

## Architecture and deployment

One same-origin public Next application proxies to a private API; the API verifies
JWKS and connects to private PostgreSQL 17. Migrations run once before traffic.
Deploy application code only after migration success and readiness; keep the
previous application artifact available.

Rollback policy:

- before a migration: roll back the application artifact;
- after an additive compatible migration: prefer application rollback;
- after a non-backward-compatible migration: forward-fix schema/code—never restore
  an older database over valid new transactions;
- canonical business mistakes use void/reversal/return/adjustment, never PITR.

## Rehearsed evidence — 2026-07-29

- `rehearse:m22` created a disposable empty PostgreSQL database, applied all 21
  migrations to 33 tables, reapplied idempotently, and removed only the validated
  `vuarau_m22_rehearsal_<pid>` database: pass.
- Migration `0020` was applied to the production-shape workspace containing one
  million canonical ledger/movement rows before the successful EXPLAIN run: pass.
- PostgreSQL restore integration tests export `WorkspaceBackupV1`, restore
  canonical customer/Product/Sale/payment/audit/receipt history, rebuild
  projections, validate integrity, replay without duplicates, and roll back an
  injected storage/reference/digest failure: pass.
- AES-256-GCM backup-envelope tests prove round-trip, no plaintext in the envelope,
  wrong-key/tamper rejection and key-length refusal: pass.

Provider PITR cannot be rehearsed before a provider/production environment exists.
It is a **deployment blocker**, not accepted evidence. The deployment operator
must record provider backup id, recovery point, start/end timestamps, integrity and
reconciliation output before real transactions.

## Restore drill record

```text
release SHA:
backup/PITR identifier:
encrypted backup location:
recovery point:
restore started / ready:
measured RPO / RTO:
workspace integrity:
customer/supplier/inventory reconciliation:
operator:
incident or deviations:
```
