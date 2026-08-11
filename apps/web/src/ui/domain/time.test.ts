import { describe, expect, it } from "vitest";
import {
  formatVietnamDateTimeLocal,
  parseVietnamDateTimeLocal,
  vietnamDateTimeLocalNow,
} from "./time.ts";

describe("Vietnam-local datetime input", () => {
  it("turns a depot-local value into the same UTC instant on every device", () => {
    expect(parseVietnamDateTimeLocal("2026-08-12T10:30", "Thời điểm")).toEqual({
      ok: true,
      value: "2026-08-12T03:30:00.000Z",
    });
  });

  it("rejects calendar rollovers instead of letting Date normalize them", () => {
    expect(parseVietnamDateTimeLocal("2026-02-31T10:30").ok).toBe(false);
    expect(parseVietnamDateTimeLocal("2026-08-12T25:30").ok).toBe(false);
  });

  it("produces a Vietnam-local default for datetime-local controls", () => {
    expect(vietnamDateTimeLocalNow()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it("hydrates an existing instant back into depot-local input", () => {
    expect(formatVietnamDateTimeLocal("2026-08-12T03:30:00.000Z")).toBe("2026-08-12T10:30");
  });
});
