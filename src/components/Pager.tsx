import type { Page } from '../api/types'

/**
 * Paging controls for the API's 1-based pages.
 *
 * The API caps `page_size` at 200 and clamps rather than refusing, so the size options here stay
 * under it — offering 500 would silently give 200 and a page that says it holds 500.
 */

export const PAGE_SIZES = [10, 25, 50, 100]

export function Pager<T>({
  page,
  onPage,
  onPageSize,
}: {
  page: Page<T>
  onPage: (page: number) => void
  onPageSize: (size: number) => void
}) {
  const lastPage = Math.max(1, Math.ceil(page.total / Math.max(1, page.page_size)))
  const first = page.total === 0 ? 0 : (page.page - 1) * page.page_size + 1
  const last = Math.min(page.total, page.page * page.page_size)

  return (
    <div className="pager">
      <span className="pager-count">
        {page.total === 0 ? 'Nothing to show' : `${first}–${last} of ${page.total}`}
      </span>
      <div className="pager-controls">
        <button type="button" onClick={() => onPage(page.page - 1)} disabled={page.page <= 1}>
          ← Previous
        </button>
        <span className="pager-page">
          Page {page.page} of {lastPage}
        </span>
        <button
          type="button"
          onClick={() => onPage(page.page + 1)}
          disabled={page.page >= lastPage}
        >
          Next →
        </button>
        <select
          value={page.page_size || PAGE_SIZES[1]}
          onChange={(e) => onPageSize(Number(e.target.value))}
          aria-label="Rows per page"
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n} per page
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

/**
 * A sortable column header.
 *
 * Only whitelisted keys are offered, because the API **rejects** an unknown `sort` with a 422
 * rather than quietly ignoring it. That is the behaviour we want; it just means the UI must not
 * invent keys.
 */
export function SortHeader({
  label,
  field,
  sort,
  onSort,
}: {
  label: string
  field: string
  sort: string
  onSort: (sort: string) => void
}) {
  const descending = sort === `-${field}`
  const active = sort === field || descending
  return (
    <th>
      <button
        type="button"
        className={'sort' + (active ? ' sort-active' : '')}
        onClick={() => onSort(active && !descending ? `-${field}` : field)}
      >
        {label}
        <span className="sort-arrow">{active ? (descending ? '↓' : '↑') : ''}</span>
      </button>
    </th>
  )
}
