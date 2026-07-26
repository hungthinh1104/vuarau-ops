"use client";

import type { TextareaHTMLAttributes } from "react";
import { Field, INPUT_CLASS } from "./field.tsx";

export type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & {
  readonly label: string;
  readonly hint?: string;
  readonly error?: string;
};

/**
 * Used for the two places free text is mandatory: a void reason and a debt
 * adjustment reason. Both are what somebody disputing a balance six months later
 * actually reads (BR-SALE-014, BR-ACCOUNT-003), so the field is a paragraph, not
 * a one-line box that discourages writing one.
 */
export function Textarea({ label, hint, error, required, className, ...rest }: TextareaProps) {
  return (
    <Field
      label={label}
      {...(hint !== undefined ? { hint } : {})}
      {...(error !== undefined ? { error } : {})}
      required={required === true}
    >
      {({ inputId, describedBy, invalid }) => (
        <textarea
          {...rest}
          id={inputId}
          rows={rest.rows ?? 3}
          aria-invalid={invalid}
          {...(describedBy !== undefined ? { "aria-describedby": describedBy } : {})}
          className={[INPUT_CLASS, "py-2 leading-relaxed", className].filter(Boolean).join(" ")}
        />
      )}
    </Field>
  );
}
