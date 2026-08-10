import { readFileSync } from "node:fs";
import {
  evaluateCrossDimensionScenarioGate,
  readPilotConfig,
  type PilotConfig,
} from "./pilot-config.ts";

/** Commands whose business meaning is explicitly outside the shadow pilot. */
const PILOT_EXCLUDED_COMMANDS = ["VoidSale", "VoidPurchase", "RecordDeliveryReturn"] as const;

export type PilotScope = {
  readonly isCommandExcluded: (commandType: string) => boolean;
};

export type PilotRuntimeConfig = {
  readonly config: PilotConfig;
  readonly scope: PilotScope;
};

export type PilotRuntimeResult =
  | { readonly ok: true; readonly runtime: PilotRuntimeConfig }
  | { readonly ok: false; readonly problems: readonly string[] };

export function createPilotScope(): PilotScope {
  const excluded = new Set<string>(PILOT_EXCLUDED_COMMANDS);
  return { isCommandExcluded: (commandType) => excluded.has(commandType) };
}

/**
 * Startup-only checks. These are deliberately stricter than the readiness CLI:
 * a readiness report may explain a blocked deployment, but a pilot API must not
 * answer a request with a release or scope it cannot prove.
 */
export function readPilotRuntimeConfig(
  configPath: string,
  deployedReleaseSha: string,
): PilotRuntimeResult {
  let raw: string;
  try {
    raw = readFileSync(configPath, "utf8");
  } catch {
    return { ok: false, problems: ["PILOT_CONFIG_PATH does not point to a readable declaration"] };
  }

  const parsed = readPilotConfig(raw);
  if (!parsed.ok) {
    return {
      ok: false,
      problems: parsed.problems.map((problem) => `pilot declaration: ${problem}`),
    };
  }

  const problems = validatePilotRuntimeConfig(parsed.config, deployedReleaseSha);
  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    runtime: {
      config: parsed.config,
      scope: createPilotScope(),
    },
  };
}

export function validatePilotRuntimeConfig(
  config: PilotConfig,
  deployedReleaseSha: string,
): readonly string[] {
  const problems: string[] = [];
  if (config.mode !== "shadow") {
    problems.push("pilot declaration mode must be shadow");
  }
  if (config.releaseSha !== deployedReleaseSha) {
    problems.push("pilot declaration releaseSha does not match APP_RELEASE_SHA");
  }
  if (config.commercialRecognitionConfirmation.decision !== "accepted") {
    problems.push("ASM-024 must be owner-accepted before PostSale is available");
  }
  if (config.supplierPayableRecognitionConfirmation.decision !== "accepted") {
    problems.push("ASM-025 must be owner-accepted before ConfirmPurchase is available");
  }

  const excludedGate = (name: string, gate: PilotConfig["saleFulfilmentCorrectionGate"]): void => {
    if (gate.disposition !== "excluded_from_shadow_scope" || gate.stopIfEncountered !== true) {
      problems.push(`${name} must be excluded_from_shadow_scope with stopIfEncountered=true`);
    }
  };
  excludedGate("ASM-035", config.saleFulfilmentCorrectionGate);
  excludedGate("ASM-036", config.purchaseReceivingCorrectionGate);
  excludedGate("ASM-037", config.partialCustomerReturnGate);
  excludedGate("ASM-038", config.supplierReturnGate);

  // Keep this relationship explicit: the same gate that makes the scope safe
  // also documents why the command is blocked. This prevents a future command
  // from silently reintroducing an excluded cross-dimension effect.
  for (const [name, gate] of [
    ["ASM-035", config.saleFulfilmentCorrectionGate],
    ["ASM-036", config.purchaseReceivingCorrectionGate],
    ["ASM-037", config.partialCustomerReturnGate],
    ["ASM-038", config.supplierReturnGate],
  ] as const) {
    if (!evaluateCrossDimensionScenarioGate(gate, deployedReleaseSha).ok) {
      problems.push(`${name} does not pass the cross-dimension scope evaluator`);
    }
  }

  return problems;
}

export function validatePilotWorkspace(
  workspace: { readonly name: string } | null,
  expectedName: string,
): readonly string[] {
  if (workspace === null) return ["pilot workspace does not exist"];
  return workspace.name === expectedName
    ? []
    : ["pilot workspace name does not match the operator-owned declaration"];
}
