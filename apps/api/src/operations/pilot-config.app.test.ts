import { describe, expect, it } from "vitest";
import { EXAMPLE_PILOT_CONFIG, readPilotConfig } from "./pilot-config.ts";

describe("M23 — pilot declaration is fail-closed", () => {
  const filled = {
    ...EXAMPLE_PILOT_CONFIG,
    releaseSha: "6".repeat(40),
    workspaceName: "Vựa thật",
    actor: {
      ...EXAMPLE_PILOT_CONFIG.actor,
      supabaseUserId: "real-supabase-subject",
    },
    debtRecognitionConfirmation: evidence("Chủ vựa"),
    commercialRecognitionConfirmation: evidence("Chủ vựa"),
    supplierPayableRecognitionConfirmation: evidence("Chủ vựa"),
    rolePermissionReview: review("Chủ vựa"),
    ownerMembershipReview: review("Chủ vựa"),
    dataSharingRetentionReview: review("Chủ vựa"),
    recoveryEvidence: {
      status: "pending" as const,
      owner: "platform owner",
      trigger: "provider PITR evidence attached before pilot",
    },
  };

  it("accepts an explicit pending provider gate without pretending it passed", () => {
    const result = readPilotConfig(JSON.stringify(filled));
    expect(result).toMatchObject({
      ok: true,
      config: { recoveryEvidence: { status: "pending" } },
    });
  });

  it("rejects missing owner semantics, policy review, or exact release identity", () => {
    const incomplete = {
      ...filled,
      releaseSha: "603e830",
      commercialRecognitionConfirmation: undefined,
      dataSharingRetentionReview: undefined,
    };
    const result = readPilotConfig(JSON.stringify(incomplete));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems.join("\n")).toContain("releaseSha");
      expect(result.problems.join("\n")).toContain("commercialRecognitionConfirmation");
      expect(result.problems.join("\n")).toContain("dataSharingRetentionReview");
    }
  });

  it("requires evidence references when provider recovery is declared passed", () => {
    const result = readPilotConfig(
      JSON.stringify({
        ...filled,
        recoveryEvidence: { status: "passed", providerEvidenceReference: "" },
      }),
    );
    expect(result.ok).toBe(false);
  });
});

function evidence(ownerName: string) {
  return {
    ownerName,
    date: "2026-07-29",
    decision: "accepted" as const,
    notes: "",
    worksheetReference: "external://signed-evidence",
  };
}

function review(reviewerName: string) {
  return {
    reviewerName,
    date: "2026-07-29",
    decision: "accepted" as const,
    worksheetReference: "external://signed-evidence",
    notes: "",
  };
}
