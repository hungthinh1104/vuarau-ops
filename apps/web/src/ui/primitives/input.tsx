"use client";

import type { InputHTMLAttributes } from "react";
import { INPUT_CLASS } from "./field.tsx";

/**
 * Low-level input primitive for screens that already own their semantic label.
 * Higher-level forms should prefer TextInput so the label and error wiring stay
 * together; this primitive exists so the remaining wrapped controls still share
 * exactly the same visual and focus contract.
 */
export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...rest }: InputProps) {
  return <input {...rest} className={[INPUT_CLASS, className].filter(Boolean).join(" ")} />;
}
