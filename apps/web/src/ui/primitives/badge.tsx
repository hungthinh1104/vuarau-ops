import type { ReactNode } from "react";

/**
 * Tones map onto the colour rules in design.md, and every badge carries **text**.
 *
 * "Never communicate status by colour alone" is not only an accessibility rule
 * here: a depot's screen is read in daylight, on a cracked phone, by somebody who
 * is not looking closely. A grey pill saying "Đã bỏ" survives all three; a grey
 * pill saying nothing does not.
 */
export type BadgeTone = "neutral" | "positive" | "warning" | "danger" | "info" | "offline";

const TONE_CLASS: Readonly<Record<BadgeTone, string>> = {
  neutral: "bg-surface-muted text-ink-muted border-border",
  positive: "bg-leaf-soft text-leaf border-leaf/30",
  warning: "bg-warning-soft text-warning border-warning/30",
  danger: "bg-danger-soft text-danger border-danger/30",
  info: "bg-info-soft text-info border-info/30",
  offline: "bg-offline-soft text-offline border-offline/30",
};

export type BadgeProps = {
  readonly tone?: BadgeTone;
  readonly children: ReactNode;
};

export function Badge({ tone = "neutral", children }: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-pill border px-2 py-0.5",
        "text-caption font-medium whitespace-nowrap",
        TONE_CLASS[tone],
      ].join(" ")}
    >
      {children}
    </span>
  );
}
