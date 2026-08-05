import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

export type UiArchitectureResult = {
  readonly checked: number;
  readonly failures: readonly string[];
};

const SOURCE_PATTERN = /\.[cm]?[jt]sx?$/;
const TEST_OR_STORY = /\.(test|spec|stories)\.[cm]?[jt]sx?$/;
const IMPORT_PATTERN = /(?:from\s*["']|import\s*["'])([^"']+)["']/g;
const ROUTE_HTML =
  /<(?:div|section|main|header|footer|form|table|button|input|select|textarea|ul|ol|li|p|h[1-6])\b/;
const NATIVE_CONTROL = /<(?:button|input|select|textarea)\b/;
const PILL_CONTAINER =
  /<(?:article|details|div|fieldset|output|section)\b[^>]*className="[^"]*\brounded-button\b/;
const VISUAL_TOKEN_ESCAPE =
  /(?:font-(?:mono|serif)|font-\[[^\]]+\]|(?:bg|text|border)-\[(?:#|rgb|hsl)|(?:linear|radial|conic)-gradient)/;
const VISIBLE_COPY_PROP =
  /\b(?:label|title|description|placeholder|hint|aria-label|message|attemptedAction|loadingLabel|serverIssue|unitNotice)\s*(?:=|:)\s*["'`]([^\n"'`]+)["'`]/g;
const JSX_TEXT = /<([A-Za-z][\w-]*)\b[^>]*>\s*([A-Za-zÀ-ỹ][^<{]*?)\s*<\/\1>/g;
const RAW_ENUM_RENDER =
  /<(?:p|span|dd|dt|li|strong|small|h[1-6]|Badge|output)\b[^>]*>\s*\{[^}]*\.(?:reasonCode|blockedReason|severity|outcome|classification|status|state)\s*\}/;
const VISIBLE_ENGINEERING_TERMS = [
  "policy",
  "workspace",
  "receiving",
  "metadata",
  "semantics",
  "asm-",
  "goods truth",
  "commercial truth",
  "commercial/money truth",
  "physical truth",
  "evidence",
  "forecast",
  "reorder",
  "cogs",
  "profit",
  "append-only",
  "canonical",
  "effect",
  "rule",
  "claim",
  "lead time",
  "phẩm cấp",
  "kiểm định",
  "cách ly",
  "từ chối",
  "hủy bỏ",
  "hàng đến",
  "phiếu nhận hàng",
  "nguồn chứng cứ vận hành",
  "gross",
  "tare",
  "net",
];

function visibleCopyOf(source: string): string[] {
  return [
    ...[...source.matchAll(JSX_TEXT)].map((match) => match[2]!.trim()),
    ...[...source.matchAll(VISIBLE_COPY_PROP)].map((match) => match[1]!.trim()),
  ].filter(Boolean);
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

async function* sourceFiles(directory: string): AsyncGenerator<string> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if (SOURCE_PATTERN.test(entry.name) && !TEST_OR_STORY.test(entry.name)) yield path;
  }
}

function importsOf(source: string): readonly string[] {
  return [...source.matchAll(IMPORT_PATTERN)].map((match) => match[1]!).filter(Boolean);
}

function hasAnyImport(imports: readonly string[], patterns: readonly RegExp[]): boolean {
  return imports.some((value) => patterns.some((pattern) => pattern.test(value)));
}

function checkImports(
  relativePath: string,
  imports: readonly string[],
  forbidden: readonly { readonly pattern: RegExp; readonly message: string }[],
): string[] {
  return forbidden
    .filter(({ pattern }) => hasAnyImport(imports, [pattern]))
    .map(({ message }) => `${relativePath}: ${message}`);
}

export async function checkUiArchitecture(root: string): Promise<UiArchitectureResult> {
  const failures: string[] = [];
  let checked = 0;
  const webRoot = join(root, "apps/web/src");

  for await (const absolutePath of sourceFiles(webRoot)) {
    const path = relative(root, absolutePath);
    const source = await readFile(absolutePath, "utf8");
    const imports = importsOf(source);
    checked += 1;

    if (
      path.includes("/ui/screens/") ||
      path.includes("/ui/patterns/") ||
      path.includes("/ui/landing/") ||
      path.includes("/ui/controllers/") ||
      path.endsWith("/ui/copy.ts")
    ) {
      const renderSource = withoutComments(source);
      const visibleCopy = visibleCopyOf(renderSource);
      const forbiddenTerm = VISIBLE_ENGINEERING_TERMS.find((term) =>
        visibleCopy.some((copy) => copy.toLowerCase().includes(term)),
      );
      if (forbiddenTerm !== undefined) {
        failures.push(
          `${path}: visible copy contains forbidden engineering term "${forbiddenTerm}"`,
        );
      }
      if (RAW_ENUM_RENDER.test(renderSource)) {
        failures.push(`${path}: renders a raw domain enum; use the authoritative UI copy registry`);
      }
    }

    if (path.includes("/ui/primitives/")) {
      failures.push(
        ...checkImports(path, imports, [
          {
            pattern: /^@\/(?:api|offline)\//,
            message: "primitive imports application infrastructure",
          },
          { pattern: /^@vuarau\//, message: "primitive imports a workspace package" },
          {
            pattern: /^@\/ui\/(?:patterns|screens)\//,
            message: "primitive imports an upper UI layer",
          },
        ]),
      );
    }

    if (path.includes("/ui/patterns/")) {
      failures.push(
        ...checkImports(path, imports, [
          {
            pattern: /^@\/(?:api|offline)\//,
            message:
              "pattern imports application infrastructure; move orchestration to a controller",
          },
          { pattern: /^@trpc\//, message: "pattern imports tRPC" },
          { pattern: /^@tanstack\/react-query$/, message: "pattern imports a query hook" },
          { pattern: /^@\/ui\/screens\//, message: "pattern imports a screen" },
        ]),
      );
    }

    if (path.includes("/ui/screens/")) {
      if (NATIVE_CONTROL.test(source)) {
        failures.push(`${path}: screen contains a native control; use a ui/primitives control`);
      }
      failures.push(
        ...checkImports(path, imports, [
          {
            pattern: /^@\/(?:api|offline)\//,
            message: "screen imports application infrastructure",
          },
          { pattern: /^@trpc\//, message: "screen imports tRPC" },
          { pattern: /^@tanstack\/react-query$/, message: "screen imports a query hook" },
        ]),
      );
    }

    if (path.includes("/ui/patterns/") && NATIVE_CONTROL.test(source)) {
      failures.push(`${path}: pattern contains a native control; use a ui/primitives control`);
    }

    if (
      (path.includes("/ui/patterns/") || path.includes("/ui/screens/")) &&
      PILL_CONTAINER.test(source)
    ) {
      failures.push(
        `${path}: data container uses the button pill radius; use rounded-card or rounded-input`,
      );
    }

    if (path.includes("/ui/") && VISUAL_TOKEN_ESCAPE.test(source)) {
      failures.push(
        `${path}: visual styling bypasses the shared design tokens; use the Be Vietnam Pro type and semantic color/radius tokens`,
      );
    }

    if (path.includes("/ui/controllers/")) {
      if (/\bas never\b/.test(source)) {
        failures.push(`${path}: controller bypasses the command contract with as never`);
      }
      if (
        /className\s*=|<(?:div|section|main|header|footer|form|table|button|input|select|textarea|ul|ol|li|p|h[1-6])\b/.test(
          source,
        )
      ) {
        failures.push(`${path}: controller contains visual composition`);
      }
    }

    if (path.includes("/app/") && path.endsWith("/page.tsx")) {
      if (/^\s*"use client";\s*$/m.test(source)) {
        failures.push(
          `${path}: route wrapper must stay server-rendered; keep the client boundary in the controller`,
        );
      }
      if (ROUTE_HTML.test(source))
        failures.push(`${path}: route owns visual markup; render a screen`);
      if (hasAnyImport(imports, [/^@\/ui\/(?:primitives|patterns)\//])) {
        failures.push(`${path}: route bypasses controller/screen with a UI layer import`);
      }
      if (!hasAnyImport(imports, [/^@\/ui\/controllers\//])) {
        failures.push(`${path}: route must delegate to a controller`);
      }
    }
  }

  return { checked, failures };
}
