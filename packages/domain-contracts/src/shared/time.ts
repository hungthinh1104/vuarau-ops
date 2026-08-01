import { z } from "zod";

/**
 * Four timestamps with four different meanings. Collapsing them loses money.
 * See docs/07-data/time-semantics.md.
 *
 *   transactionTime — when the business event actually happened. A worker enters
 *                     yesterday's sale this morning; debt aging must use this.
 *   recordedAt      — when the system accepted the write. Audit and operational
 *                     debugging use this; it is never back-dated.
 *   createdAt       — row birth in persistence.
 *   updatedAt       — only on mutable projections and master data. Financial rows
 *                     never have one, because they are never updated.
 *
 * Offsets are accepted (`+07:00`) because clients are in Vietnam and a phone with
 * a wrong timezone is a support ticket, not a data-loss event. Values are
 * normalised to UTC instants on the way in.
 */
export const isoInstantSchema = z.iso.datetime({ offset: true });
export type IsoInstant = z.infer<typeof isoInstantSchema>;

/** Business occurrence time. May be earlier than `recordedAt`; never later. */
export const transactionTimeSchema = isoInstantSchema;

/** System acceptance time. Server-assigned, never client-supplied. */
export const recordedAtSchema = isoInstantSchema;


const VIETNAM_OFFSET_MINUTES = 7 * 60;

/**
 * UTC window for one configured Vietnam depot business date.
 * `startMinute=1320` means 22:00 local through 21:59:59.999 the following day.
 */
export function vietnamBusinessDayRange(
  businessDate: string,
  startMinute: number,
): { start: IsoInstant; end: IsoInstant } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    throw new Error(`Invalid business date: ${businessDate}`);
  }
  if (!Number.isInteger(startMinute) || startMinute < 0 || startMinute > 1439) {
    throw new Error(`Invalid business-day start minute: ${startMinute}`);
  }
  const [year, month, day] = businessDate.split("-").map(Number) as [number, number, number];
  const startMs =
    Date.UTC(year, month - 1, day, 0, startMinute) - VIETNAM_OFFSET_MINUTES * 60_000;
  return {
    start: new Date(startMs).toISOString() as IsoInstant,
    end: new Date(startMs + 86_400_000).toISOString() as IsoInstant,
  };
}

/** Maps one instant to the depot's configured Vietnam business date. */
export function vietnamBusinessDateForInstant(
  instant: IsoInstant | string | Date,
  startMinute: number,
): string {
  if (!Number.isInteger(startMinute) || startMinute < 0 || startMinute > 1439) {
    throw new Error(`Invalid business-day start minute: ${startMinute}`);
  }
  const value = instant instanceof Date ? instant.getTime() : Date.parse(instant);
  if (!Number.isFinite(value)) throw new Error(`Invalid instant: ${String(instant)}`);
  const shifted = value + (VIETNAM_OFFSET_MINUTES - startMinute) * 60_000;
  return new Date(shifted).toISOString().slice(0, 10);
}
