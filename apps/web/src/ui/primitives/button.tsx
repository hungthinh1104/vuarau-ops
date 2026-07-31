"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Three tones, matching design.md: primary (Leaf), secondary (bordered), danger.
 *
 * `danger` is white-with-danger-text by default and only fills solid in a final
 * destructive confirmation, because a screen full of red buttons stops meaning
 * "careful" — which is the one thing this product needs the colour to mean.
 */
export type ButtonTone = "primary" | "secondary" | "danger" | "danger-solid";

const TONE_CLASS: Readonly<Record<ButtonTone, string>> = {
  primary: "bg-leaf text-white hover:bg-leaf-hover border border-transparent",
  secondary: "bg-surface text-ink border border-border hover:border-border-strong",
  danger: "bg-surface text-danger border border-danger/40 hover:border-danger",
  "danger-solid": "bg-danger text-white border border-transparent hover:opacity-90",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly tone?: ButtonTone;
  readonly fullWidth?: boolean;
  /**
   * Why the control is disabled, announced rather than only implied by greying.
   * A worker who cannot see why they cannot do their job finds a way around the
   * system, usually a paper one.
   */
  readonly disabledReason?: string;
  readonly children: ReactNode;
};

export function Button({
  tone = "primary",
  fullWidth = false,
  disabledReason,
  disabled,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled === true || disabledReason !== undefined;

  return (
    <button
      type="button"
      {...rest}
      disabled={isDisabled}
      // `title` is a fallback for pointer users; the visible reason is rendered
      // by CapabilityAction, which is what product code uses.
      {...(disabledReason !== undefined ? { title: disabledReason } : {})}
      aria-disabled={isDisabled}
      className={[
        "touch-target inline-flex min-h-[52px] items-center justify-center gap-2 rounded-button px-4 sm:min-h-11",
        "text-label font-semibold transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        TONE_CLASS[tone],
        fullWidth ? "w-full" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </button>
  );
}
