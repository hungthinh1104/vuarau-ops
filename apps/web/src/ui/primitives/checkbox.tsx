"use client";

import type { InputHTMLAttributes } from "react";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function Checkbox({ className = "", ...rest }: CheckboxProps) {
  return (
    <input
      {...rest}
      type="checkbox"
      className={[
        "size-5 shrink-0 cursor-pointer rounded-sm border border-border bg-surface p-0 accent-brand",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
