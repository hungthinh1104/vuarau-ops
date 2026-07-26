"use client";

import type { InputHTMLAttributes } from "react";
import type { CurrencyCode } from "@vuarau/domain-contracts";
import { Field, INPUT_CLASS } from "./field.tsx";

export type MoneyInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "value" | "type"
> & {
  readonly label: string;
  readonly hint?: string;
  readonly error?: string;
  readonly currency: CurrencyCode;
  /**
   * Raw text, exactly as typed — never a formatted round-trip of a number.
   *
   * That is what makes "preserve entered data after a validation failure"
   * structural rather than a habit: there is no number to convert back from, so
   * nothing can be lost on the way. Parse it with `parseMoneyText` when the user
   * commits, not on every keystroke.
   */
  readonly value: string;
};

export function MoneyInput({
  label,
  hint,
  error,
  currency: _currency,
  required,
  className,
  ...rest
}: MoneyInputProps) {
  return (
    <Field
      label={label}
      {...(hint !== undefined ? { hint } : {})}
      {...(error !== undefined ? { error } : {})}
      required={required === true}
    >
      {({ inputId, describedBy, invalid }) => (
        <div className="flex items-center gap-2">
          <input
            {...rest}
            id={inputId}
            /*
             * `inputMode` rather than `type="number"`: a numeric keypad on a
             * phone, without the spinner, the scroll-wheel accidents, or the
             * browser's own idea of what a valid number looks like — which
             * differs by locale and would silently disagree with our parser.
             */
            inputMode="numeric"
            autoComplete="off"
            aria-invalid={invalid}
            {...(describedBy !== undefined ? { "aria-describedby": describedBy } : {})}
            className={[INPUT_CLASS, "tabular text-right", className].filter(Boolean).join(" ")}
          />
          <span className="text-body text-ink-muted">₫</span>
        </div>
      )}
    </Field>
  );
}
