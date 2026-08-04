import Link from "next/link";

export function PartialCompletion(props: { readonly message: string; readonly href: string }) {
  return (
    <div
      role="alert"
      className="rounded-card border border-warning/30 bg-warning-soft p-3 text-body-sm"
    >
      <p className="font-semibold">Luồng đã dừng giữa chừng</p>
      <p className="mt-1 text-ink-muted">{props.message}</p>
      <Link
        href={props.href}
        className="mt-2 inline-block font-semibold text-info underline-offset-4 hover:underline"
      >
        Mở phiếu để tiếp tục
      </Link>
    </div>
  );
}
