import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "yaml";

const ROOT = process.cwd();
const DOCS = join(ROOT, "docs");
const REGISTRY_PATH = "docs/10-ai-coding/documentation-governance.yml";
const SHA = /^[0-9a-f]{40}$/;

type Identity = {
  status?: string;
  role?: string;
  source_of_truth?: string;
  supersedes?: string | null;
  verified_against_sha?: string;
  evidence_kind?: string;
};

type GovernanceRegistry = {
  roles?: string[];
  statuses?: string[];
  defaults?: Identity;
  directory_defaults?: Record<string, Identity>;
  overrides?: Record<string, Identity>;
  evidence_rules?: {
    run_requires_exact_sha?: boolean;
    latest_pass_requires_mechanical_sha_check?: boolean;
  };
};

function markdownFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) files.push(...markdownFiles(full));
    else if (entry.endsWith(".md")) files.push(full);
  }
  return files;
}

function relativeDocPath(file: string): string {
  return relative(ROOT, file).split("\\").join("/");
}

export function resolveIdentity(path: string, registry: GovernanceRegistry): Identity | undefined {
  const override = registry.overrides?.[path];
  if (override !== undefined) return { ...registry.defaults, ...override };
  const defaults = Object.entries(registry.directory_defaults ?? {})
    .filter(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))
    .sort(([left], [right]) => right.length - left.length);
  return defaults[0] === undefined ? undefined : { ...registry.defaults, ...defaults[0][1] };
}

export function checkDocumentationGovernance(args: {
  readonly registry: GovernanceRegistry;
  readonly documents: Readonly<Record<string, string>>;
  readonly sha?: string;
}): string[] {
  const failures: string[] = [];
  const roles = new Set(args.registry.roles ?? []);
  const statuses = new Set(args.registry.statuses ?? []);
  const exactSha = args.sha ?? "";

  for (const [path, source] of Object.entries(args.documents)) {
    const historical = path.startsWith("docs/archive/");
    const identity = historical
      ? {
          status: "historical",
          role: "evidence",
          source_of_truth: "archive:record",
          supersedes: "none",
          verified_against_sha: "not-applicable",
        }
      : resolveIdentity(path, args.registry);
    if (identity === undefined) {
      failures.push(`${path}: no documentation identity in governance registry`);
      continue;
    }
    for (const field of [
      "status",
      "role",
      "source_of_truth",
      "supersedes",
      "verified_against_sha",
    ] as const) {
      const value = identity[field];
      if (value === undefined || value === "")
        failures.push(`${path}: identity is missing ${field}`);
    }
    if (identity.status !== undefined && !statuses.has(identity.status)) {
      failures.push(`${path}: invalid documentation status ${identity.status}`);
    }
    if (identity.role !== undefined && !roles.has(identity.role)) {
      failures.push(`${path}: invalid documentation role ${identity.role}`);
    }
    if (historical && identity.status !== "historical") {
      failures.push(`${path}: archive documents must be historical`);
    }
    if (!historical && identity.status === "historical") {
      failures.push(
        `${path}: active tree document cannot be historical without moving to docs/archive`,
      );
    }

    const isRunEvidence = identity.evidence_kind === "run";
    const shaValues = [...source.matchAll(/\b[0-9a-f]{40}\b/g)].map((match) => match[0]!);
    if (
      isRunEvidence &&
      args.registry.evidence_rules?.run_requires_exact_sha === true &&
      shaValues.length === 0
    ) {
      failures.push(`${path}: run evidence has no exact 40-character release SHA`);
    }
    if (
      args.registry.evidence_rules?.latest_pass_requires_mechanical_sha_check === true &&
      /latest[\s\S]{0,120}\b(?:PASS|passed|pass)\b|\b(?:PASS|passed)\b[\s\S]{0,120}latest/i.test(
        source,
      ) &&
      shaValues.length === 0
    ) {
      failures.push(`${path}: latest PASS claim is not bound to an exact SHA`);
    }
    if (
      isRunEvidence &&
      exactSha.length > 0 &&
      SHA.test(exactSha) &&
      shaValues.includes(exactSha)
    ) {
      // This is deliberately informational: historical evidence can name an
      // older SHA. A current release is only verified by rerunning the gate.
    }
  }
  return failures;
}

function main(): void {
  if (!existsSync(join(ROOT, REGISTRY_PATH))) {
    console.error(`✗ documentation-governance-check: missing ${REGISTRY_PATH}`);
    process.exit(1);
  }
  const registry = parse(readFileSync(join(ROOT, REGISTRY_PATH), "utf8")) as GovernanceRegistry;
  const documents = Object.fromEntries(
    markdownFiles(DOCS).map((file) => [relativeDocPath(file), readFileSync(file, "utf8")]),
  );
  const configuredSha = process.env["GIT_COMMIT_SHA"];
  const failures = checkDocumentationGovernance({
    registry,
    documents,
    ...(configuredSha === undefined ? {} : { sha: configuredSha }),
  });
  if (failures.length > 0) {
    console.error(`✗ documentation-governance-check: ${failures.length} failure(s)`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  const activeCount = Object.keys(documents).filter(
    (path) => !path.startsWith("docs/archive/"),
  ).length;
  const historicalCount = Object.keys(documents).length - activeCount;
  console.log(
    `✓ documentation-governance-check: ${activeCount} active and ${historicalCount} historical documents have identity, authority and evidence rules.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
