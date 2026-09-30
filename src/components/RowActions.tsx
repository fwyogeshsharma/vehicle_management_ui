/**
 * The edit and delete controls on a table row.
 *
 * <p>Icons rather than words, because a word-width button in every row of every table costs more
 * horizontal space than the column it sits in, and the two actions are the same two on every
 * row — once learned, the label is read no further.
 *
 * <p><b>Every icon carries a `title` and an `aria-label` saying what it does in words.</b> An
 * icon on its own is a guess: a pencil is fairly safe, a bin less so when "delete" in this
 * system usually means *deactivate*. The tooltip is not decoration, it is where the actual
 * meaning lives, and {@link DeleteAction} takes its wording from the caller for that reason —
 * "Take off the road" and "Retire this company" are different sentences and neither is "Delete".
 */
export function EditAction({
  title = 'Edit',
  onClick,
  disabled,
}: {
  title?: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className="icon-action"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
    >
      {/* Inline SVG, not an icon font: no extra request, and it inherits currentColor. */}
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
        <path
          d="M11.5 1.7 14.3 4.5 5.4 13.4 1.9 14.1 2.6 10.6z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

export function DeleteAction({
  title,
  onClick,
  disabled,
}: {
  /** In words, and specific. This system deactivates far more often than it deletes. */
  title: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className="icon-action danger"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
    >
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
        <path
          d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.2a1 1 0 0 0 1 .8h4.6a1 1 0 0 0 1-.8L12 4M6.5 7v4M9.5 7v4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

/** A restore, for the rows this system retires rather than removes. */
export function RestoreAction({
  title,
  onClick,
  disabled,
}: {
  title: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className="icon-action"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
    >
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
        <path
          d="M2.6 8a5.4 5.4 0 1 0 1.6-3.8M2.2 2.4v3.2h3.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

/** A tick: the affirmative action on a row, and the one that creates something. */
export function ConfirmAction({
  title,
  onClick,
  disabled,
  active,
}: {
  title: string
  onClick: () => void
  disabled?: boolean
  /** True while the thing it opens is open, so the icon can say "this is the one showing". */
  active?: boolean
}) {
  return (
    <button
      type="button"
      className={'icon-action confirm' + (active ? ' is-active' : '')}
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
    >
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
        <path
          d="M2.8 8.6 6.2 12 13.2 4.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

/** A circular arrow, for sending something back round the loop it came out of. */
export function RetryAction({
  title,
  onClick,
  disabled,
}: {
  title: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className="icon-action"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
    >
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
        <path
          d="M13.4 8a5.4 5.4 0 1 1-1.6-3.8M13.8 2.4v3.2h-3.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}
