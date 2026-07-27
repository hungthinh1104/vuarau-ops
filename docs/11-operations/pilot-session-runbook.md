# Shadow pilot session runbook

This is an observation protocol, not a product demonstration. It produces no H2
claim until a real worker completes an observed session and the evidence report is
reviewed.

## Preconditions

- `ops:pilot-readiness` is 12/12 and the device smoke is 10/10.
- One real worker uses their usual phone over 4G or equivalent real network.
- The worker's notebook/bông remains the official record; this workspace is
  isolated shadow evidence, never the basis for a financial decision.
- One facilitator records time and assistance. A separate observer records
  behaviour and findings; the observer does not operate the app.
- The worker has not been shown a UI walkthrough or told which controls to press.

## Session procedure

1. Give the worker 15–20 normal transaction shapes from their own work. Include
   one-line and three-line sales where they naturally occur; do not script prices.
2. Start the stopwatch when the worker begins each transaction and stop only when
   its result is visible. Independently compare the notebook/bông and the posted
   record, then classify every facilitator intervention as `prompted` or
   `taken-over`.
3. Record IDs and counts, not private contents: timestamp, request ID, anonymised
   screenshot reference, sale ID, account-entry count, and operator initials are
   sufficient.
4. Keep the notebook as the reconciliation source. Do not use dry-run results,
   guesses, or a single comment as a requirement.

## Immediate stop

Stop the session at once for a duplicate or missing financial effect, a balance
that cannot be reconciled, a posted sale that appears altered, a failed
dropped-response recovery, an unauthorised workspace/role, or a security/auth
failure. Preserve request IDs and screenshots; do not directly edit a ledger or
posted sale. Escalate corrections through `ops:correct-sale` after the session.

## After the session

Complete [pilot-evidence-report-template.md](pilot-evidence-report-template.md),
label every metric with its sample size, and retain raw private material outside
Git. The report may say H2 is unverified, inconclusive, or supported by the
observed evidence; it must never turn technical readiness or a dry run into H2.
