"use client";

export function SourceEvidenceList({
  references,
  className = "",
}: {
  readonly references: readonly string[];
  readonly className?: string;
}) {
  if (references.length === 0) return null;

  return (
    <div className={className}>
      <p className="text-caption font-semibold text-ink-muted">Ảnh hoặc phiếu liên quan</p>
      <ul className="mt-1 grid gap-1 break-words text-caption">
        {references.map((reference, index) => (
          <li key={`${index}:${reference}`}>
            <SourceEvidenceReference reference={reference} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SourceEvidenceReference({ reference }: { readonly reference: string }) {
  if (/^https?:\/\//i.test(reference)) {
    return (
      <a
        href={reference}
        target="_blank"
        rel="noreferrer"
        className="text-info underline underline-offset-2"
      >
        {reference}
      </a>
    );
  }
  return <code className="text-ink">{reference}</code>;
}
