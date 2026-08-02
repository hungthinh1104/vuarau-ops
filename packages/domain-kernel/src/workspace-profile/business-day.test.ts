import { describe, expect, it } from "vitest";
import { vietnamBusinessDateForInstant, vietnamBusinessDayRange } from "@vuarau/domain-contracts";

describe("configured Vietnam business day", () => {
  it("uses midnight when the depot has no shifted day", () => {
    expect(vietnamBusinessDayRange("2026-07-29", 0)).toEqual({
      start: "2026-07-28T17:00:00.000Z",
      end: "2026-07-29T17:00:00.000Z",
    });
  });

  it("maps 22:00 through 21:59 to one business date", () => {
    const range = vietnamBusinessDayRange("2026-07-29", 22 * 60);
    expect(range).toEqual({
      start: "2026-07-29T15:00:00.000Z",
      end: "2026-07-30T15:00:00.000Z",
    });
    expect(vietnamBusinessDateForInstant("2026-07-29T14:59:59.999Z", 22 * 60)).toBe("2026-07-28");
    expect(vietnamBusinessDateForInstant(range.start, 22 * 60)).toBe("2026-07-29");
    expect(vietnamBusinessDateForInstant("2026-07-30T14:59:59.999Z", 22 * 60)).toBe("2026-07-29");
    expect(vietnamBusinessDateForInstant(range.end, 22 * 60)).toBe("2026-07-30");
  });
});
