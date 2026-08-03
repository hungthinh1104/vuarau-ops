"use client";

import { Button } from "@/ui/primitives/button.tsx";

export type FilterChipOption<T extends string> = {
  readonly value: T;
  readonly label: string;
  readonly count?: number;
};

export function FilterChipGroup<T extends string>(props: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly FilterChipOption<T>[];
  readonly onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={props.label}>
      {props.options.map((option) => {
        const active = option.value === props.value;
        return (
          <Button
            key={option.value}
            tone={active ? "primary" : "secondary"}
            aria-pressed={active}
            onClick={() => props.onChange(option.value)}
            className={[
              "touch-target inline-flex min-h-10 items-center gap-1.5 rounded-pill border px-3 text-body-sm font-medium transition-colors",
              "min-h-10 rounded-pill px-3",
              active ? "border-brand" : "text-ink-muted",
            ].join(" ")}
          >
            <span>{option.label}</span>
            {option.count === undefined ? null : (
              <span className="tabular text-caption opacity-75">{option.count}</span>
            )}
          </Button>
        );
      })}
    </div>
  );
}
