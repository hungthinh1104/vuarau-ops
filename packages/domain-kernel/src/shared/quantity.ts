/**
 * BR-SALE-004 — the line-total rule, re-exported from `domain-contracts`.
 *
 * The implementation moved when the quick-sale screen needed it. A worker reads
 * the line total aloud to the customer before the sale is posted, so a second
 * implementation in the browser is a number the customer is told and a different
 * number they are charged — which is exactly what "the only place a rounding
 * decision is made" exists to prevent.
 *
 * Re-exported rather than relocated in every caller, so nothing in the kernel or
 * the application layer changed and every one of them still reaches one copy.
 */
export { calculateLineTotal, roundHalfUp, isExactMoneyAmount } from "@vuarau/domain-contracts";
