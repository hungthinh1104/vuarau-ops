const VIETNAM_OFFSET_MINUTES = 7 * 60;

type DateTimeLocalResult =
  { readonly ok: true; readonly value: string } | { readonly ok: false; readonly reason: string };

/**
 * `datetime-local` has no timezone. Operational forms are depot-local, so
 * interpret the value as Asia/Ho_Chi_Minh instead of letting the device
 * timezone silently change the business event.
 */
export function parseVietnamDateTimeLocal(raw: string, label = "Thời điểm"): DateTimeLocalResult {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(
    raw.trim(),
  );
  if (match === null) return { ok: false, reason: `${label} không hợp lệ.` };
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = "0", fraction = ""] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number(fraction.padEnd(3, "0"));
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second) ||
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return { ok: false, reason: `${label} không hợp lệ.` };
  }
  const utcMillis =
    Date.UTC(year, month - 1, day, hour, minute, second, millisecond) -
    VIETNAM_OFFSET_MINUTES * 60_000;
  const date = new Date(utcMillis);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour - Math.floor(VIETNAM_OFFSET_MINUTES / 60) ||
    date.getUTCMinutes() !== minute - (VIETNAM_OFFSET_MINUTES % 60)
  ) {
    // The explicit component check above also rejects calendar rollovers such
    // as 31/02. Compare through the instant's Vietnam wall-clock components
    // below for the normal +07:00 offset.
    const shifted = new Date(utcMillis + VIETNAM_OFFSET_MINUTES * 60_000);
    if (
      shifted.getUTCFullYear() !== year ||
      shifted.getUTCMonth() !== month - 1 ||
      shifted.getUTCDate() !== day ||
      shifted.getUTCHours() !== hour ||
      shifted.getUTCMinutes() !== minute ||
      shifted.getUTCSeconds() !== second
    ) {
      return { ok: false, reason: `${label} không hợp lệ.` };
    }
  }
  return { ok: true, value: date.toISOString() };
}

export function vietnamDateTimeLocalNow(): string {
  return formatVietnamDateTimeLocal(new Date().toISOString());
}

export function formatVietnamDateTimeLocal(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values["year"]}-${values["month"]}-${values["day"]}T${values["hour"]}:${values["minute"]}`;
}
