import { describe, expect, it } from "vitest";
import {
  CORE_EXTENSION_BOUNDARY,
  CORE_EXTENSION_CAPABILITIES,
  extensionBoundaryDeclarationSchema,
} from "./index.ts";

describe("core extension boundary", () => {
  it("keeps every reserved capability outside direct core effects", () => {
    expect(CORE_EXTENSION_BOUNDARY).toEqual(CORE_EXTENSION_CAPABILITIES);

    for (const capability of CORE_EXTENSION_BOUNDARY) {
      expect(
        extensionBoundaryDeclarationSchema.parse({
          contractVersion: 1,
          capability,
          lifecycle: "reserved",
          executionMode: "proposal_only",
          workspaceScoped: true,
          directCoreEffects: false,
        }),
      ).toMatchObject({ capability, directCoreEffects: false });
    }
  });

  it("does not represent a direct-core-effect execution mode", () => {
    const result = extensionBoundaryDeclarationSchema.safeParse({
      contractVersion: 1,
      capability: "ocr_capture",
      lifecycle: "experimental",
      executionMode: "direct_core_effect",
      workspaceScoped: true,
      directCoreEffects: true,
    });

    expect(result.success).toBe(false);
  });
});
