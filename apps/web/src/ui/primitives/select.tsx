"use client";

import { Select as BaseSelect } from "@base-ui/react";
import { ChevronDown, Check } from "lucide-react";
import type { SelectHTMLAttributes } from "react";
import { Field, INPUT_CLASS } from "./field.tsx";
import { SearchInput } from "./search-input.tsx";

export type SelectOption = {
  readonly value: string;
  readonly label: string;
};

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "children"> & {
  readonly label: string;
  readonly hint?: string;
  readonly error?: string;
  readonly options: readonly SelectOption[];
  readonly placeholder?: string;
  readonly searchValue?: string;
  readonly onSearchChange?: (value: string) => void;
  readonly searchPlaceholder?: string;
};

export function Select({
  label,
  hint,
  error,
  options,
  placeholder,
  required,
  className,
  value,
  defaultValue,
  onChange,
  disabled,
  name,
  searchValue,
  onSearchChange,
  searchPlaceholder,
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
        <BaseSelect.Root
          name={name}
          disabled={disabled}
          required={required}
          value={(value as string) ?? undefined}
          defaultValue={(defaultValue as string) ?? undefined}
          onValueChange={(val) => {
            if (onChange && val !== null) {
              const fakeEvent = {
                target: { value: val, name },
                currentTarget: { value: val, name },
                preventDefault: () => {},
                stopPropagation: () => {},
              } as unknown as React.ChangeEvent<HTMLSelectElement>;
              onChange(fakeEvent);
            }
          }}
        >
          <BaseSelect.Trigger
            {...(rest as unknown as React.ButtonHTMLAttributes<HTMLButtonElement>)}
            id={inputId}
            aria-invalid={invalid}
            {...(describedBy !== undefined ? { "aria-describedby": describedBy } : {})}
            className={[INPUT_CLASS, "flex items-center justify-between", className]
              .filter(Boolean)
              .join(" ")}
          >
            <BaseSelect.Value placeholder={placeholder} className="truncate">
              {(val: string | string[] | null) => {
                if (val == null || val === "") return placeholder;
                const opt = options.find((o) => o.value === val);
                return opt ? opt.label : val;
              }}
            </BaseSelect.Value>
            <BaseSelect.Icon>
              <ChevronDown size={16} className="text-ink-muted shrink-0" />
            </BaseSelect.Icon>
          </BaseSelect.Trigger>
          <BaseSelect.Portal>
            <BaseSelect.Positioner
              align="start"
              sideOffset={4}
              className="z-50 max-h-[var(--available-height)] w-[var(--anchor-width)]"
            >
              <BaseSelect.Popup className="max-h-[var(--available-height)] overflow-y-auto rounded-card border border-border bg-surface p-1 outline-none">
                {onSearchChange !== undefined ? (
                  <div
                    className="sticky top-0 z-10 bg-surface p-1"
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <SearchInput
                      label={`Tìm ${label.toLocaleLowerCase("vi")}`}
                      placeholder={searchPlaceholder ?? label}
                      value={searchValue ?? ""}
                      onChange={(event) => onSearchChange(event.target.value)}
                      onClear={() => onSearchChange("")}
                    />
                  </div>
                ) : null}
                {placeholder !== undefined ? (
                  <BaseSelect.Item
                    value=""
                    className="flex w-full cursor-default select-none items-center justify-between rounded-input px-3 py-2 text-body text-ink outline-none data-[highlighted]:bg-canvas"
                  >
                    <BaseSelect.ItemText className="text-ink-muted">
                      {placeholder}
                    </BaseSelect.ItemText>
                  </BaseSelect.Item>
                ) : null}
                {options.map((option) => (
                  <BaseSelect.Item
                    key={option.value}
                    value={option.value}
                    className="flex w-full cursor-default select-none items-center justify-between rounded-input px-3 py-2 text-body text-ink outline-none data-[highlighted]:bg-canvas"
                  >
                    <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
                    <BaseSelect.ItemIndicator>
                      <Check size={16} className="text-leaf" />
                    </BaseSelect.ItemIndicator>
                  </BaseSelect.Item>
                ))}
              </BaseSelect.Popup>
            </BaseSelect.Positioner>
          </BaseSelect.Portal>
        </BaseSelect.Root>
      )}
    </Field>
  );
}
