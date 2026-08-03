import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRoutingContracts } from "./docs-check.ts";

const paths = [
  "AGENTS.md",
  "docs/README.md",
  "docs/10-ai-coding/REPO_MAP.md",
  "docs/10-ai-coding/REVIEW_CHECKLIST.md",
  "docs/10-ai-coding/CHANGE_PROTOCOL.md",
  "docs/10-ai-coding/ENGINEERING_STANDARD.md",
  "docs/WEB-ADMIN.md",
] as const;

function sources(): Record<string, string> {
  return Object.fromEntries(paths.map((path) => [path, readFileSync(path, "utf8")]));
}

test("current routing documents satisfy the canonical contracts", () => {
  assert.deepEqual(checkRoutingContracts(sources()), []);
});

test("authority order is owned by docs/README.md", () => {
  const fixture = sources();
  fixture["docs/README.md"] = fixture["docs/README.md"]!.replace(
    "**Runtime and persistence facts**",
    "**Evidence and release status**",
  );
  assert.ok(checkRoutingContracts(fixture).some((failure) => failure.includes("authority-order")));
});

test("stale repository-map snapshots fail the regression check", () => {
  const fixture = sources();
  fixture["docs/10-ai-coding/REPO_MAP.md"] += "\nPlaywright skeleton\n";
  assert.ok(
    checkRoutingContracts(fixture).some((failure) => failure.includes("stale repository claim")),
  );
});

test("the db boundary allows domain-kernel but forbids apps", () => {
  const fixture = sources();
  fixture["docs/10-ai-coding/REVIEW_CHECKLIST.md"] = fixture[
    "docs/10-ai-coding/REVIEW_CHECKLIST.md"
  ]!.replace(
    "may import `domain-contracts` and `domain-kernel`",
    "does not import `domain-kernel`",
  );
  assert.ok(checkRoutingContracts(fixture).some((failure) => failure.includes("db boundary")));
});

test("documentation-first wording cannot outrank runtime facts", () => {
  const fixture = sources();
  fixture["docs/10-ai-coding/CHANGE_PROTOCOL.md"] +=
    "\nThe docs are the specification, not a description written afterwards.\n";
  assert.ok(
    checkRoutingContracts(fixture).some((failure) => failure.includes("documentation-first")),
  );
});

test("layered validation policy is required", () => {
  const fixture = sources();
  fixture["AGENTS.md"] = fixture["AGENTS.md"]!.replace(
    "Use the smallest validation scope",
    "Use broad validation",
  );
  assert.ok(
    checkRoutingContracts(fixture).some((failure) => failure.includes("layered validation policy")),
  );
});

test("verify is not allowed as the default edit-loop command", () => {
  const fixture = sources();
  fixture["docs/10-ai-coding/CHANGE_PROTOCOL.md"] +=
    "\nEvery implementation edit must run pnpm verify.\n";
  assert.ok(
    checkRoutingContracts(fixture).some((failure) => failure.includes("stale validation rule")),
  );
});

test("engineering standard delegates dependency graph to REPO_MAP", () => {
  const fixture = sources();
  fixture["docs/10-ai-coding/ENGINEERING_STANDARD.md"] = fixture[
    "docs/10-ai-coding/ENGINEERING_STANDARD.md"
  ]!.replace("[REPO_MAP.md](REPO_MAP.md)", "dependency graph");
  assert.ok(
    checkRoutingContracts(fixture).some((failure) => failure.includes("canonical dependency map")),
  );
});

test("analytics candidates stay blocked until their business policy exists", () => {
  const fixture = sources();
  fixture["docs/WEB-ADMIN.md"] = fixture["docs/WEB-ADMIN.md"]!.replace(
    "#### Policy gate",
    "#### Dashboard ideas",
  );
  assert.ok(
    checkRoutingContracts(fixture).some((failure) => failure.includes("analytics candidates")),
  );
});

test("next-phase management capabilities stay policy-blocked", () => {
  const backlog = readFileSync("docs/09-decisions/decision-backlog.md", "utf8");
  const worksheet = readFileSync("docs/09-decisions/policy-closure-worksheet.md", "utf8");
  const audit = readFileSync("docs/02-use-cases/use-case-completeness-audit.md", "utf8");

  for (let id = 39; id <= 48; id += 1) {
    const token = `ASM-${String(id).padStart(3, "0")}`;
    const row = backlog.match(new RegExp(`^\\| ${token} \\|.*$`, "m"))?.[0] ?? "";
    assert.match(row, /\*\*policy-blocked\*\*/);
    assert.match(row, /policy-closure-worksheet\.md/);
    assert.match(worksheet, new RegExp(token));
  }
  assert.match(audit, /Cost and profit[\s\S]*ASM-039\/040/);
  assert.match(audit, /Inventory planning[\s\S]*ASM-042\/ASM-043/);
});
