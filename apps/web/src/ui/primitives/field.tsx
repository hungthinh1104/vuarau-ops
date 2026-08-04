"use client";

import { useId, type ReactNode } from "react";

/**
 * The label / error / hint scaffolding every input shares.
 *
 * Extracted because the wiring — `htmlFor`, `aria-describedby`, `aria-invalid`,
 * and an error that is announced rather than merely coloured — is the part that
 * gets forgotten, and forgetting it in one input out of eight is worse than not
 * having the pattern.
 */
export type FieldProps = {
  readonly label: string;
  readonly hint?: string;
  /** Present means invalid. The text is shown and linked, never only a red border. */
  readonly error?: string;
  readonly required?: boolean;
  readonly children: (ids: {
    inputId: string;
    describedBy: string | undefined;
    invalid: boolean;
  }) => ReactNode;
};

export function Field({ label, hint, error, required = false, children }: FieldProps) {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  const describedBy =
    [error !== undefined ? errorId : null, hint !== undefined ? hintId : null]
      .filter((value): value is string => value !== null)
      .join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1 w-full">
      <label htmlFor={inputId} className="text-label font-semibold text-ink">
        {label}
        {required ? (
          <span className="text-danger" aria-hidden="true">
            {" *"}
          </span>
        ) : null}
      </label>

      {children({ inputId, describedBy, invalid: error !== undefined })}

      {hint !== undefined ? (
        <p id={hintId} className="text-caption text-ink-muted">
          {hint}
        </p>
      ) : null}

      {error !== undefined ? (
        // `role="alert"` so the correction reaches somebody who cannot see the
        // red. The message says what to do, not that something is wrong.
        <p id={errorId} role="alert" className="text-caption text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const INPUT_CLASS = [
  "touch-target min-h-[52px] w-full rounded-input border bg-surface px-3 text-body text-ink sm:min-h-11",
  "border-border focus:border-brand",
  "aria-[invalid=true]:border-danger",
  "disabled:bg-surface-muted disabled:text-ink-muted",
].join(" ");
