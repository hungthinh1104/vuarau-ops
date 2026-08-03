export type ButtonTone = "primary" | "secondary" | "danger" | "danger-solid" | "link";

const TONE_CLASS: Readonly<Record<ButtonTone, string>> = {
  primary: "bg-brand text-white hover:bg-brand-hover border border-transparent",
  secondary: "bg-surface text-ink border border-border hover:border-border-strong",
  danger: "bg-surface text-danger border border-danger/40 hover:border-danger",
  "danger-solid": "bg-danger text-white border border-transparent hover:opacity-90",
  link: "border border-transparent bg-transparent px-0 text-info hover:underline",
};

export function buttonClassName(tone: ButtonTone, fullWidth: boolean, className: string): string {
  return [
    "touch-target inline-flex min-h-[52px] items-center justify-center gap-2 rounded-button px-4 sm:min-h-11",
    "text-label font-semibold transition-colors",
    "disabled:cursor-not-allowed disabled:opacity-50",
    TONE_CLASS[tone],
    fullWidth ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}
