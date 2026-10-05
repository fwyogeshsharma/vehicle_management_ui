import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchAll, ApiError } from '../api/client'
import { customers, geo, goodsTypes, lanes } from '../api/resources'
import type { City, FreightLane, LaneSaveRequest } from '../api/types'
import { Empty, Field, FormError, Notice, Spinner } from '../components/Form'
import { Pager } from '../components/Pager'
import { DeleteAction, EditAction, RestoreAction } from '../components/RowActions'
import { useAsync, useDebounced } from '../components/useAsync'
import { useMasters } from '../components/useMasters'

const SORTS = ['created_at', 'from_place', 'to_place', 'goods', 'id']

/**
 * Lane intelligence — what a CSR hears is moving, and where.
 *
 * <p>"Meerut to Lucknow, mangoes go." A driver mentions it mid-call and today that sentence
 * dies with the call. This screen keeps it, and the report at the top is the reason: the
 * routes that keep coming up are the ones worth quoting for.
 *
 * <p><b>Three fields to record one.</b> Everything else is optional on purpose — this is typed
 * during a call about something else, and a form that demands a tonnage gets an invented one.
 */
export function LanesPage() {
  const [params, setParams] = useSearchParams()
  const [term, setTerm] = useState(params.get('q') ?? '')
  const debounced = useDebounced(term)
  const [adding, setAdding] = useState(false)

  const page = Number(params.get('page') ?? 1)
  const pageSize = Number(params.get('page_size') ?? 25)
  const sort = params.get('sort') ?? 'created_at'
  const showRetired = params.get('retired') === 'true'
  const seasonalOnly = params.get('seasonal') === 'true'

  function patch(next: Record<string, string | null>) {
    const merged = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === '') merged.delete(k)
      else merged.set(k, v)
    }
    if (!('page' in next)) merged.delete('page')
    setParams(merged, { replace: true })
  }

  const list = useAsync(
    () =>
      lanes.list({
        q: debounced.trim() || undefined,
        active: showRetired ? undefined : true,
        seasonal: seasonalOnly ? true : undefined,
        page,
        page_size: pageSize,
        sort,
      }),
    [debounced, showRetired, seasonalOnly, page, pageSize, sort],
  )
  function reload() {
    list.reload()
  }

  return (
    <div className="stack">
      <header className="page-header">
        <h1>Lanes</h1>
        <button type="button" className="primary" onClick={() => setAdding(true)}>
          Record a lane
        </button>
      </header>

      <Notice>
        What a customer or driver mentions is moving, and where — kept so the routes worth
        quoting for can be found later. These are <strong>not consignments</strong>: nothing
        here is owed or promised.
      </Notice>

      {adding && (
        <LaneForm
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            reload()
          }}
        />
      )}

      <div className="filters lr-filters">
        <input
          type="search"
          className="lr-search"
          value={term}
          placeholder="Place, goods, season or who told us"
          onChange={(e) => {
            setTerm(e.target.value)
            patch({ q: e.target.value })
          }}
        />
        <label className="check">
          <input
            type="checkbox"
            checked={seasonalOnly}
            onChange={(e) => patch({ seasonal: e.target.checked ? 'true' : null })}
          />
          Seasonal only
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={showRetired}
            onChange={(e) => patch({ retired: e.target.checked ? 'true' : null })}
          />
          Include retired
        </label>
        <label>
          Sort{' '}
          <select value={sort} onChange={(e) => patch({ sort: e.target.value })}>
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </label>
      </div>

      {list.loading && <Spinner />}
      <FormError error={list.error} />
      {list.data?.items.length === 0 && <Empty>No lanes recorded yet.</Empty>}

      {list.data && list.data.items.length > 0 && (
        <div className="lr-list">
          {list.data.items.map((lane) => (
            <LaneRow key={lane.id} lane={lane} onChanged={reload} />
          ))}
        </div>
      )}

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

function LaneRow({ lane, onChanged }: { lane: FreightLane; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [editing, setEditing] = useState(false)

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      onChanged()
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={lane.active ? 'lane-row' : 'lane-row retired'}>
      <span className="lane-route">
        <strong>{lane.from_place}</strong>
        <span className="arrow">→</span>
        <strong>{lane.to_place}</strong>
      </span>
      <span className="lane-goods">{lane.goods}</span>
      <span className="lane-company">{lane.company_name ?? ''}</span>
      {/* The flag is what the eye needs; the months are the detail beside it. */}
      <span className="lane-season">
        {lane.seasonal ? (
          <span className="lane-chip">{lane.season ? lane.season : 'Seasonal'}</span>
        ) : (
          <span className="lane-allyear">All year</span>
        )}
      </span>
      <span className="lr-actions">
        <EditAction
          title={editing ? 'Close the editor' : 'Correct this lane'}
          onClick={() => setEditing((e) => !e)}
          disabled={busy}
        />
        {lane.active ? (
          <DeleteAction
            title="Retire this lane — it dried up, or it was wrong"
            onClick={() => run(() => lanes.retire(lane.id))}
            disabled={busy}
          />
        ) : (
          <RestoreAction
            title="Put this lane back"
            onClick={() => run(() => lanes.restore(lane.id))}
            disabled={busy}
          />
        )}
      </span>

      <div className="lr-secondary">
        {lane.source && <span>Told by {lane.source}</span>}
        {lane.source_mobile && <span>{lane.source_mobile}</span>}
        {lane.notes && <span>{lane.notes}</span>}
        {!lane.active && <span className="lr-cancelled">Retired</span>}
        <span className="lane-by">
          {lane.recorded_by ?? 'unknown'} · {lane.created_at.slice(0, 10)}
        </span>
      </div>

      <FormError error={error} />

      {editing && (
        <LaneForm
          existing={lane}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            onChanged()
          }}
        />
      )}
    </section>
  )
}

/**
 * Recording or correcting a lane.
 *
 * <p>Places and goods accept a name that is not on the list — loads leave factory gates no
 * city list contains, and the first mention of a commodity nobody has carried must not wait
 * for an administrator. The server creates the master row.
 */
function LaneForm({
  existing,
  onClose,
  onSaved,
}: {
  existing?: FreightLane
  onClose: () => void
  onSaved: () => void
}) {
  const [error, setError] = useState<ApiError | null>(null)
  const [busy, setBusy] = useState(false)
  const goods = useAsync(() => goodsTypes.list(false), [])
  const masters = useMasters()
  // Suggestions only. Typing a company that is not a customer is normal here -- most lanes
  // are somebody else's business, which is the point of writing them down.
  const parties = useAsync(
    () => fetchAll((page, page_size) =>
      customers.list({ active: true, page, page_size, sort: 'name' })),
    [],
  )

  const [form, setForm] = useState<LaneSaveRequest>(() =>
    existing
      ? {
          company_name: existing.company_name ?? '',
          seasonal: existing.seasonal,
          from_city_id: existing.from_city_id,
          from_place: existing.from_place,
          to_city_id: existing.to_city_id,
          to_place: existing.to_place,
          goods_type_id: existing.goods_type_id,
          goods: existing.goods,
          season: existing.season ?? '',
          body_type_id: existing.body_type_id,
          source: existing.source ?? '',
          source_mobile: existing.source_mobile ?? '',
          notes: existing.notes ?? '',
        }
      : { from_place: '', to_place: '', seasonal: false },
  )

  const set = (patch: Partial<LaneSaveRequest>) => setForm((f) => ({ ...f, ...patch }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (existing) await lanes.update(existing.id, form)
      else await lanes.create(form)
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
        <legend>What moves, and where</legend>
        <div className="grid-3">
          <PlacePicker
            label="From"
            field="from_place"
            value={form.from_place}
            error={error}
            onPick={(city, text) =>
              set({ from_city_id: city?.id ?? null, from_place: city?.name ?? text })
            }
          />
          <PlacePicker
            label="To"
            field="to_place"
            value={form.to_place}
            error={error}
            onPick={(city, text) =>
              set({ to_city_id: city?.id ?? null, to_place: city?.name ?? text })
            }
          />
          <Field label="Goods" name="goods" error={error}>
            <input
              list="lane-goods"
              required
              value={form.goods ?? ''}
              onChange={(e) => {
                const match = (goods.data ?? []).find((g) => g.name === e.target.value)
                set({ goods: e.target.value, goods_type_id: match?.id ?? null })
              }}
            />
            <datalist id="lane-goods">
              {(goods.data ?? []).map((g) => (
                <option key={g.id} value={g.name} />
              ))}
            </datalist>
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <legend>Whose, and when — all optional</legend>
        <div className="grid-3">
          <Field
            label="Company"
            name="company_name"
            error={error}
            hint="Whose cargo. Suggestions are existing customers; a new name creates nothing."
          >
            <input
              list="lane-companies"
              value={form.company_name ?? ''}
              onChange={(e) => set({ company_name: e.target.value })}
            />
            <datalist id="lane-companies">
              {(parties.data?.items ?? []).map((p) => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>
          </Field>
          <Field label="Truck type" name="body_type_id" error={error}>
            <select
              value={form.body_type_id ?? ''}
              onChange={(e) =>
                set({ body_type_id: e.target.value ? Number(e.target.value) : null })
              }
            >
              <option value="">—</option>
              {masters.bodyTypes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Season"
            name="season"
            error={error}
            hint={
              form.seasonal
                ? 'Which months, roughly.'
                : 'Tick seasonal first — months are ignored on an all-year lane.'
            }
          >
            <label className="check lane-seasonal">
              <input
                type="checkbox"
                checked={form.seasonal ?? false}
                onChange={(e) => set({ seasonal: e.target.checked })}
              />
              Only part of the year
            </label>
            <input
              value={form.season ?? ''}
              placeholder="Apr–Jul, monsoon, after Diwali"
              disabled={!form.seasonal}
              onChange={(e) => set({ season: e.target.value })}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <legend>Who told us</legend>
        <div className="grid-3">
          <Field label="Name" name="source" error={error}>
            <input
              value={form.source ?? ''}
              onChange={(e) => set({ source: e.target.value })}
            />
          </Field>
          <Field label="Mobile" name="source_mobile" error={error}>
            <input
              value={form.source_mobile ?? ''}
              onChange={(e) => set({ source_mobile: e.target.value })}
            />
          </Field>
          <Field label="Notes" name="notes" error={error}>
            <input value={form.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
        </div>
      </fieldset>

      <div className="actions">
        <button type="submit" className="primary" disabled={busy}>
          {existing ? 'Save' : 'Record it'}
        </button>
        <button type="button" className="link" onClick={onClose} disabled={busy}>
          Close
        </button>
      </div>
    </form>
  )
}

/** A place, matched against the city list but not restricted to it. */
function PlacePicker({
  label,
  field,
  value,
  error,
  onPick,
}: {
  label: string
  field: string
  value: string
  error: ApiError | null
  onPick: (city: City | null, text: string) => void
}) {
  const [term, setTerm] = useState(value)
  const debounced = useDebounced(term)
  const found = useAsync(
    () =>
      debounced.trim().length < 2
        ? Promise.resolve(null)
        : geo.searchCities(debounced.trim(), null, 8),
    [debounced],
  )

  useEffect(() => setTerm(value), [value])

  return (
    <Field label={label} name={field} error={error}>
      <input
        list={'lane-city-' + label}
        required
        value={term}
        onChange={(e) => {
          setTerm(e.target.value)
          const match = (found.data?.items ?? []).find((c) => c.name === e.target.value)
          onPick(match ?? null, e.target.value)
        }}
      />
      <datalist id={'lane-city-' + label}>
        {(found.data?.items ?? []).map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>
    </Field>
  )
}
