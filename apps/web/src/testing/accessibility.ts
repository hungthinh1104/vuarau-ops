import axe from "axe-core";

/**
 * A real axe run against the rendered DOM, not a matcher library wrapping one.
 *
 * `axe-core` is the engine every jest/vitest axe integration uses; calling it
 * directly is one dependency instead of two and makes the rule set explicit rather
 * than inherited from a preset that changes between versions.
 *
 * The rules chosen are the ones a component can actually be responsible for. Colour
 * contrast is excluded because jsdom does not compute styles, so the check would
 * pass for a reason unrelated to whether the contrast is good — contrast is a token
 * decision and it is fixed in design.md.
 */
const RULES: Readonly<Record<string, { enabled: boolean }>> = {
  "color-contrast": { enabled: false },
  region: { enabled: false },
};

export async function expectNoAccessibilityViolations(container: Element): Promise<void> {
  const results = await axe.run(container, { rules: RULES });

  if (results.violations.length > 0) {
    const summary = results.violations
      .map((violation) => {
        const targets = violation.nodes.map((node) => node.target.join(" ")).join(", ");
        return `  • ${violation.id}: ${violation.help}\n    ${targets}`;
      })
      .join("\n");
    throw new Error(`axe found ${results.violations.length} violation(s):\n${summary}`);
  }
}
