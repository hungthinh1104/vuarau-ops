import { describe, expect, it } from "vitest";
import {
  createPilotScope,
  validatePilotRuntimeConfig,
  validatePilotWorkspace,
} from "./pilot-runtime.ts";
import { EXAMPLE_PILOT_CONFIG, readPilotConfig, type PilotConfig } from "./pilot-config.ts";

const release = "6".repeat(40);

function config(): PilotConfig {
  const parsed = readPilotConfig(
    JSON.stringify({
      ...EXAMPLE_PILOT_CONFIG,
      releaseSha: release,
      workspaceName: "Vựa thật",
      actor: { ...EXAMPLE_PILOT_CONFIG.actor, supabaseUserId: "subject" },
      debtRecognitionConfirmation: evidence("Chủ vựa"),
      commercialRecognitionConfirmation: accepted("Chủ vựa"),
      supplierPayableRecognitionConfirmation: accepted("Chủ vựa"),
      rolePermissionReview: review("Chủ vựa"),
      ownerMembershipReview: review("Chủ vựa"),
      dataSharingRetentionReview: review("Chủ vựa"),
      sensitiveActionApprovalReview: review("Chủ vựa"),
      qualityGradePolicyReview: review("Chủ vựa"),
      receivingQualitySemanticsReview: review("Chủ vựa"),
      qualityRoleReview: review("Chủ vựa"),
      pricingPolicyReview: review("Chủ vựa"),
      saleFulfilmentCorrectionGate: excluded("Chủ vựa"),
      purchaseReceivingCorrectionGate: excluded("Chủ vựa"),
      partialCustomerReturnGate: excluded("Chủ vựa"),
      supplierReturnGate: excluded("Chủ vựa"),
      driverCashCollectionGate: excluded("Chủ vựa"),
      authenticationSmoke: {
        status: "pending" as const,
        owner: "platform owner",
        trigger: "real auth smoke",
      },
      deploymentEvidence: {
        status: "pending" as const,
        owner: "platform owner",
        trigger: "pilot deployment",
      },
      recoveryEvidence: {
        status: "pending" as const,
        owner: "platform owner",
        trigger: "restore drill",
      },
    }),
  );
  if (!parsed.ok) throw new Error(parsed.problems.join("\n"));
  return parsed.config;
}

function accepted(ownerName: string) {
  return {
    ownerName,
    date: "2026-08-10",
    decision: "accepted" as const,
    notes: "",
    worksheetReference: "external://owner-confirmation",
  };
}

function evidence(ownerName: string) {
  return {
    ownerName,
    date: "2026-08-10",
    decision: "accepted" as const,
    notes: "",
    worksheetReference: "external://owner-confirmation",
  };
}

function review(reviewerName: string) {
  return {
    reviewerName,
    date: "2026-08-10",
    decision: "accepted" as const,
    notes: "",
    worksheetReference: "external://owner-confirmation",
  };
}

function excluded(reviewerName: string) {
  return {
    disposition: "excluded_from_shadow_scope" as const,
    reviewerName,
    date: "2026-08-10",
    worksheetReference: "external://scope-review",
    stopIfEncountered: true as const,
    notes: "",
  };
}

describe("pilot startup truth gates", () => {
  it("requires exact release, owner acceptance and excluded stop gates", () => {
    const valid = config();
    expect(validatePilotRuntimeConfig(valid, release)).toEqual([]);

    const unsafe = {
      ...valid,
      releaseSha: "7".repeat(40),
      commercialRecognitionConfirmation: {
        ...valid.commercialRecognitionConfirmation,
        decision: "rejected" as const,
      },
      saleFulfilmentCorrectionGate: {
        disposition: "resolved_in_release" as const,
        reviewerName: "Chủ vựa",
        date: "2026-08-10",
        worksheetReference: "external://review",
        releaseSha: release,
        notes: "",
      },
    };
    expect(validatePilotRuntimeConfig(unsafe, release).join("\n")).toEqual(
      expect.stringContaining("ASM-024"),
    );
    expect(validatePilotRuntimeConfig(unsafe, release).join("\n")).toContain("ASM-035");
    expect(validatePilotRuntimeConfig(unsafe, release).join("\n")).toContain("releaseSha");
  });

  it("fails closed when the declared workspace is missing or renamed", () => {
    expect(validatePilotWorkspace(null, "Vựa thật")).toEqual(["pilot workspace does not exist"]);
    expect(validatePilotWorkspace({ name: "Vựa khác" }, "Vựa thật")).toEqual([
      "pilot workspace name does not match the operator-owned declaration",
    ]);
    expect(validatePilotWorkspace({ name: "Vựa thật" }, "Vựa thật")).toEqual([]);
  });

  it("blocks only declared cross-dimension commands, not generic inventory adjustment", () => {
    const scope = createPilotScope();
    expect(scope.isCommandExcluded("VoidSale")).toBe(true);
    expect(scope.isCommandExcluded("VoidPurchase")).toBe(true);
    expect(scope.isCommandExcluded("RecordDeliveryReturn")).toBe(true);
    expect(scope.isCommandExcluded("AdjustInventory")).toBe(false);
    expect(scope.isCommandExcluded("SupplierReturn")).toBe(false);
  });
});
