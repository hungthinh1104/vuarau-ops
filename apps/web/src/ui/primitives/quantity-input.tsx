"use client";

import type { InputHTMLAttributes } from "react";
import type { Unit } from "@vuarau/domain-contracts";
import { UNIT_LABEL_VI } from "@vuarau/domain-contracts";
import { Field, INPUT_CLASS } from "./field.tsx";

export type QuantityInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "value" | "type"
> & {
  readonly label: string;
  readonly hint?: string;
  readonly error?: string;
  readonly unit: Unit;
  /** Raw text, exactly as typed. See `MoneyInput` for why. */
  readonly value: string;
};

/**
 * The unit label comes from `UNIT_LABEL_VI` in the contracts package, not from a
 * table in here. "bó", "thùng", "lạng" are domain vocabulary; a second copy in the
 * browser is a second thing to keep in step.
 */
export function QuantityInput({
  label,
  hint,
  error,
  unit,
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
          <span className="text-body text-ink-muted">{UNIT_LABEL_VI[unit]}</span>
        </div>
      )}
    </Field>
  );
}
