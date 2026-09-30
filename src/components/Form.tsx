import type { ReactNode } from 'react'
import { ApiError } from '../api/client'

/**
 * Form plumbing that actually uses the API's error shape.
 *
 * The API answers a field-level failure with `{"detail":[{"loc":["body","mobile"],"msg":"..."}]}`,
 * where the field name is the snake_case one the client sent. That is only worth anything if the
 * form looks the message up under the matching input — so {@link Field} takes the error and finds
 * its own message, and {@link FormError} shows only what was left over. Without this the server
 * goes to the trouble of telling you which box is wrong and the user sees "Invalid input".
 */

export function Field({
  label,
  name,
  error,
  hint,
  children,
}: {
  label: string
  /** The snake_case name the API uses for this input. */
  name: string
  error?: ApiError | null
  hint?: ReactNode
  children: ReactNode
}) {
  const message = error?.fieldMessage(name)
  return (
    <label className={'field' + (message ? ' field-invalid' : '')}>
      <span className="field-label">{label}</span>
      {children}
      {hint && !message && <span className="field-hint">{hint}</span>}
      {message && <span className="field-error">{message}</span>}
    </label>
  )
}

/**
 * The part of an error that does not belong to any one input.
 *
 * Suppresses itself when every message has already been shown beside a field, so a duplicate
 * mobile number is not reported twice on the same screen.
 */
export function FormError({ error }: { error: ApiError | null }) {
  if (!error) return null
  if (error.fields.length > 0) return null
  return (
    <div className="notice notice-error" role="alert">
      {error.message}
    </div>
  )
}

export function Notice({
  kind = 'info',
  children,
}: {
  kind?: 'info' | 'warn' | 'error' | 'ok'
  children: ReactNode
}) {
  return <div className={`notice notice-${kind}`}>{children}</div>
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return <div className="page-loading">{label}</div>
}

/** An honest empty state: says what would be here, not just "No data". */
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}
