"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /**
   * Required, and there is no prop to omit it.
   *
   * design.md forbids icon-only *critical* actions outright; for the rest — close,
   * clear, expand — an icon with no accessible name is a control a screen reader
   * announces as "button", which is not a name.
   */
  readonly label: string;
  readonly children: ReactNode;
};

export function IconButton({ label, className = "", children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      aria-label={label}
      className={[
        "touch-target inline-flex items-center justify-center rounded-button",
        "text-ink-muted hover:text-ink hover:bg-surface-muted transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}
