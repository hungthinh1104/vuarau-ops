/**
 * Evidence references are operator-entered source links, not business effects.
 * One reference per line keeps paper/photo/receipt identifiers readable on a
 * phone while the contract still receives a bounded array.
 */
export function parseSourceEvidence(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\r\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

export function formatSourceEvidence(references: readonly string[]): string {
  return references.join("\n");
}
