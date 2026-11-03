import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError, fetchAll } from '../api/client'
import { customers, goodsTypes, loadRequests } from '../api/resources'
import type { LoadRequest, LoadRequestSaveRequest, LoadRequestStatus } from '../api/types'
import { Empty, Field, FormError, Notice, Spinner } from '../components/Form'
import { Pager, SortHeader } from '../components/Pager'
import { PlaceInput } from '../components/PlaceInput'
import { EditAction } from '../components/RowActions'
import { useAsync, useDebounced } from '../components/useAsync'
import { useMasters } from '../components/useMasters'

const STATUSES: { value: LoadRequestStatus; label: string }[] = [
  { value: 'OPEN', label: 'Open' },
  { value: 'FULFILLED', label: 'Fulfilled' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

/** Today as YYYY-MM-DD in the browser's own time zone (toISOString would give UTC's day). */
const today = () => new Date().toLocaleDateString('en-CA')

/**
 * The day's load requests — cargo that customers have asked us to move.
 *
 * <p>Opens on today's board. A date picker moves to another day and "All dates" drops the
 * filter. A request is a customer's ask and nothing more: no truck is attached and nothing is
 * owed until a lorry receipt is issued.
 */
export function LoadRequestsPage() {
  const [params, setParams] = useSearchParams()
  const [term, setTerm] = useState(params.get('q') ?? '')
  const debounced = useDebounced(term)
  const [adding, setAdding] = useState(false)

  const page = Number(params.get('page') ?? 1)
  const pageSize = Number(params.get('page_size') ?? 25)
  const sort = params.get('sort') ?? '-request_date'
  const allDates = params.get('all') === 'true'
  const date = params.get('date') ?? today()
  const status = params.get('status') ?? ''
  const customerId = params.get('customer') ?? ''

  function patch(next: Record<string, string | null>) {
    const merged = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === '') merged.delete(k)
      else merged.set(k, v)
    }
    if (!('page' in next)) merged.delete('page')
    setParams(merged, { replace: true })
  }

  const parties = useAsync(
    () =>
      fetchAll((p, page_size) => customers.list({ active: true, page: p, page_size, sort: 'name' })),
    [],
  )

  const list = useAsync(
    () =>
      loadRequests.list({
        q: debounced.trim() || undefined,
        status: status || undefined,
        consignor_id: customerId ? Number(customerId) : undefined,
        date_from: allDates ? undefined : date,
        date_to: allDates ? undefined : date,
        page,
        page_size: pageSize,
        sort,
      }),
    [debounced, status, customerId, allDates, date, page, pageSize, sort],
  )

  return (
    <div className="stack">
      <header className="page-header">
        <h1>Load requests</h1>
        <button type="button" className="primary" onClick={() => setAdding(true)}>
          Add a request
        </button>
      </header>

      <Notice>
        Cargo that customers have asked us to move. A request is only the ask — nothing is
        promised or owed until a lorry receipt is issued.
      </Notice>

      {adding && (
        <LoadRequestForm
          defaultDate={allDates ? today() : date}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            list.reload()
          }}
        />
      )}

      <div className="filters">
        <label>
          Day{' '}
          <input
            type="date"
            value={date}
            disabled={allDates}
            onChange={(e) => patch({ date: e.target.value || null })}
          />
        </label>
        <button
          type="button"
          className="link"
          disabled={allDates}
          onClick={() => patch({ date: null })}
        >
          Today
        </button>
        <label className="check">
          <input
            type="checkbox"
            checked={allDates}
            onChange={(e) => patch({ all: e.target.checked ? 'true' : null })}
          />
          All dates
        </label>
        <select value={customerId} onChange={(e) => patch({ customer: e.target.value })}>
          <option value="">All companies</option>
          {(parties.data?.items ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => patch({ status: e.target.value })}>
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <input
          type="search"
          value={term}
          placeholder="Company, place, goods or contact"
          onChange={(e) => {
            setTerm(e.target.value)
            patch({ q: e.target.value })
          }}
        />
      </div>

      {list.error && <Notice kind="error">{list.error.message}</Notice>}
      {list.loading && !list.data && <Spinner />}

      {list.data &&
        (list.data.items.length === 0 ? (
          <Empty>
            {allDates ? 'No load requests recorded yet.' : `No load requests for ${date}.`}
          </Empty>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table requests-table">
              <thead>
                <tr>
                  <SortHeader label="Date" field="request_date" sort={sort} onSort={(s) => patch({ sort: s })} />
                  <SortHeader label="Company" field="company_name" sort={sort} onSort={(s) => patch({ sort: s })} />
                  <th>Route</th>
                  <th>Goods</th>
                  <th className="right">Tons</th>
                  <th>Status</th>
                  <th className="col-actions" />
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((r) => (
                  <RequestRow key={r.id} request={r} onChanged={list.reload} />
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {list.data && (
        <Pager
          page={list.data}
          onPage={(p) => patch({ page: String(p) })}
          onPageSize={(s) => patch({ page_size: String(s), page: null })}
        />
      )}
    </div>
  )
}

function RequestRow({ request: r, onChanged }: { request: LoadRequest; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)

  return (
    <>
      <tr className={r.status === 'CANCELLED' ? 'row-muted' : undefined}>
        <td>{r.request_date}</td>
        <td>
          <strong>{r.company_name}</strong>
          {r.notes && <div className="muted small">{r.notes}</div>}
        </td>
        <td>
          {r.from_place} <span className="arrow">→</span> {r.to_place}
        </td>
        <td>{r.goods ?? '—'}</td>
        <td className="right">{r.weight_tons ?? '—'}</td>
        <td>
          <span className={'status-chip status-' + r.status.toLowerCase()}>
            {STATUSES.find((s) => s.value === r.status)?.label ?? r.status}
          </span>
        </td>
        <td>
          <div className="contract-actions">
            <Link
              to={`/load-requests/${r.id}`}
              title="See the vehicles that run from and to these places"
            >
              Vehicles
            </Link>
            <EditAction
              title={editing ? 'Close the editor' : 'Correct this request or change its status'}
              onClick={() => setEditing((e) => !e)}
            />
          </div>
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={7}>
            <LoadRequestForm
              existing={r}
              onClose={() => setEditing(false)}
              onSaved={() => {
                setEditing(false)
                onChanged()
              }}
            />
          </td>
        </tr>
      )}
    </>
  )
}

interface FormState {
  consignor_id: number | null
  request_date: string
  from_city_id: number | null
  from_place: string
  to_city_id: number | null
  to_place: string
  goods_type_id: number | null
  goods: string
  weight_tons: string
  trucks_required: string
  body_type_id: number | null
  loading_date: string
  offered_price: string
  contact_name: string
  contact_mobile: string
  notes: string
  status: LoadRequestStatus
}

const text = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n))
/** A blank box means "not given", which the API stores as null; never as 0. */
const figure = (s: string): number | null => (s.trim() === '' ? null : Number(s))

/** Adding a request, or correcting one. Only the company and the route are required. */
function LoadRequestForm({
  existing,
  defaultDate,
  onClose,
  onSaved,
}: {
  existing?: LoadRequest
  defaultDate?: string
  onClose: () => void
  onSaved: () => void
}) {
  const [error, setError] = useState<ApiError | null>(null)
  const [busy, setBusy] = useState(false)
  const masters = useMasters()
  // Suggestions for the goods box; a commodity nobody has carried is typed and created.
  const goods = useAsync(() => goodsTypes.list(false), [])
  // The company is a customer from the master list: picked, never typed.
  const parties = useAsync(
    () =>
      fetchAll((page, page_size) => customers.list({ active: true, page, page_size, sort: 'name' })),
    [],
  )

  const [form, setForm] = useState<FormState>(() => ({
    consignor_id: existing?.consignor_id ?? null,
    request_date: existing?.request_date ?? defaultDate ?? today(),
    from_city_id: existing?.from_city_id ?? null,
    from_place: existing?.from_place ?? '',
    to_city_id: existing?.to_city_id ?? null,
    to_place: existing?.to_place ?? '',
    goods_type_id: existing?.goods_type_id ?? null,
    goods: existing?.goods ?? '',
    weight_tons: text(existing?.weight_tons),
    trucks_required: String(existing?.trucks_required ?? 1),
    body_type_id: existing?.body_type_id ?? null,
    loading_date: existing?.loading_date ?? '',
    offered_price: text(existing?.offered_price),
    contact_name: existing?.contact_name ?? '',
    contact_mobile: existing?.contact_mobile ?? '',
    notes: existing?.notes ?? '',
    status: existing?.status ?? 'OPEN',
  }))
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (form.consignor_id === null) {
      setError(new ApiError(422, 'Pick the company from the customer list.'))
      return
    }
    setBusy(true)
    setError(null)
    const body: LoadRequestSaveRequest = {
      consignor_id: form.consignor_id,
      request_date: form.request_date || undefined,
      from_city_id: form.from_city_id,
      from_place: form.from_place,
      to_city_id: form.to_city_id,
      to_place: form.to_place,
      goods_type_id: form.goods_type_id,
      goods: form.goods,
      weight_tons: figure(form.weight_tons),
      trucks_required: figure(form.trucks_required) ?? 1,
      body_type_id: form.body_type_id,
      loading_date: form.loading_date || null,
      offered_price: figure(form.offered_price),
      contact_name: form.contact_name,
      contact_mobile: form.contact_mobile,
      notes: form.notes,
      status: form.status,
    }
    try {
      if (existing) await loadRequests.update(existing.id, body)
      else await loadRequests.create(body)
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, String(err)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card lr-form" onSubmit={submit}>
      <FormError error={error} />

      <fieldset>
        <legend>Who is asking, and when</legend>
        <div className="grid-3">
          <Field
            label="Company"
            name="consignor_id"
            error={error}
            hint="From the customer master. Not listed? Add the customer under Masters first."
          >
            <select
              required
              value={form.consignor_id ?? ''}
              onChange={(e) =>
                set({ consignor_id: e.target.value ? Number(e.target.value) : null })
              }
            >
              <option value="">— pick a customer —</option>
              {/* A customer retired since this request was saved is not in the active list, but
                  must still show, or the edit would silently blank it. */}
              {existing &&
                !(parties.data?.items ?? []).some((p) => p.id === existing.consignor_id) && (
                  <option value={existing.consignor_id}>{existing.company_name} (retired)</option>
                )}
              {(parties.data?.items ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Request date" name="request_date" error={error}>
            <input
              type="date"
              value={form.request_date}
              onChange={(e) => set({ request_date: e.target.value })}
            />
          </Field>
          {existing && (
            <Field label="Status" name="status" error={error}>
              <select
                value={form.status}
                onChange={(e) => set({ status: e.target.value as LoadRequestStatus })}
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
      </fieldset>

      <fieldset>
        <legend>The load</legend>
        <div className="grid-3">
          <PlaceInput
            label="From"
            name="from_place"
            required
            value={form.from_place}
            error={error}
            onPick={(city, typed) => set({ from_city_id: city?.id ?? null, from_place: city?.name ?? typed })}
          />
          <PlaceInput
            label="To"
            name="to_place"
            required
            value={form.to_place}
            error={error}
            onPick={(city, typed) => set({ to_city_id: city?.id ?? null, to_place: city?.name ?? typed })}
          />
          <Field label="Goods — optional" name="goods" error={error}>
            <input
              list="load-request-goods"
              value={form.goods}
              onChange={(e) => {
                const match = (goods.data ?? []).find((g) => g.name === e.target.value)
                set({ goods: e.target.value, goods_type_id: match?.id ?? null })
              }}
            />
            <datalist id="load-request-goods">
              {(goods.data ?? []).map((g) => (
                <option key={g.id} value={g.name} />
              ))}
            </datalist>
          </Field>
          <Field label="Total weight (tons) — optional" name="weight_tons" error={error}>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={form.weight_tons}
              onChange={(e) => set({ weight_tons: e.target.value })}
            />
          </Field>
          <Field label="Trucks required" name="trucks_required" error={error}>
            <input
              type="number"
              min="1"
              max="500"
              step="1"
              value={form.trucks_required}
              onChange={(e) => set({ trucks_required: e.target.value })}
            />
          </Field>
          <Field label="Truck type — optional" name="body_type_id" error={error}>
            <select
              value={form.body_type_id ?? ''}
              onChange={(e) => set({ body_type_id: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">—</option>
              {masters.bodyTypes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Load by (date) — optional" name="loading_date" error={error}>
            <input
              type="date"
              value={form.loading_date}
              onChange={(e) => set({ loading_date: e.target.value })}
            />
          </Field>
          <Field
            label="Price offered, total (₹) — optional"
            name="offered_price"
            error={error}
          >
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={form.offered_price}
              onChange={(e) => set({ offered_price: e.target.value })}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <legend>Who to ring — optional</legend>
        <div className="grid-3">
          <Field label="Contact name" name="contact_name" error={error}>
            <input
              value={form.contact_name}
              onChange={(e) => set({ contact_name: e.target.value })}
            />
          </Field>
          <Field label="Contact mobile" name="contact_mobile" error={error}>
            <input
              inputMode="tel"
              value={form.contact_mobile}
              onChange={(e) => set({ contact_mobile: e.target.value })}
            />
          </Field>
          <Field label="Notes" name="notes" error={error}>
            <input value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
        </div>
      </fieldset>

      <div className="actions">
        <button type="submit" className="primary" disabled={busy}>
          {existing ? 'Save' : 'Add request'}
        </button>
        <button type="button" className="link" onClick={onClose} disabled={busy}>
          Close
        </button>
      </div>
    </form>
  )
}
