import type { IsoInstant } from "@vuarau/domain-contracts";

/**
 * Fixed instants modelling the gap that matters: a sale at dawn, entered mid-morning.
 * See docs/07-data/time-semantics.md.
 */

/** 05:00 Vietnam time — when the sale actually happened. */
export const TRANSACTION_TIME = "2026-07-20T05:00:00.000+07:00" as IsoInstant;

/** 11:00 Vietnam time — when the worker finally typed it in. */
export const RECORDED_AT = "2026-07-20T11:00:00.000+07:00" as IsoInstant;

/** A later business event: the payment two days on. */
export const LATER_TRANSACTION_TIME = "2026-07-22T08:30:00.000+07:00" as IsoInstant;
export const LATER_RECORDED_AT = "2026-07-22T08:31:00.000+07:00" as IsoInstant;

/** Later still: the reversal. */
export const LATEST_TRANSACTION_TIME = "2026-07-23T09:00:00.000+07:00" as IsoInstant;
export const LATEST_RECORDED_AT = "2026-07-23T09:00:30.000+07:00" as IsoInstant;

/**
 * An agreed payment term, ten days after the sale (BR-SALE-017). Compared against
 * a reading clock, so a test picks whether it is `due` or `overdue` by choosing
 * which instant it reads at — the sale itself never changes.
 */
export const DUE_AT = "2026-07-30T05:00:00.000+07:00" as IsoInstant;

/** After `DUE_AT`. Reading a sale at this instant makes it `overdue`. */
export const AFTER_DUE_AT = "2026-08-01T05:00:00.000+07:00" as IsoInstant;

/** Beyond the 5-minute skew tolerance — must be refused (BR-COMMAND-004). */
export const FUTURE_TRANSACTION_TIME = "2026-07-23T10:00:00.000+07:00" as IsoInstant;

/** A deterministic clock for handlers under test. */
export function fixedClock(now: IsoInstant = RECORDED_AT): { now: () => IsoInstant } {
  return { now: () => now };
}
