import { formatDate, formatInstant } from "./format.ts";

describe("Vietnam presentation time", () => {
  it("renders stored UTC instants in the depot's fixed Vietnam timezone", () => {
    const midnightVietnam = "2026-08-07T17:00:00.000Z";

    expect(formatInstant(midnightVietnam)).toBe("00:00 08/08/2026");
    expect(formatDate(midnightVietnam)).toBe("08/08/2026");
  });
});
