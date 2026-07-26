# ADR-0006 — Integer minor units for money

**Status:** accepted · 2026-07-26

## Context

Vietnamese đồng amounts are large. A single depot order is routinely in the
millions; a monthly balance reaches the hundreds of millions. There is no
subdivision of the đồng in circulation — no xu.

IEEE-754 doubles cannot represent `0.1`, and money code that uses them produces
totals that are off by one đồng in ways nobody can explain to a customer.

## Decision

1. Money is `{ amountMinor: number, currency: CurrencyCode }` where `amountMinor`
   is an **integer** count of the currency's smallest unit.
2. For VND the exponent is 0 — one minor unit is one đồng. `875000` is 875.000 ₫.
3. Stored as Postgres `bigint`, read through Drizzle with `mode: "number"`.
4. Currency travels with every amount. Mixed-currency arithmetic is refused, not
   silently performed.
5. Quantities use the same principle: integer milli-units at scale 1000
   (1,5 kg → `1500`), so the only division in the system is the documented one in
   BR-SALE-004.
6. Rounding is half-up on the minor unit, in one function, applied at exactly one
   place: the line total.

## Alternatives considered

| Alternative                            | Why not                                                                                                                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `number` as đồng with decimals         | Floating point. Disqualified.                                                                                                                                           |
| Postgres `numeric` + a decimal library | Correct, but adds a dependency and a wrapper type at every boundary, to represent fractions of a currency unit that does not have them.                                 |
| `bigint` in JavaScript                 | Removes the safe-integer ceiling but does not survive `JSON.stringify`, so every API boundary needs custom serialisation. Not worth it at these magnitudes — see below. |
| Storing formatted strings              | Not arithmetic.                                                                                                                                                         |

## Consequences

**Good.** Exact arithmetic. `SUM(amount_minor)` in Postgres is exact and fast.
Amounts serialise as JSON numbers with no custom codec. Zod validates the integer
constraint at the boundary, so a float never reaches the domain.

**Bad.** Callers must remember that `875000` is 875.000 ₫ and not 875 ₫ —
mitigated by never exposing a bare number: it is always `{ amountMinor, currency }`.
Formatting for display is the presentation layer's job.

**The ceiling, explicitly.** `Number.MAX_SAFE_INTEGER` is 9.007.199.254.740.991 —
about 9 × 10¹⁵ đồng, or nine thousand trillion. A depot's largest realistic balance
is around 10⁹. The margin is six orders of magnitude. `bigint` columns in Postgres
mean the _storage_ has room regardless; if JavaScript-side magnitudes ever
approached the limit, switching the Drizzle mode to `bigint` is a contained change.

## Revisit when

- A currency with a non-zero exponent is added (the `CURRENCY_EXPONENT` table
  already exists for this; the arithmetic does not change, only display).
- Any single amount could plausibly exceed 10¹⁵ minor units — which would mean the
  product had changed beyond recognition.
