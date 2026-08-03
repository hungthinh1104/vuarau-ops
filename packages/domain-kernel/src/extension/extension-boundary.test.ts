import { describe, expect, it } from "vitest";
import { decideExtensionExecution } from "./index.ts";

describe("extension execution boundary", () => {
  it("TC-EXTENSION-001 allows only proposals or canonical commands", () => {
    expect(
      decideExtensionExecution({
        capability: "ai_transaction_entry",
        executionMode: "proposal_only",
      }),
    ).toEqual({
      ok: true,
      value: {
        capability: "ai_transaction_entry",
        executionMode: "proposal_only",
        directCoreEffects: false,
      },
    });
    expect(
      decideExtensionExecution({
        capability: "ocr_capture",
        executionMode: "canonical_command",
      }),
    ).toMatchObject({ ok: true, value: { directCoreEffects: false } });
  });

  it("TC-EXTENSION-002 rejects direct effects on core facts", () => {
    const result = decideExtensionExecution({
      capability: "demand_forecast",
      executionMode: "direct_core_effect",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "COMMAND_NOT_AVAILABLE" },
    });
  });
});
