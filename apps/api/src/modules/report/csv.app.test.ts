import { describe, expect, it } from "vitest";
import { csvCell } from "./csv.ts";

describe("M22 CSV injection boundary", () => {
  it.each(["=1+1", "+cmd", "-2+3", "@SUM(A1:A2)", ' \t=HYPERLINK("x")'])(
    "forces formula-shaped text to remain literal: %s",
    (value) => {
      expect(csvCell(value)).toBe(`"'${value.replaceAll('"', '""')}"`);
    },
  );

  it("still quotes commas, quotes, numbers and empty cells normally", () => {
    expect(csvCell('rau, "loại 1"')).toBe('"rau, ""loại 1"""');
    expect(csvCell(12_000)).toBe('"12000"');
    expect(csvCell(null)).toBe('""');
  });
});
