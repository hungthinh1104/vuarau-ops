import Link, { type LinkProps } from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { buttonClassName, type ButtonTone } from "./button-class-name.ts";

export type LinkButtonProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> &
  LinkProps & {
    readonly tone?: ButtonTone;
    readonly fullWidth?: boolean;
    readonly children: ReactNode;
  };

export function LinkButton({
  tone = "primary",
  fullWidth = false,
  className = "",
  children,
  ...rest
}: LinkButtonProps) {
  return (
    <Link {...rest} className={buttonClassName(tone, fullWidth, className)}>
      {children}
    </Link>
  );
}
