import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { ApiError, fetchAll } from '../api/client'
import { contracts, customers } from '../api/resources'
import type { ContractSaveRequest, LoadProviderContract } from '../api/types'
import { Empty, Field, FormError, Notice, Spinner } from '../components/Form'
import { Pager, SortHeader } from '../components/Pager'
import { PlaceInput } from '../components/PlaceInput'
import { DeleteAction, EditAction, RestoreAction } from '../components/RowActions'
import { useAsync, useDebounced } from '../components/useAsync'

/** The money boxes, in the order the form shows them. */
const MONEY = [
  ['price_approved', 'Price approved'],
  ['loading_charges', 'Loading charges'],
  ['unloading_charges', 'Unloading charges'],
  ['munshiana', 'Munshiana'],
  ['dala', 'Dala'],
  ['final_price_for_truck', 'Final price for truck'],
  ['per_tonne_price', 'Per tonne price'],
] as const

/** The loads the desk quotes for. */
const TRUCK_TONS = [12, 20, 25, 30, 36]

type MoneyField = (typeof MONEY)[number][0]

/** ₹ with Indian digit grouping, or a dash for a figure nobody entered. */
function rupees(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

/**
 * Load provider contracts — what each provider approved, what comes off it, and what the truck
 * is finally paid.
 *
 * <p>Every figure is shown exactly as it was entered. Nothing here adds or subtracts: the final
 * price for the truck is whatever was agreed, and the formula differs between providers.
 */
export function ContractsPage() {
  const [params, setParams] = useSearchParams()
  const [term, setTerm] = useState(params.get('q') ?? '')
  const debounced = useDebounced(term)
  const [adding, setAdding] = useState(false)

  const page = Number(params.get('page') ?? 1)
  const pageSize = Number(params.get('page_size') ?? 25)
  const sort = params.get('sort') ?? '-created_at'
  const showRetired = params.get('retired') === 'true'

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
      contracts.list({
        q: debounced.trim() || undefined,
        active: showRetired ? undefined : true,
        page,
        page_size: pageSize,
        sort,
      }),
    [debounced, showRetired, page, pageSize, sort],
  )

  return (
    <div className="stack">
      <header className="page-header">
        <h1>Load provider contracts</h1>
        <button type="button" className="primary" onClick={() => setAdding(true)}>
          Add a contract
        </button>
      </header>

      <Notice>
        The price each load provider approved at each location, and what comes off it. Figures are
        kept exactly as entered — nothing is calculated from the others.
      </Notice>

      {adding && (
        <ContractForm
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            list.reload()
          }}
        />
      )}

      <div className="filters">
        <input
          type="search"
          value={term}
          placeholder="Company or location"
          onChange={(e) => {
            setTerm(e.target.value)
            patch({ q: e.target.value })
          }}
        />
        <label className="check">
          <input
            type="checkbox"
            checked={showRetired}
            onChange={(e) => patch({ retired: e.target.checked ? 'true' : null })}
          />
          Include retired
        </label>
      </div>

      {list.error && <Notice kind="error">{list.error.message}</Notice>}
      {list.loading && !list.data && <Spinner />}

      {list.data &&
        (list.data.items.length === 0 ? (
          <Empty>No contracts recorded yet.</Empty>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table contracts-table">
              <thead>
                <tr>
                  <SortHeader label="Company" field="company_name" sort={sort} onSort={(s) => patch({ sort: s })} />
                  <SortHeader label="Location" field="location" sort={sort} onSort={(s) => patch({ sort: s })} />
                  <SortHeader label="Approved" field="price_approved" sort={sort} onSort={(s) => patch({ sort: s })} />
                  <th className="right">Loading</th>
                  <th className="right">Unloading</th>
                  <th className="right">Commission</th>
                  <th className="right">Munshiana</th>
                  <th className="right">Dala</th>
                  <SortHeader label="Truck gets" field="final_price_for_truck" sort={sort} onSort={(s) => patch({ sort: s })} />
                  <SortHeader label="Per tonne" field="per_tonne_price" sort={sort} onSort={(s) => patch({ sort: s })} />
                  <th className="col-actions" />
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((c) => (
                  <ContractRow key={c.id} contract={c} onChanged={list.reload} />
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

function ContractRow({
  contract: c,
  onChanged,
}: {
  contract: LoadProviderContract
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [editing, setEditing] = useState(false)
  const [pricing, setPricing] = useState(false)

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
    <>
      <tr className={c.active ? undefined : 'row-muted'}>
        <td>
          <strong>{c.company_name}</strong>
          {!c.active && <span className="muted small"> · retired</span>}
          {c.notes && <div className="muted small">{c.notes}</div>}
        </td>
        <td>{c.location ?? '—'}</td>
        <td className="right">{rupees(c.price_approved)}</td>
        <td className="right">{rupees(c.loading_charges)}</td>
        <td className="right">{rupees(c.unloading_charges)}</td>
        <td className="right">
          {c.commission_percentage === null ? '—' : `${c.commission_percentage}%`}
        </td>
        <td className="right">{rupees(c.munshiana)}</td>
        <td className="right">{rupees(c.dala)}</td>
        <td className="right">
          <strong>{rupees(c.final_price_for_truck)}</strong>
        </td>
        <td className="right">{rupees(c.per_tonne_price)}</td>
        <td>
          <div className="contract-actions">
          <button
            type="button"
            className="link"
            title="Price for a 12, 20, 25, 30 or 36 ton load"
            onClick={() => setPricing(true)}
          >
            Prices
          </button>
          <EditAction
            title={editing ? 'Close the editor' : 'Correct this contract'}
            onClick={() => setEditing((e) => !e)}
            disabled={busy}
          />
          {c.active ? (
            <DeleteAction
              title="Retire this contract — it has been replaced or has ended"
              onClick={() => run(() => contracts.retire(c.id))}
              disabled={busy}
            />
          ) : (
            <RestoreAction
              title="Put this contract back"
              onClick={() => run(() => contracts.restore(c.id))}
              disabled={busy}
            />
          )}
          </div>
        </td>
      </tr>
      {pricing && <PricePopup contract={c} onClose={() => setPricing(false)} />}
      {(error || editing) && (
        <tr>
          <td colSpan={11}>
            <FormError error={error} />
            {editing && (
              <ContractForm
                existing={c}
                onClose={() => setEditing(false)}
                onSaved={() => {
                  setEditing(false)
                  onChanged()
                }}
              />
            )}
          </td>
        </tr>
      )}
    </>
  )
}

type FormState = Record<MoneyField, string> & {
  consignor_id: number | null
  location: string
  city_id: number | null
  commission_percentage: string
  notes: string
}

const text = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n))

/** A blank box means "not entered", which the API stores as null; never as 0. */
const figure = (s: string): number | null => (s.trim() === '' ? null : Number(s))

/** Adding a contract, or correcting one. Only the customer is required. */
function ContractForm({
  existing,
  onClose,
  onSaved,
}: {
  existing?: LoadProviderContract
  onClose: () => void
  onSaved: () => void
}) {
  const [error, setError] = useState<ApiError | null>(null)
  const [busy, setBusy] = useState(false)
  // The load provider is a customer from the master list: picked, never typed.
  const parties = useAsync(
    () =>
      fetchAll((page, page_size) =>
        customers.list({ active: true, page, page_size, sort: 'name' }),
      ),
    [],
  )
  const [form, setForm] = useState<FormState>(() => ({
    consignor_id: existing?.consignor_id ?? null,
    location: existing?.location ?? '',
    city_id: existing?.city_id ?? null,
    commission_percentage: text(existing?.commission_percentage),
    notes: existing?.notes ?? '',
    price_approved: text(existing?.price_approved),
    loading_charges: text(existing?.loading_charges),
    unloading_charges: text(existing?.unloading_charges),
    munshiana: text(existing?.munshiana),
    dala: text(existing?.dala),
    final_price_for_truck: text(existing?.final_price_for_truck),
    per_tonne_price: text(existing?.per_tonne_price),
  }))
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    if (form.consignor_id === null) {
      setError(new ApiError(422, 'Pick the load provider company from the customer list.'))
      setBusy(false)
      return
    }
    const body: ContractSaveRequest = {
      consignor_id: form.consignor_id,
      city_id: form.city_id,
      location: form.location,
      commission_percentage: figure(form.commission_percentage),
      price_approved: figure(form.price_approved),
      loading_charges: figure(form.loading_charges),
      unloading_charges: figure(form.unloading_charges),
      munshiana: figure(form.munshiana),
      dala: figure(form.dala),
      final_price_for_truck: figure(form.final_price_for_truck),
      per_tonne_price: figure(form.per_tonne_price),
      notes: form.notes,
    }
    try {
      if (existing) await contracts.update(existing.id, body)
      else await contracts.create(body)
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, String(err)))
    } finally {
      setBusy(false)
    }
  }

  const money = (key: MoneyField, label: string) => (
    <Field key={key} label={label + ' (₹)'} name={key} error={error}>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        value={form[key]}
        onChange={(e) => set({ [key]: e.target.value } as Partial<FormState>)}
      />
    </Field>
  )

  return (
    <form className="card lr-form" onSubmit={submit}>
      <FormError error={error} />

      <fieldset>
        <legend>Who and where</legend>
        <div className="grid-3">
          <Field
            label="Load provider company"
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
              {/* A customer retired since this contract was saved is not in the active list,
                  but must still show, or the edit would silently blank it. */}
              {existing?.consignor_id != null &&
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
          <PlaceInput
            label="Location"
            name="location"
            value={form.location}
            error={error}
            onPick={(city, typed) => set({ city_id: city?.id ?? null, location: city?.name ?? typed })}
          />
        </div>
      </fieldset>

      <fieldset>
        <legend>Price and deductions — leave blank what does not apply</legend>
        <div className="grid-3">
          {money('price_approved', 'Price approved')}
          {money('loading_charges', 'Loading charges')}
          {money('unloading_charges', 'Unloading charges')}
          <Field label="Commission (%)" name="commission_percentage" error={error}>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              step="0.01"
              value={form.commission_percentage}
              onChange={(e) => set({ commission_percentage: e.target.value })}
            />
          </Field>
          {money('munshiana', 'Munshiana')}
          {money('dala', 'Dala')}
        </div>
      </fieldset>

      <fieldset>
        <legend>What the truck gets</legend>
        <div className="grid-3">
          {money('final_price_for_truck', 'Final price for truck')}
          {money('per_tonne_price', 'Per tonne price')}
          <Field label="Notes" name="notes" error={error}>
            <input value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
        </div>
      </fieldset>

      <div className="actions">
        <button type="submit" className="primary" disabled={busy}>
          {existing ? 'Save' : 'Add contract'}
        </button>
        <button type="button" className="link" onClick={onClose} disabled={busy}>
          Close
        </button>
      </div>
    </form>
  )
}

/**
 * What a load of each common size comes to under this contract: the per-tonne price times the
 * tonnage.
 *
 * <p>Display arithmetic only, and nothing is stored. It uses the per-tonne price exactly as
 * entered on the contract, so a contract without one has nothing to multiply and says so rather
 * than guessing from the other figures.
 */
function PricePopup({
  contract: c,
  onClose,
}: {
  contract: LoadProviderContract
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Through a portal, for the reason the photo viewer is: a fixed overlay inside a table row is
  // at the mercy of every ancestor's stacking context.
  return createPortal(
    <div className="price-popup-backdrop" onClick={onClose} role="presentation">
      <div
        className="card price-popup"
        role="dialog"
        aria-label="Price by load size"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <div>
            <strong>{c.company_name}</strong>
            {c.location && <span className="muted"> · {c.location}</span>}
          </div>
          <button type="button" className="link" onClick={onClose}>
            Close
          </button>
        </header>

        {c.per_tonne_price === null ? (
          <Notice>
            No per tonne price has been entered for this contract, so there is nothing to
            multiply. Edit the contract to add one.
          </Notice>
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>Load</th>
                  <th className="right">Price (₹)</th>
                </tr>
              </thead>
              <tbody>
                {TRUCK_TONS.map((tons) => (
                  <tr key={tons}>
                    <td>{tons} ton</td>
                    <td className="right">
                      <strong>{rupees(Math.round(c.per_tonne_price! * tons * 100) / 100)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted small">
              Per tonne price ₹{rupees(c.per_tonne_price)} × tons.
            </p>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
