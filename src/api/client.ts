/**
 * The one place this app talks to the API.
 *
 * Two things it exists to get right, both of which are easy to get wrong once and then
 * everywhere:
 *
 * 1. **The error shape.** The API answers a failure with either `{"detail": "..."}` or
 *    `{"detail": [{"loc": ["body", "field"], "msg": "..."}]}`. The second form names the
 *    snake_case field the client sent, so a form can put the message under the right input —
 *    which only works if something parses it. {@link ApiError} does, once.
 * 2. **An expired or revoked token.** The API re-reads the account on every request, so a token
 *    can stop working between one call and the next: a password change, a deactivation, an
 *    administrator removing the login. Every 401 therefore means "sign in again", and the app
 *    is told through {@link onUnauthorized} rather than each caller inventing its own handling.
 */

import type { Page } from './types'

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080').replace(/\/$/, '')

/** One field's complaint, keyed by the name the client sent. */
export interface FieldMessage {
  field: string
  message: string
}

export class ApiError extends Error {
  readonly status: number
  /** Populated only for the field-keyed form; empty for a plain message. */
  readonly fields: FieldMessage[]

  constructor(status: number, message: string, fields: FieldMessage[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fields = fields
  }

  /** Inputs on screen that have looked their message up; see {@link unclaimedFields}. */
  private readonly claimed = new Set<string>()

  /**
   * The message for one input, or undefined when this error is not about that input.
   *
   * Asking marks the input as shown, so {@link unclaimedFields} can tell which messages have no
   * box on screen to sit beside.
   */
  fieldMessage(field: string): string | undefined {
    this.claimed.add(field)
    return this.fields.find((f) => f.field === field)?.message
  }

  /**
   * Field messages no input has claimed. A form whose box is named differently from the API's
   * field (`capacity_id` beside an error about `capacity`), or one with no `Field` at all, would
   * otherwise show nothing: the server says which box is wrong and the user sees no message.
   */
  unclaimedFields(): FieldMessage[] {
    return this.fields.filter((f) => !this.claimed.has(f.field))
  }

  get isNotFound() {
    return this.status === 404
  }

  /** A rule the caller could not have known it was breaking: a duplicate, or a clash. */
  get isConflict() {
    return this.status === 409
  }

  get isForbidden() {
    return this.status === 403
  }
}

type Unauthorized = () => void
let onUnauthorized: Unauthorized = () => {}

/** Registered once by the auth provider, so a revoked token logs the app out from anywhere. */
export function setUnauthorizedHandler(handler: Unauthorized) {
  onUnauthorized = handler
}

let token: string | null = null

export function setToken(value: string | null) {
  token = value
}

function parseError(status: number, body: unknown): ApiError {
  const detail = (body as { detail?: unknown } | null)?.detail

  if (Array.isArray(detail)) {
    const fields: FieldMessage[] = detail.map((d) => {
      const loc = Array.isArray(d?.loc) ? d.loc : []
      // loc is a path like ["body", "registration_number"]; the last node is the input's name.
      return { field: String(loc[loc.length - 1] ?? ''), message: String(d?.msg ?? '') }
    })
    return new ApiError(status, fields.map((f) => f.message).join(' ') || 'Invalid input.', fields)
  }

  if (typeof detail === 'string' && detail) {
    return new ApiError(status, detail)
  }

  // No recognisable body. Say the status plainly rather than inventing a friendlier cause —
  // a made-up explanation for an unanticipated failure hides the real one.
  return new ApiError(status, `The server returned ${status}.`)
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(BASE_URL + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    // fetch only rejects for a transport failure. A CORS refusal lands here too, and looks
    // identical to the API being down -- so say both, rather than guessing which.
    throw new ApiError(
      0,
      `Cannot reach the API at ${BASE_URL}. Check that it is running, and that it allows this ` +
        `origin (VM_CORS_ORIGINS).`,
    )
  }

  if (response.status === 204) {
    return undefined as T
  }

  const text = await response.text()
  let parsed: unknown = null
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = null
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      onUnauthorized()
    }
    throw parseError(response.status, parsed)
  }

  return parsed as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),

  /**
   * Fetch binary content as an object URL, with the bearer token attached.
   *
   * Separate from `get` because that one parses JSON. The caller owns the returned URL and
   * must `URL.revokeObjectURL` it — a blob URL lives until the document is discarded.
   */
  blob: async (path: string): Promise<string> => {
    const response = await fetch(BASE_URL + path, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (response.status === 401) {
      onUnauthorized()
    }
    if (!response.ok) {
      throw new ApiError(response.status, `Could not load ${path}.`)
    }
    return URL.createObjectURL(await response.blob())
  },

  /**
   * Fetch a file and hand it to the browser as a download.
   *
   * Not an `<a href>` or `window.open`. This API authenticates with a bearer token in a
   * header, and a browser attaches none of its own to a plain navigation — the link would get
   * a 401 and the user a blank tab. So the bytes are fetched like any other call and pushed
   * through a temporary object URL.
   *
   * The filename comes from the server's `Content-Disposition` when it sends one, because the
   * server is what knows the receipt's number; `fallback` covers the case where a proxy has
   * stripped the header.
   */
  download: async (path: string, fallback: string): Promise<void> => {
    const response = await fetch(BASE_URL + path, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (response.status === 401) {
      onUnauthorized()
    }
    if (!response.ok) {
      throw new ApiError(response.status, `Could not download ${fallback}.`)
    }

    const header = response.headers.get('Content-Disposition') ?? ''
    const match = /filename="?([^"]+)"?/i.exec(header)
    const url = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = url
    link.download = match ? match[1] : fallback
    document.body.appendChild(link)
    link.click()
    link.remove()
    // Revoked on the next tick, not immediately: Safari cancels a download whose object URL
    // is released in the same frame as the click.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  },

  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
}

// ── query-string helpers ────────────────────────────────────────────────────

/**
 * Build a query string, dropping anything empty.
 *
 * Empty values are omitted rather than sent blank: the API treats a missing filter as "no
 * filter", and `q=` would otherwise be a search for nothing in particular.
 */
export function query(params: Record<string, string | number | boolean | null | undefined>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue
    search.set(key, String(value))
  }
  const s = search.toString()
  return s ? `?${s}` : ''
}

/** The largest page the API will serve; asking for more is clamped, not refused. */
export const MAX_PAGE_SIZE = 200

/**
 * Every row of a paged endpoint, for the pickers that must offer a complete list.
 *
 * <p><b>Why this exists.</b> A dozen screens used to ask for `page_size: 200` and treat the
 * answer as "all of them". The API clamps at 200, so past that the list was silently short:
 * the 201st customer simply could not be chosen, and a clerk would add a duplicate of
 * somebody already on file. Slow and correct beats fast and quietly wrong — and for lists
 * this size it is not even slow, because one request covers the usual case.
 *
 * <p>The cap is a guard against a picker trying to render a hundred thousand options and
 * hanging the tab. Reaching it sets `truncated`, and a caller that can be truncated must say
 * so on screen rather than pretend — that silence is the bug this replaces.
 */
export async function fetchAll<T>(
  load: (page: number, pageSize: number) => Promise<Page<T>>,
  cap = 2000,
): Promise<{ items: T[]; total: number; truncated: boolean }> {
  const first = await load(1, MAX_PAGE_SIZE)
  const items = [...first.items]
  const wanted = Math.min(first.total, cap)

  for (let page = 2; items.length < wanted; page++) {
    const next = await load(page, MAX_PAGE_SIZE)
    // A short or empty page means the data changed under us; stop rather than loop for ever.
    if (next.items.length === 0) break
    items.push(...next.items)
  }

  return { items: items.slice(0, cap), total: first.total, truncated: first.total > cap }
}

export const emptyPage = <T>(): Page<T> => ({ items: [], total: 0, page: 1, page_size: 0 })
