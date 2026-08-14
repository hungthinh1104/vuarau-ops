import { test } from "node:test";
import assert from "node:assert/strict";
import { checkDocumentationGovernance, resolveIdentity } from "./documentation-governance-check.ts";

const registry = {
  roles: ["normative", "evidence", "process"],
  statuses: ["active", "historical", "superseded"],
  defaults: { status: "active", supersedes: "none", verified_against_sha: "not-applicable" },
  directory_defaults: { docs: { role: "process", source_of_truth: "process:docs" } },
  overrides: {},
  evidence_rules: { run_requires_exact_sha: true, latest_pass_requires_mechanical_sha_check: true },
};

test("directory defaults provide the full document identity", () => {
  assert.deepEqual(resolveIdentity("docs/01-domain/glossary.md", registry), {
    status: "active",
    supersedes: "none",
    verified_against_sha: "not-applicable",
    role: "process",
    source_of_truth: "process:docs",
  });
});

test("run evidence must carry an exact release SHA", () => {
  const failures = checkDocumentationGovernance({
    registry: {
      ...registry,
      overrides: {
        "docs/run.md": {
          status: "active",
          role: "evidence",
          source_of_truth: "evidence:manifest",
          supersedes: "none",
          verified_against_sha: "release-manifest",
          evidence_kind: "run",
        },
      },
    },
    documents: { "docs/run.md": "Latest PASS was recorded." },
  });
  assert.ok(failures.length >= 1);
  assert.match(failures[0]!, /exact 40-character release SHA/);
});

test("historical archive documents are exempt from active registry entries", () => {
  assert.deepEqual(
    checkDocumentationGovernance({ registry, documents: { "docs/archive/old.md": "old" } }),
    [],
  );
});
