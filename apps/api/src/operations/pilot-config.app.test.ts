import { describe, expect, it } from "vitest";
import {
  EXAMPLE_PILOT_CONFIG,
  evaluateCrossDimensionScenarioGate,
  readPilotConfig,
} from "./pilot-config.ts";

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
    sensitiveActionApprovalReview: review("Chủ vựa"),
    qualityGradePolicyReview: review("Chủ vựa"),
    receivingQualitySemanticsReview: review("Chủ vựa"),
    qualityRoleReview: review("Chủ vựa"),
    saleFulfilmentCorrectionGate: excludedScenario("Chủ vựa"),
    purchaseReceivingCorrectionGate: excludedScenario("Chủ vựa"),
    partialCustomerReturnGate: excludedScenario("Chủ vựa"),
    supplierReturnGate: excludedScenario("Chủ vựa"),
    driverCashCollectionGate: excludedScenario("Chủ vựa"),
    authenticationSmoke: {
      status: "pending" as const,
      owner: "platform owner",
      trigger: "two real Supabase accounts are provisioned",
    },
    deploymentEvidence: {
      status: "pending" as const,
      owner: "platform owner",
      trigger: "pilot infrastructure is deployed",
    },
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
      sensitiveActionApprovalReview: undefined,
      qualityGradePolicyReview: undefined,
      receivingQualitySemanticsReview: undefined,
      qualityRoleReview: undefined,
      saleFulfilmentCorrectionGate: undefined,
      partialCustomerReturnGate: undefined,
    };
    const result = readPilotConfig(JSON.stringify(incomplete));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems.join("\n")).toContain("releaseSha");
      expect(result.problems.join("\n")).toContain("commercialRecognitionConfirmation");
      expect(result.problems.join("\n")).toContain("dataSharingRetentionReview");
      expect(result.problems.join("\n")).toContain("sensitiveActionApprovalReview");
      expect(result.problems.join("\n")).toContain("qualityGradePolicyReview");
      expect(result.problems.join("\n")).toContain("receivingQualitySemanticsReview");
      expect(result.problems.join("\n")).toContain("qualityRoleReview");
      expect(result.problems.join("\n")).toContain("saleFulfilmentCorrectionGate");
      expect(result.problems.join("\n")).toContain("partialCustomerReturnGate");
    }
  });

  it("requires explicit quality-policy evidence rather than inferring it from configured grades", () => {
    const missing = { ...filled, qualityGradePolicyReview: undefined };
    const result = readPilotConfig(JSON.stringify(missing));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.join("\n")).toContain("qualityGradePolicyReview");
  });

  it("requires explicit cross-dimension scope gates rather than treating review as support", () => {
    const missing = { ...filled, supplierReturnGate: undefined };
    const result = readPilotConfig(JSON.stringify(missing));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.join("\n")).toContain("supplierReturnGate");
  });

  it("requires an explicit stop or release gate for driver cash collection", () => {
    const result = readPilotConfig(
      JSON.stringify({ ...filled, driverCashCollectionGate: undefined }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.join("\n")).toContain("driverCashCollectionGate");
  });

  it("passes an explicitly excluded scenario only with a stop-if-encountered declaration", () => {
    const gate = excludedScenario("Chủ vựa");
    expect(evaluateCrossDimensionScenarioGate(gate, "6".repeat(40))).toMatchObject({
      ok: true,
    });
    const invalid = readPilotConfig(
      JSON.stringify({
        ...filled,
        saleFulfilmentCorrectionGate: { ...gate, stopIfEncountered: false },
      }),
    );
    expect(invalid.ok).toBe(false);
  });

  it("rejects cross-dimension resolution evidence from a different release", () => {
    expect(
      evaluateCrossDimensionScenarioGate(
        {
          disposition: "resolved_in_release",
          reviewerName: "Chủ vựa",
          date: "2026-07-29",
          worksheetReference: "external://correction-review",
          releaseSha: "7".repeat(40),
          notes: "",
        },
        "6".repeat(40),
      ),
    ).toMatchObject({ ok: false });
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

  it("requires every real authentication boundary before smoke evidence can pass", () => {
    const result = readPilotConfig(
      JSON.stringify({
        ...filled,
        authenticationSmoke: {
          status: "passed",
          releaseSha: "6".repeat(40),
          evidenceReference: "external://auth-smoke",
          sameTabUserIsolation: true,
          tokenRefresh: true,
          sessionExpiry: true,
          remoteSignOut: true,
          unknownSubjectRejected: true,
          revokedMembershipRejected: false,
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.join("\n")).toContain("revokedMembershipRejected");
  });

  it("enforces the production RPO and RTO policy on declared recovery evidence", () => {
    const result = readPilotConfig(
      JSON.stringify({
        ...filled,
        recoveryEvidence: {
          status: "passed",
          releaseSha: "6".repeat(40),
          provider: "managed PostgreSQL",
          recoveryPoint: "external://recovery-point",
          pitrOrBackupIdentifier: "external://pitr-id",
          restoreStartedAt: "2026-07-29T01:00:00.000Z",
          restoreCompletedAt: "2026-07-29T02:01:00.000Z",
          measuredRpoMinutes: 16,
          measuredRtoMinutes: 61,
          migrationState: "current",
          integrityResult: "healthy",
          customerReconciliation: "consistent",
          supplierReconciliation: "consistent",
          inventoryReconciliation: "consistent",
          operator: "platform owner",
          incidentOrDeviationNotes: "",
          providerEvidenceReference: "external://provider",
          restoreDrillReference: "external://drill",
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems.join("\n")).toContain("measuredRpoMinutes");
      expect(result.problems.join("\n")).toContain("measuredRtoMinutes");
    }
  });

  it("does not accept a deployment declaration with a missing global edge limiter", () => {
    const result = readPilotConfig(
      JSON.stringify({
        ...filled,
        deploymentEvidence: {
          status: "passed",
          releaseSha: "6".repeat(40),
          evidenceReference: "external://deployment",
          realPhoneSmoke: true,
          managedPostgres17: true,
          cleanDatabaseDeployment: true,
          noDemoOrFixtureData: true,
          privateApi: true,
          privateDatabase: true,
          trustedProxyConfigured: true,
          globalEdgeRateLimitConfigured: false,
          healthAndReadinessPassed: true,
          safeMetricsAndLogging: true,
          noPublicServerSecrets: true,
          noJwtSecret: true,
          noSupabaseServiceRoleKey: true,
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.join("\n")).toContain("globalEdgeRateLimitConfigured");
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
function excludedScenario(reviewerName: string) {
  return {
    disposition: "excluded_from_shadow_scope" as const,
    reviewerName,
    date: "2026-07-29",
    worksheetReference: "external://cross-dimension-review",
    stopIfEncountered: true as const,
    notes: "",
  };
}
