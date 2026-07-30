import type { ReactNode } from "react";
import { Badge, type BadgeTone } from "../primitives/badge.tsx";

export type StatusBadgeProps = {
  readonly status: string | ReactNode;
  /**
   * Tone must be explicitly provided rather than inferred.
   * e.g., "debt > X -> red" is a business rule, not a UI primitive rule.
   */
  readonly tone: BadgeTone;
};

/**
 * Renders business-specific statuses using the Badge primitive.
 * Strictly requires the caller to provide the semantic tone.
 */
export function StatusBadge({ status, tone }: StatusBadgeProps) {
  return <Badge tone={tone}>{status}</Badge>;
}
