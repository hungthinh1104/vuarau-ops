import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const ROUTERS = join(ROOT, "apps/api/src/infrastructure/trpc/routers");
const failures: string[] = [];
let queries = 0;
let commands = 0;

for (const entry of readdirSync(ROUTERS)
  .filter((name) => name.endsWith(".ts"))
  .sort()) {
  const path = join(ROUTERS, entry);
  const sourceText = readFileSync(path, "utf8");
  const source = ts.createSourceFile(path, sourceText, ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      (node.expression.name.text === "query" || node.expression.name.text === "mutation")
    ) {
      const chain = node.expression.expression.getText(source);
      const procedure =
        chain.includes("authenticatedProcedure") || chain.includes("commandProcedure");
      if (!procedure) {
        const position = source.getLineAndCharacterOfPosition(node.getStart(source));
        failures.push(
          `${relative(ROOT, path)}:${position.line + 1} is not rooted in an authenticated procedure`,
        );
      }
      if (node.expression.name.text === "query") queries += 1;
      else commands += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

const publicFiles = [
  "apps/api/src/server.ts",
  "apps/api/src/modules/document/public-document.ts",
].map((path) => readFileSync(join(ROOT, path), "utf8"));
const publicRoutes = [
  ...publicFiles.join("\n").matchAll(/["'`]\/(health\/\w+|metrics|public\/documents\/)/g),
]
  .map((match) => match[1])
  .filter((value, index, all) => all.indexOf(value) === index)
  .sort();
if (publicFiles.join("\n").includes("\\/public\\/documents\\/")) {
  publicRoutes.push("public/documents/");
  publicRoutes.sort();
}
const expectedPublic = ["health/live", "health/ready", "metrics", "public/documents/"].sort();
if (JSON.stringify(publicRoutes) !== JSON.stringify(expectedPublic)) {
  failures.push(`public route allowlist changed: ${publicRoutes.join(", ")}`);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.warn(
  `✓ security-surface-check: ${commands} command and ${queries} query procedures authenticated; public surface allowlist unchanged.`,
);
