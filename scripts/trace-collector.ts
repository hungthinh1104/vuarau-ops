import { readFileSync } from "node:fs";
import ts from "typescript";

export type TestLayer = "domain" | "application" | "contract" | "db" | "web" | "e2e" | "check";

export type CollectedTraceTest = {
  readonly id: string;
  readonly file: string;
  readonly layer: TestLayer;
  readonly evidence: "test-title" | "attached-test-comment";
  readonly line: number;
};

const TEST_ID = /\bTC-[A-Z0-9_-]+-\d{3}\b/g;
const TEST_CALL_NAMES = new Set(["it", "test", "specify", "describe"]);

function callName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return callName(expression.expression);
  if (ts.isCallExpression(expression)) return callName(expression.expression);
  return null;
}

function idsIn(text: string): readonly string[] {
  return [...new Set(text.match(TEST_ID) ?? [])];
}

function titleText(node: ts.Expression | undefined): string | null {
  if (node === undefined) return null;
  return ts.isStringLiteralLike(node) ? node.text : null;
}

function lineOf(sourceFile: ts.SourceFile, position: number): number {
  return sourceFile.getLineAndCharacterOfPosition(position).line + 1;
}

function attachedCommentText(source: string, node: ts.Node): string {
  const texts = new Set<string>();
  let current: ts.Node | undefined = node;
  while (current !== undefined) {
    for (const comment of ts.getLeadingCommentRanges(source, current.getFullStart()) ?? []) {
      texts.add(source.slice(comment.pos, comment.end));
    }
    if (ts.isCallExpression(current) || ts.isPropertyAccessExpression(current)) {
      current = current.expression;
    } else {
      current = undefined;
    }
  }
  return [...texts].join("\n");
}

export function testLayerForPath(file: string): TestLayer | null {
  if (file.startsWith("apps/web/e2e/") && file.endsWith(".spec.ts")) return "e2e";
  if (file.endsWith(".db.test.ts")) return "db";
  if (file.endsWith(".contract.test.ts")) return "contract";
  if (file.endsWith(".app.test.ts")) return "application";
  if (
    (file.startsWith("packages/domain-kernel/") || file.startsWith("packages/domain-contracts/")) &&
    file.endsWith(".test.ts")
  ) {
    return "domain";
  }
  if (
    file.startsWith("apps/web/src/") &&
    (file.endsWith(".test.ts") || file.endsWith(".test.tsx"))
  ) {
    return "web";
  }
  if (file.startsWith("scripts/") && file.endsWith(".test.ts")) return "check";
  return null;
}

export function collectTraceTestsFromSource(
  source: string,
  file: string,
): readonly CollectedTraceTest[] {
  const layer = testLayerForPath(file);
  if (layer === null) return [];

  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const collected: CollectedTraceTest[] = [];
  const seenIds = new Set<string>();
  const add = (
    ids: readonly string[],
    evidence: CollectedTraceTest["evidence"],
    node: ts.Node,
  ): void => {
    for (const id of ids) {
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      collected.push({
        id,
        file,
        layer,
        evidence,
        line: lineOf(sourceFile, node.getStart(sourceFile)),
      });
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && TEST_CALL_NAMES.has(callName(node.expression) ?? "")) {
      const titleIds = idsIn(titleText(node.arguments[0]) ?? "");
      add(titleIds, "test-title", node);
      const attachedIds = idsIn(attachedCommentText(source, node)).filter(
        (id) => !titleIds.includes(id),
      );
      add(attachedIds, "attached-test-comment", node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return collected;
}

export function collectTraceTests(file: string): readonly CollectedTraceTest[] {
  return collectTraceTestsFromSource(readFileSync(file, "utf8"), file);
}
