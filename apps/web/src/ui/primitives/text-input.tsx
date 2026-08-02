"use client";

import type { InputHTMLAttributes } from "react";
import { Field } from "./field.tsx";
import { Input } from "./input.tsx";

export type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  readonly label: string;
  readonly hint?: string;
  readonly error?: string;
};

/**
 * A labelled text field that keeps what was typed.
 *
 * It is uncontrolled-friendly on purpose: `defaultValue` works, and a validation
 * failure that re-renders the form does not blank the field. design.md is explicit
 * about this — "preserve value after validation error" — and the failure mode is
 * a worker retyping a customer's name because the phone number was wrong.
 */
export function TextInput({ label, hint, error, required, className, ...rest }: TextInputProps) {
  return (
    <Field
      label={label}
      {...(hint !== undefined ? { hint } : {})}
      {...(error !== undefined ? { error } : {})}
      required={required === true}
    >
      {({ inputId, describedBy, invalid }) => (
        <Input
          {...rest}
          id={inputId}
          type={rest.type ?? "text"}
          aria-invalid={invalid}
          {...(describedBy !== undefined ? { "aria-describedby": describedBy } : {})}
          className={className}
        />
      )}
    </Field>
  );
}
