import { describe, expect, it } from "vitest";
import { formatSourceEvidence, parseSourceEvidence } from "./source-evidence.ts";

describe("source evidence input", () => {
  it("keeps one trimmed unique reference per line or comma", () => {
    expect(parseSourceEvidence(" order://1\nphoto://2, order://1 ")).toEqual([
      "order://1",
      "photo://2",
    ]);
  });

  it("round-trips references without interpreting them", () => {
    const references = ["paper://order/1", "photo://order/1"];
    expect(parseSourceEvidence(formatSourceEvidence(references))).toEqual(references);
  });
});
