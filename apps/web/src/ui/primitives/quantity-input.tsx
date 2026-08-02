"use client";

import type { InputHTMLAttributes } from "react";
import { Field, INPUT_CLASS } from "./field.tsx";

export type QuantityInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "value" | "type"
> & {
  readonly label: string;
  readonly hint?: string;
  readonly error?: string;
  readonly unit: string;
  readonly unitLabel?: string;
  /** Hide the suffix when a separate adjacent unit selector already names it. */
  readonly showUnitSuffix?: boolean;
  /** Raw text, exactly as typed. See `MoneyInput` for why. */
  readonly value: string;
};

/**
 * The domain-facing caller supplies the already localized unit label. This keeps
 * the primitive independent from business vocabulary and contract packages.
 */
export function QuantityInput({
  label,
  hint,
  error,
  unit,
  unitLabel,
  showUnitSuffix = true,
  required,
  className,
  ...rest
}: QuantityInputProps) {
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
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={invalid}
            {...(describedBy !== undefined ? { "aria-describedby": describedBy } : {})}
            className={[INPUT_CLASS, "tabular text-right", className].filter(Boolean).join(" ")}
          />
          {showUnitSuffix ? (
            <span className="text-body text-ink-muted">{unitLabel ?? unit}</span>
          ) : null}
        </div>
      )}
    </Field>
  );
}
