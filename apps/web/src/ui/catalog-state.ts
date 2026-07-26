/**
 * Every state named in `docs/06-api-contracts/ui-state-catalog.md`.
 *
 * This list is not the source of truth — the document is. `catalog-coverage.test.ts`
 * parses the coverage checklist out of that markdown and asserts three things
 * agree: the document, this list, and the set of stories that declare a
 * `catalogState`. A state added to the catalog and forgotten in Storybook fails the
 * build, which is the only reason to have a machine-readable copy at all.
 *
 * A state is in the catalog because the backend can produce it. If the backend can
 * produce a state and it is not here, that is the gap where a user ends up staring
 * at a spinner that never resolves.
 */
export const UI_STATE_CATALOG = [
  "loading",
  "empty",
  "validation_error",
  "business_rejection",
  "permission_denied",
  "stale_version",
  "duplicate_safe_retry",
  "command_in_progress",
  "unknown_network_outcome",
  "balance_receivable",
  "balance_settled",
  "balance_customer_credit",
  "sale_draft",
  "sale_discarded",
  "sale_posted",
  "sale_voided",
  "sale_replaced",
  "customer_active",
  "customer_inactive",
  "membership_revoked",
  "last_owner_protected",
  "no_due_date",
  "due",
  "overdue",
  "payment_recorded",
  "payment_partially_reversed",
  "payment_reversed",
  "reversal_amount_exceeded",
] as const;

export type UiCatalogState = (typeof UI_STATE_CATALOG)[number];

/**
 * Attached to the story that renders a catalog state.
 *
 * A parameter rather than a naming convention on the title: a title has to serve
 * a human browsing the sidebar, and making it also carry a machine-readable key
 * makes it worse at both jobs.
 */
export function coversState(state: UiCatalogState): { catalogState: UiCatalogState } {
  return { catalogState: state };
}
