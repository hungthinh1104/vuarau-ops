"use client";

import type { TextareaHTMLAttributes } from "react";
import { INPUT_CLASS } from "./field.tsx";

/** Low-level textarea primitive for screens that already own their semantic label. */
export type TextareaControlProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function TextareaControl({ className, ...rest }: TextareaControlProps) {
  return (
    <textarea
      {...rest}
      rows={rest.rows ?? 3}
      className={[INPUT_CLASS, "py-2 leading-relaxed", className].filter(Boolean).join(" ")}
    />
  );
}
