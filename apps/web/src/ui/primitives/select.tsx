"use client";

import type { SelectHTMLAttributes } from "react";
import { Field, INPUT_CLASS } from "./field.tsx";

export type SelectOption = {
  readonly value: string;
  readonly label: string;
};

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "children"> & {
  readonly label: string;
  readonly hint?: string;
  readonly error?: string;
  readonly options: readonly SelectOption[];
  /**
   * Shown first and selected when nothing has been chosen.
   *
   * Present on every select that matters, because a native select with no
   * placeholder pre-selects its first option, and "the first reason code in the
   * list" is not a reason anybody gave.
   */
  readonly placeholder?: string;
};

export function Select({
  label,
  hint,
  error,
  options,
  placeholder,
  required,
  className,
  ...rest
}: SelectProps) {
  return (
    <Field
      label={label}
      {...(hint !== undefined ? { hint } : {})}
      {...(error !== undefined ? { error } : {})}
      required={required === true}
    >
      {({ inputId, describedBy, invalid }) => (
        <select
          {...rest}
          id={inputId}
          aria-invalid={invalid}
          {...(describedBy !== undefined ? { "aria-describedby": describedBy } : {})}
          className={[INPUT_CLASS, className].filter(Boolean).join(" ")}
        >
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}
