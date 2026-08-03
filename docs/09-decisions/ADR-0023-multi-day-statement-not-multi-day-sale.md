# ADR-0023 — A multi-day bill is a source-backed statement, not one multi-day Sale

**Status:** accepted · 2026-08-01

## Context

A depot may hand a customer one paper after several days of deliveries and
payments. Calling that paper a Sale would merge distinct commercial events,
replace their real transaction times with an arbitrary closing date, and make
retry/correction/payment history ambiguous.

The pilot also records the local term **“bông hàng”**, but field evidence has not
yet established whether it means a customer statement, one load, a route/market
trip, a settlement session, a handwritten draft or something else. Encoding the
word as an aggregate before that distinction is known would make terminology
choose the accounting model.

## Decision

1. Every Sale, Payment, void, reversal and adjustment remains its own immutable
   source transaction with its original `transactionTime` and source identity.
2. A bill covering several days is generated as a versioned
   `customer_statement` document snapshot with an optional inclusive period.
3. The server derives and freezes:
   - opening balance before the period;
   - ordered source-linked entries in the period;
   - signed period change;
   - closing balance and its classification.
4. Generating, printing, sharing or regenerating the statement moves no money and
   no goods. A new version is a new presentation snapshot, not a new transaction.
5. The statement does not allocate one Payment across individual Sales. Allocation
   remains a separate policy-backed command and its facts are not rewritten by a
   presentation snapshot.
6. “Bông hàng” remains a discovery term. A future Bông aggregate is justified only
   if workers need a lifecycle not represented by Sale, Delivery or Statement.
   Candidate evidence includes who opens/closes it, what source transactions it
   contains, whether it crosses customers/days and whether payment is settled per
   bông.

## Print presentation

- Sale receipt, Purchase order and Delivery note are transaction documents.
- Customer statement is the multi-day reconciliation document.
- Screen and print read the same immutable typed snapshot.
- Each print shows depot/party, source references, version, generation time,
  digest prefix, totals and signature areas.
- A visible disclaimer states that the output is an operational snapshot, not a
  tax invoice or digitally signed e-invoice.
- A4 is the current default for statements. An 80 mm receipt layout may be added as
  a presentation profile for single-transaction documents; it must not alter the
  snapshot or calculations.
- Legacy document snapshots remain digest-verifiable and readable through an
  explicit fallback rather than being silently interpreted as the new schema.

## Alternatives considered

- One Sale spanning several days: rejected because it destroys each event's true
  transaction time and correction identity.
- A client-only printable table: rejected because opening/closing balances and
  source inclusion would become browser-owned money arithmetic.
- A new `bong_hang` aggregate immediately: deferred because the local term's actor,
  contents, lifecycle and settlement meaning are not yet observed.

## Consequences

**Good.** Several days can be printed and discussed as one paper without damaging
transaction-time, correction or ledger truth. Regeneration is deterministic and
source-linked.

**Cost.** A statement can be longer than one page and needs print-specific table
headers/page-break behavior. It is not a shortcut for payment allocation.

**Open discovery.** Whether “bông hàng” deserves its own open/closed grouping,
recorder/closer, comparison or settlement workflow remains a field question.

## Revisit when

Revisit when field observation can distinguish “bông hàng” from a customer
statement or when users require explicit per-Sale payment allocation, an open/close
lifecycle, route grouping, or an 80 mm printer profile.

## Related

- [document use cases](../02-use-cases/depot-operations-use-cases.md)
- [document rules](../04-business-rules/depot-operations-rules.md)
- [pilot evidence template](../11-operations/pilot-evidence-report-template.md)
