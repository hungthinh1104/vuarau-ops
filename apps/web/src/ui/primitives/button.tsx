"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { buttonClassName, type ButtonTone } from "./button-class-name.ts";
export { buttonClassName, type ButtonTone } from "./button-class-name.ts";

/**
 * Tones match docs/design.md: cyan primary, bordered secondary, restrained danger and link.
 *
 * `danger` is white-with-danger-text by default and only fills solid in a final
 * destructive confirmation, because a screen full of red buttons stops meaning
 * "careful" — which is the one thing this product needs the colour to mean.
 */
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
      className={buttonClassName(tone, fullWidth, className)}
    >
      {children}
    </button>
  );
}
