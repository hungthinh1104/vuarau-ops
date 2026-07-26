export type FieldIssue = {
  /** The input's `id`, so the summary can move focus to it. */
  readonly fieldId?: string;
  readonly message: string;
};

export type ErrorSummaryProps = {
  readonly title?: string;
  readonly issues: readonly FieldIssue[];
};

/**
 * The list a form shows when validation fails: every problem in one place, at the
 * top, each linked to the field it belongs to.
 *
 * Two failure modes it exists to prevent. A form that only marks fields red hides
 * the problem below the fold on a phone; and a form that shows one error at a time
 * makes somebody submit four times to learn about four mistakes.
 *
 * Rendered only for `validation_error` — problems that belong to a *field*.
 * `business_rejection` is a different state and attaches to the action, because no
 * field is wrong and highlighting one sends the user hunting for a typo that does
 * not exist (UI state catalog §2).
 */
export function ErrorSummary({ title = "Cần sửa trước khi tiếp tục", issues }: ErrorSummaryProps) {
  if (issues.length === 0) return null;

  return (
    <div
      role="alert"
      // Focusable so a form can send the user here after a failed submit.
      tabIndex={-1}
      className="rounded-card border border-danger/40 bg-danger-soft px-4 py-3"
    >
      <p className="text-label font-semibold text-danger">{title}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-body-sm text-ink">
        {issues.map((issue, index) => (
          <li key={issue.fieldId ?? index}>
            {issue.fieldId !== undefined ? (
              <a href={`#${issue.fieldId}`} className="underline">
                {issue.message}
              </a>
            ) : (
              issue.message
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
