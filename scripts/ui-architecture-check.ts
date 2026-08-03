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
