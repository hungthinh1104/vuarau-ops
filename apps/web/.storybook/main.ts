import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/react-vite";

/**
 * `react-vite`, not `nextjs`.
 *
 * Every primitive and pattern in `src/ui` is plain React — no `next/link`, no
 * `next/navigation`, no server components — so Storybook does not need Next's
 * build at all, and the design system stays testable without one. Vite is already
 * in the workspace as Vitest's engine, so this adds a builder rather than a second
 * build system.
 *
 * If a component ever needs a Next primitive, that is the signal it belongs in
 * `src/app`, not in the design system.
 */
const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: [],
  core: { disableTelemetry: true },
  viteFinal: async (viteConfig) => {
    const sourceAlias = {
      find: "@",
      replacement: fileURLToPath(new URL("../src", import.meta.url)),
    };
    const existingAlias = viteConfig.resolve?.alias;
    viteConfig.resolve = {
      ...viteConfig.resolve,
      alias: Array.isArray(existingAlias)
        ? [...existingAlias, sourceAlias]
        : { ...(existingAlias ?? {}), "@": sourceAlias.replacement },
    };

    // The contracts package is workspace TypeScript source, so Vite has to
    // pre-bundle it like application code rather than treat it as a built dep.
    viteConfig.optimizeDeps = {
      ...viteConfig.optimizeDeps,
      exclude: [
        ...(viteConfig.optimizeDeps?.exclude ?? []),
        "@vuarau/domain-contracts",
        "@vuarau/test-fixtures",
      ],
    };

    /*
     * `"use client"` is meaningful to Next and meaningless to a plain browser
     * bundle, so Rollup warns once per component that it dropped the directive.
     * That is the correct behaviour, and fourteen copies of it drown out a
     * warning worth reading.
     */
    viteConfig.build = {
      ...viteConfig.build,
      rollupOptions: {
        ...viteConfig.build?.rollupOptions,
        onwarn(warning, defaultHandler) {
          if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
          defaultHandler(warning);
        },
      },
    };

    return viteConfig;
  },
};

export default config;
