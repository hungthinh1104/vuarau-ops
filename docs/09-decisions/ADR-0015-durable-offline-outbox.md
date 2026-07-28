# ADR-0015 — Quick Sale uses a durable, partitioned browser outbox

**Status:** accepted · 2026-07-29

## Context

Quick Sale must survive weak connectivity and a browser reload without inventing
a second Sale or presenting local state as receivable truth.

## Decision

Offline Quick Sale is an explicit IndexedDB outbox, not a service-worker mutation
cache. Records are schema-versioned and partitioned by authenticated actor and
workspace. Accepting a local Sale writes its draft and immutable command chain in
one IndexedDB transaction.

The supported chain is deliberately narrow:

```text
optional CreateCustomer → CreateSaleDraft → PostSale
```

Each command keeps its original aggregate id, command id, idempotency key and
`occurredAt` across reloads and retries. FIFO is mandatory within a chain;
independent chains synchronize with bounded concurrency. Network uncertainty is
`retry_wait`; a version conflict is `blocked`; definite business and permission
refusals are `rejected`. Dependants never run after either latter outcome.

Synchronization runs on application start, reconnect, focus and explicit retry.
`navigator.onLine` is only a hint. The service worker caches the minimal GET
application shell and never mutation or financial read responses.

## Consequences

The UI says “saved on this device” until the server confirms; it never calls a
queued Sale posted. Cached financial values carry `fetchedAt` and remain display
information only. Sign-out clears the cached authority bootstrap, while queued
records remain partitioned and cannot replay as another actor.

Background Sync is not required. Product mutation, payment and correction queues
remain outside this ADR.

## Alternatives considered

- Service-worker request replay was rejected because mutation responses and
  authenticated financial reads must not become an opaque HTTP cache.
- A generic sync framework was rejected because M13 has one bounded dependency
  chain and no merge policy.
- Memory/localStorage was rejected because neither offers the required durable,
  atomic structured transaction.

## Revisit when

- Another bounded workflow earns offline mutation support.
- Browser storage migrations need a second schema version.
- A stale-draft resolution workflow is added; it must remain explicit.
