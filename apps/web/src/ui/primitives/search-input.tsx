"use client";

import type { InputHTMLAttributes } from "react";
import { useId } from "react";
import { IconButton } from "./icon-button.tsx";

export type SearchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type"> & {
  readonly label: string;
  readonly onClear?: () => void;
};

/**
 * `role="searchbox"` via `type="search"`, with a visible label.
 *
 * Placeholder-only labelling is the common shortcut and it fails twice here: the
 * label vanishes as soon as anything is typed, and the users are 40–60 on a phone
 * in a market at night. The label stays.
 *
 * Diacritic-insensitive matching happens on the server (`vuarau_fold`), so this
 * does not normalise the query — "co hoa" is sent as typed and finds "Cô Hoà".
 */
export function SearchInput({ label, onClear, value, className, ...rest }: SearchInputProps) {
  const inputId = useId();
  const hasValue = typeof value === "string" && value.length > 0;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-label font-semibold text-ink">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          {...rest}
          id={inputId}
          type="search"
          value={value}
          className={[
            "touch-target w-full rounded-input border border-border bg-surface px-3",
            "text-body text-ink focus:border-leaf",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
        />
        {onClear !== undefined && hasValue ? (
          <IconButton label="Xoá tìm kiếm" onClick={onClear}>
            ✕
          </IconButton>
        ) : null}
      </div>
    </div>
  );
}
