# ADR-0016 — Workspace backup is logical JSON, not infrastructure recovery

**Status:** accepted · 2026-07-29

## Context

An owner needs a portable application-level copy and a supported logical
recovery path before a hosting provider and its physical backup facilities have
been selected.

## Decision

`WorkspaceBackupV1` is a deterministic JSON representation of canonical workspace
business rows, memberships, audit evidence and command receipts. Arrays and
object keys are canonicalized before a SHA-256 digest is calculated. Balance
projections are not authoritative backup input and credentials, tokens and
passwords are excluded.

Export, integrity inspection and validation are owner-only server reads.
Validation verifies version, source workspace and digest before any future
mutation is considered. The operations screen does not offer merge restore.

Application-level logical recovery is not database disaster recovery. Hosting
snapshots, physical restore and point-in-time recovery remain deployment-provider
responsibilities. A supported data restore may only target an empty recovery
workspace, must be atomic, must rebuild projections, and must reconcile before it
reports success. `RestoreWorkspaceBackup` implements that narrow boundary:
validation and authorization run first, the repository writes in one application
transaction, projections are rebuilt from the restored ledger, and integrity is
re-read before success. A retry uses the original command receipt.

## Consequences

A bad checksum, malformed reference, unresolved actor or non-empty target is a
typed refusal before a successful result. Derived balances cannot be smuggled
back as ledger truth.

## Alternatives considered

- Database dumps were rejected as a self-service application feature; they bind
  the product to deployment credentials and infrastructure.
- Merge restore was rejected because resolving conflicting immutable financial
  sources has no safe generic policy.
- Trusting exported balance projections was rejected because the ledger is the
  canonical source and projections are rebuildable.

## Revisit when

- Deployment infrastructure defines physical restore and PITR.
- Backup V2 needs a migration contract.
- Authentication identities can be safely provisioned rather than only resolved.
