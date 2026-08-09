import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export type TestArchitectureIssue = {
  readonly path: string;
  readonly message: string;
  readonly severity: "warning" | "error";
};

export const TEST_FILE_BUDGETS = [
  { prefix: "apps/api/src/", maxLines: 1_100, warnLines: 850 },
  { prefix: "packages/db/src/", maxLines: 600, warnLines: 450 },
  { prefix: "packages/domain-kernel/src/", maxLines: 550, warnLines: 425 },
  { prefix: "packages/domain-contracts/src/", maxLines: 400, warnLines: 300 },
  { prefix: "apps/web/src/", maxLines: 550, warnLines: 400 },
  { prefix: "apps/web/e2e/", maxLines: 550, warnLines: 400 },
  { prefix: "scripts/", maxLines: 260, warnLines: 200 },
] as const;

export function inspectTestFiles(
  files: readonly { path: string; source: string }[],
): readonly TestArchitectureIssue[] {
  const issues: TestArchitectureIssue[] = [];
  for (const file of files) {
    const lineCount = file.source.split("\n").length;
    const budget = TEST_FILE_BUDGETS.find((candidate) => file.path.startsWith(candidate.prefix));
    if (budget !== undefined && lineCount > budget.maxLines) {
      issues.push({
        path: file.path,
        severity: "error",
        message: `${lineCount} lines exceeds the ${budget.maxLines}-line test budget`,
      });
    } else if (budget !== undefined && lineCount > budget.warnLines) {
      issues.push({
        path: file.path,
        severity: "warning",
        message: `${lineCount} lines is above the ${budget.warnLines}-line refactor warning`,
      });
    }

    if (file.path.startsWith("apps/web/e2e/") && /waitForTimeout\s*\(/.test(file.source)) {
      issues.push({
        path: file.path,
        severity: "error",
        message: "E2E must wait for observable state, not a fixed timeout",
      });
    }
  }
  return issues;
}

export function styleAssertionFiles(
  files: readonly { path: string; source: string }[],
): readonly string[] {
  return files
    .filter(({ source }) => /toHaveClass\s*\(/.test(source))
    .map(({ path }) => path)
    .sort();
}

export function classifyTestFile(source: string): "style-contract" | "behavioral" {
  return /toHaveClass\s*\(/.test(source) ? "style-contract" : "behavioral";
}

function trackedTestFiles(): readonly string[] {
  const tracked = execFileSync("git", ["ls-files", "--", "apps", "packages", "scripts"], {
    encoding: "utf8",
  });
  const untracked = execFileSync(
    "git",
    ["ls-files", "--others", "--exclude-standard", "--", "apps", "packages", "scripts"],
    { encoding: "utf8" },
  );
  return [...new Set(`${tracked}\n${untracked}`.split("\n"))].filter((path) =>
    /(?:\.test\.tsx?|\.spec\.ts)$/.test(path),
  );
}

export function runTestArchitectureCheck(): void {
  const files = trackedTestFiles().map((path) => ({ path, source: readFileSync(path, "utf8") }));
  const issues = inspectTestFiles(files);
  const errors = issues.filter((issue) => issue.severity === "error");
  for (const issue of issues) {
    const prefix = issue.severity === "error" ? "✗" : "⚠";
    console.log(`${prefix} test-architecture: ${issue.path} — ${issue.message}`);
  }
  const styles = styleAssertionFiles(files);
  const behavioralCount = files.length - styles.length;
  console.log(
    `✓ test-architecture: ${files.length} test files; ` +
      `${styles.length} style-contract and ${behavioralCount} behavioral files identified separately.`,
  );
  if (errors.length > 0) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) runTestArchitectureCheck();
