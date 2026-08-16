import Link from "next/link";

export type EvidenceCategory =
  "cost" | "reconciliation" | "supply" | "supplier" | "demand" | "debt";

const EVIDENCE_TABS: ReadonlyArray<{
  readonly id: EvidenceCategory;
  readonly label: string;
  readonly href: string;
}> = [
  { id: "cost", label: "Chi phí & hao hụt", href: "/evidence" },
  { id: "reconciliation", label: "Đối soát hiện trường", href: "/evidence/reconciliation" },
  { id: "supply", label: "Cam kết nguồn cung", href: "/evidence/supply" },
  { id: "supplier", label: "Quan sát nhà cung cấp", href: "/evidence/supplier" },
  { id: "demand", label: "Nhu cầu khách hàng", href: "/evidence/demand" },
  { id: "debt", label: "Ảnh / phiếu công nợ", href: "/evidence/debt" },
];

export function EvidenceNav(props: { readonly active: EvidenceCategory }) {
  return (
    <nav
      aria-label="Danh mục chứng cứ và quan sát"
      className="flex gap-2 overflow-x-auto border-b border-border pb-2"
    >
      {EVIDENCE_TABS.map((tab) => {
        const isCurrent = props.active === tab.id;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={isCurrent ? "page" : undefined}
            className={[
              "shrink-0 rounded-pill border px-3 py-1.5 text-body-sm font-medium transition-colors",
              isCurrent
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-surface text-ink-muted hover:border-border-strong hover:text-ink",
            ].join(" ")}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
