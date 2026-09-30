import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchAll, ApiError } from '../api/client'
import { customers, geo, goodsTypes, lr, users, vehicles } from '../api/resources'
import type {
  City,
  Customer,
  GoodsTypeRef,
  LorryReceipt,
  LrSaveRequest,
  LrStatus,
  UserSummary,
  VehicleSummary,
} from '../api/types'
import { Empty, Field, FormError, Spinner } from '../components/Form'
import { Pager } from '../components/Pager'
import { ConfirmAction, DeleteAction, EditAction } from '../components/RowActions'
import { useAsync, useDebounced } from '../components/useAsync'
import { LrDocument } from '../components/LrDocument'

/** Only keys the API whitelists: an unknown `sort` is a 422, not a silent fallback. */
const SORTS = ['lr_date', 'seq_no', 'balance', 'total_charges', 'created_at', 'id']

const STATUS_LABEL: Record<LrStatus, string> = {
  BOOKED: 'Booked',
  IN_TRANSIT: 'On the road',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
}

/** Where a receipt may go next. Mirrors LrStatus.canMoveTo on the server, which is the truth. */
const NEXT: Record<LrStatus, LrStatus[]> = {
  BOOKED: ['IN_TRANSIT', 'DELIVERED'],
  IN_TRANSIT: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
}

const money = (v: string | null | undefined) =>
  v == null ? '—' : '₹' + Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })

/**
 * The lorry-receipt register.
 *
 * <p><b>Everything on a row is the receipt's own text, never a master looked up by id.</b> The
 * API returns both — `consignor_id` beside `consignor_name` — and on an old receipt they
 * legitimately disagree, because the customer was renamed or the truck re-registered after it
 * was issued. Rendering the current value of the id would show something the customer's copy
 * does not say. The ids are here only to make things clickable.
 */
export function LorryReceiptsPage() {
  const [params, setParams] = useSearchParams()
  const [term, setTerm] = useState(params.get('q') ?? '')
  const debounced = useDebounced(term)
  const [writing, setWriting] = useState(false)
  const [printing, setPrinting] = useState<LorryReceipt | null>(null)

  const page = Number(params.get('page') ?? 1)
  const pageSize = Number(params.get('page_size') ?? 25)
  const sort = params.get('sort') ?? 'lr_date'
  const status = (params.get('status') ?? '') as LrStatus | ''
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const unpaid = params.get('unpaid') === 'true'

  function patch(next: Record<string, string | null>) {
    const merged = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === '') merged.delete(k)
      else merged.set(k, v)
    }
    // Any change of filter invalidates the page number — staying on page 4 of a new result set
    // is how someone concludes the search is broken.
    if (!('page' in next)) merged.delete('page')
    setParams(merged, { replace: true })
  }

  const list = useAsync(
    () =>
      lr.list({
        q: debounced.trim() || undefined,
        status: status || undefined,
        from: from || undefined,
        to: to || undefined,
        unpaid: unpaid || undefined,
        page,
        page_size: pageSize,
        sort,
      }),
    [debounced, status, from, to, unpaid, page, pageSize, sort],
  )
  function reload() {
    list.reload()
  }

  return (
    <div className="stack">
      <header className="page-header">
        <h1>Lorry receipts</h1>
        <button type="button" className="primary" onClick={() => setWriting(true)}>
          Write a receipt
        </button>
      </header>

      {writing && <ReceiptForm onClose={() => setWriting(false)} onSaved={reload} />}

      <div className="filters lr-filters">
        <input
          type="search"
          className="lr-search"
          value={term}
          placeholder="Number, customer, truck, driver, place"
          onChange={(e) => {
            setTerm(e.target.value)
            patch({ q: e.target.value })
          }}
        />
        <label>
          Status{' '}
          <select value={status} onChange={(e) => patch({ status: e.target.value })}>
            <option value="">Everything</option>
            {(Object.keys(STATUS_LABEL) as LrStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          From <input type="date" value={from} onChange={(e) => patch({ from: e.target.value })} />
        </label>
        <label>
          To <input type="date" value={to} onChange={(e) => patch({ to: e.target.value })} />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={unpaid}
            onChange={(e) => patch({ unpaid: e.target.checked ? 'true' : null })}
          />
          Still owed
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
      {list.data?.items.length === 0 && <Empty>No receipts match.</Empty>}

      {list.data && list.data.items.length > 0 && (
        <div className="lr-list">
          {list.data.items.map((receipt) => (
            <ReceiptRow
              key={receipt.id}
              receipt={receipt}
              onChanged={reload}
              onPrint={() => setPrinting(receipt)}
            />
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

      {/* Rendered off-screen and handed to the browser's own print dialog — see LrDocument. */}
      {printing && <LrDocument receipt={printing} onDone={() => setPrinting(null)} />}
    </div>
  )
}

/** One receipt, two lines. The third appears only while it is being edited. */
function ReceiptRow({
  receipt,
  onChanged,
  onPrint,
}: {
  receipt: LorryReceipt
  onChanged: () => void
  onPrint: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [editing, setEditing] = useState(false)
  const [cancelling, setCancelling] = useState(false)

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

  const closed = receipt.status === 'DELIVERED' || receipt.status === 'CANCELLED'

  return (
    <section className="lr-row">
      <span className="lr-number">{receipt.lr_number}</span>
      <span className="lr-date">{receipt.lr_date}</span>
      <span className={'lr-status s-' + receipt.status.toLowerCase()}>
        {STATUS_LABEL[receipt.status]}
      </span>
      <span className="lr-route">
        <strong>{receipt.from_place}</strong>
        <span className="arrow">→</span>
        <strong>{receipt.to_place}</strong>
      </span>
      <span className="lr-money">{money(receipt.total_charges)}</span>
      <span className="lr-actions">
        <button
          type="button"
          className="icon-action"
          title="Download as PDF"
          aria-label="Download as PDF"
          disabled={busy}
          onClick={() => run(() => lr.download(receipt.id, receipt.lr_number))}
        >
          {/* A downward arrow into a tray. Distinct from the printer beside it: one saves a
              file, the other opens the browser's print dialog, and they are not the same act. */}
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
            <path
              d="M8 1.8v8.4M4.8 7l3.2 3.2L11.2 7M2.4 13.4h11.2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button type="button" className="icon-action" title="Print" aria-label="Print"
                onClick={onPrint}>
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
            <path d="M4.5 6V2.2h7V6M4.5 11.8H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v3.8a1 1 0 0 1-1 1h-1.5M4.5 10h7v3.8h-7z"
                  fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
        </button>
        {/* Editable in every state: a wrong weight is usually found when the paperwork is
            reconciled, which is after delivery. The lifecycle is what stays locked. */}
        <EditAction
          title={editing ? 'Close the editor' : 'Correct this receipt'}
          onClick={() => setEditing((e) => !e)}
          disabled={busy}
        />
        {/* Dispatch and deliver are different acts and must not share an icon -- a booked
            receipt offers both, and two identical ticks side by side is a coin toss. */}
        {NEXT[receipt.status].includes('IN_TRANSIT') && (
          <button
            type="button"
            className="icon-action"
            title="Mark as dispatched"
            aria-label="Mark as dispatched"
            disabled={busy}
            onClick={() => run(() => lr.status(receipt.id, 'IN_TRANSIT'))}
          >
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
              <path
                d="M1.6 8h9M7.6 4.4 11.2 8l-3.6 3.6M13.4 3.4v9.2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
        {NEXT[receipt.status].includes('DELIVERED') && (
          <ConfirmAction
            title="Mark as delivered"
            onClick={() => run(() => lr.status(receipt.id, 'DELIVERED'))}
            disabled={busy}
          />
        )}
        {!closed && (
          <DeleteAction
            title="Cancel this receipt"
            onClick={() => setCancelling(true)}
            disabled={busy}
          />
        )}
      </span>

      <div className="lr-secondary">
        <span className="lr-parties">
          {receipt.consignor_name} <span className="arrow">→</span> {receipt.consignee_name}
        </span>
        {receipt.goods_description && <span>{receipt.goods_description}</span>}
        {receipt.weight_kg && <span>{Number(receipt.weight_kg).toLocaleString('en-IN')} kg</span>}
        {receipt.packages != null && <span>{receipt.packages} pkg</span>}
        {receipt.vehicle_number && <span className="lr-truck">{receipt.vehicle_number}</span>}
        {receipt.driver_name && <span>{receipt.driver_name}</span>}
        {receipt.status === 'CANCELLED' && receipt.cancel_reason && (
          <span className="lr-cancelled">Cancelled — {receipt.cancel_reason}</span>
        )}
      </div>

      <FormError error={error} />

      {cancelling && (
        <CancelBox
          onCancel={() => setCancelling(false)}
          onConfirm={(reason) => {
            setCancelling(false)
            return run(() => lr.cancel(receipt.id, reason))
          }}
        />
      )}

      {editing && (
        <ReceiptForm
          existing={receipt}
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
 * Cancelling asks for a reason, because the row is kept for ever and "why" is the only thing
 * that makes a cancelled number in the series answerable later.
 */
function CancelBox({
  onConfirm,
  onCancel,
}: {
  onConfirm: (reason: string) => void
  onCancel: () => void
}) {
  const [reason, setReason] = useState('')
  return (
    <div className="lr-cancel-box">
      <input
        autoFocus
        value={reason}
        placeholder="Why is it being cancelled?"
        onChange={(e) => setReason(e.target.value)}
      />
      <button type="button" className="danger" onClick={() => onConfirm(reason)}>
        Cancel the receipt
      </button>
      <button type="button" className="link" onClick={onCancel}>
        Keep it
      </button>
    </div>
  )
}

/**
 * Writing or correcting a receipt.
 *
 * <p>Every master is a type-ahead that also accepts a name nobody has used before: at a loading
 * bay the truck is in front of the clerk and the paperwork is catching up, so a customer who is
 * not on file yet must not stop the receipt being written. The server creates the master row.
 */
function ReceiptForm({
  existing,
  onClose,
  onSaved,
}: {
  existing?: LorryReceipt
  onClose: () => void
  onSaved: () => void
}) {
  const [error, setError] = useState<ApiError | null>(null)
  const [busy, setBusy] = useState(false)
  const next = useAsync(() => (existing ? Promise.resolve(null) : lr.nextNumber()), [])
  const goods = useAsync(() => goodsTypes.list(false), [])
  // Loaded once here, not inside each picker: two pickers on one form would otherwise issue
  // two identical requests and could disagree while one of them was still in flight.
  // Every customer, not the first 200. A `<select>` that silently omits the 201st is how a
  // clerk ends up creating a second "Kumar Traders" that already exists.
  const parties = useAsync(
    () => fetchAll((page, page_size) =>
      customers.list({ active: true, page, page_size, sort: 'name' })),
    [],
  )
  const bodyTypes = useAsync(() => geo.bodyTypes(false), [])

  const [form, setForm] = useState<LrSaveRequest>(() =>
    existing
      ? {
          lr_number: existing.lr_number,
          lr_date: existing.lr_date,
          consignor_id: existing.consignor_id,
          consignor_name: existing.consignor_name,
          consignor_mobile: existing.consignor_mobile ?? '',
          consignee_id: existing.consignee_id,
          consignee_name: existing.consignee_name,
          consignee_mobile: existing.consignee_mobile ?? '',
          from_city_id: existing.from_city_id,
          from_place: existing.from_place,
          to_city_id: existing.to_city_id,
          to_place: existing.to_place,
          goods_type_id: existing.goods_type_id,
          goods_description: existing.goods_description ?? '',
          weight_kg: existing.weight_kg ?? '',
          packages: existing.packages,
          vehicle_id: existing.vehicle_id,
          vehicle_number: existing.vehicle_number ?? '',
          body_type_id: existing.body_type_id,
          driver_user_id: existing.driver_user_id,
          driver_name: existing.driver_name ?? '',
          driver_mobile: existing.driver_mobile ?? '',
          freight_charges: existing.freight_charges,
          loading_charges: existing.loading_charges,
          unloading_charges: existing.unloading_charges,
          other_charges: existing.other_charges,
          advance: existing.advance,
          special_instructions: existing.special_instructions ?? '',
          notes: existing.notes ?? '',
        }
      : { lr_date: new Date().toISOString().slice(0, 10) },
  )

  const set = (patch: Partial<LrSaveRequest>) => setForm((f) => ({ ...f, ...patch }))

  const total =
    Number(form.freight_charges || 0) +
    Number(form.loading_charges || 0) +
    Number(form.unloading_charges || 0) +
    Number(form.other_charges || 0)
  const balance = total - Number(form.advance || 0)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (existing) await lr.update(existing.id, form)
      else await lr.create(form)
      onSaved()
      if (!existing) onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, String(err)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card lr-form" onSubmit={submit}>
      <FormError error={error} />

      <div className="grid-2">
        <Field label="Number" name="lr_number" error={error}>
          <input
            value={form.lr_number ?? ''}
            // A placeholder, not a value: the server hands out the number when it saves, and
            // two clerks with this form open would otherwise both think they own LR-042.
            placeholder={next.data?.lr_number ?? 'auto'}
            onChange={(e) => set({ lr_number: e.target.value })}
          />
        </Field>
        <Field label="Date" name="lr_date" error={error}>
          <input
            type="date"
            required
            value={form.lr_date ?? ''}
            onChange={(e) => set({ lr_date: e.target.value })}
          />
        </Field>
      </div>

      <fieldset>
        <legend>Consignor</legend>
        <div className="grid-3">
          <CustomerPicker
            label="Sender"
            field="consignor_name"
            name={form.consignor_name ?? ''}
            error={error}
            options={parties.data?.items ?? []}
            selectedId={form.consignor_id}
            onPick={(c) =>
              set({
                consignor_id: c?.id ?? null,
                consignor_name: c?.name ?? '',
                consignor_mobile: c?.mobile ?? form.consignor_mobile,
              })
            }
            onType={(name) => set({ consignor_id: null, consignor_name: name })}
          />
          <Field label="Mobile" name="consignor_mobile" error={error}>
            <input
              value={form.consignor_mobile ?? ''}
              onChange={(e) => set({ consignor_mobile: e.target.value })}
            />
          </Field>
          <CityPicker
            label="From"
            field="from_place"
            value={form.from_place ?? ''}
            error={error}
            onPick={(city, text) =>
              set({ from_city_id: city?.id ?? null, from_place: city?.name ?? text })
            }
          />
        </div>
      </fieldset>

      <fieldset>
        <legend>Consignee</legend>
        <div className="grid-3">
          <CustomerPicker
            label="Receiver"
            field="consignee_name"
            name={form.consignee_name ?? ''}
            error={error}
            options={parties.data?.items ?? []}
            selectedId={form.consignee_id}
            onPick={(c) =>
              set({
                consignee_id: c?.id ?? null,
                consignee_name: c?.name ?? '',
                consignee_mobile: c?.mobile ?? form.consignee_mobile,
              })
            }
            onType={(name) => set({ consignee_id: null, consignee_name: name })}
          />
          <Field label="Mobile" name="consignee_mobile" error={error}>
            <input
              value={form.consignee_mobile ?? ''}
              onChange={(e) => set({ consignee_mobile: e.target.value })}
            />
          </Field>
          <CityPicker
            label="To"
            field="to_place"
            value={form.to_place ?? ''}
            error={error}
            onPick={(city, text) =>
              set({ to_city_id: city?.id ?? null, to_place: city?.name ?? text })
            }
          />
        </div>
      </fieldset>

      <fieldset>
        <legend>Goods</legend>
        <div className="grid-3">
          <Field label="What" name="goods_description" error={error}>
            <input
              list="lr-goods"
              value={form.goods_description ?? ''}
              onChange={(e) => {
                const match = (goods.data ?? []).find((g) => g.name === e.target.value)
                set({ goods_description: e.target.value, goods_type_id: match?.id ?? null })
              }}
            />
            <datalist id="lr-goods">
              {(goods.data ?? []).map((g: GoodsTypeRef) => (
                <option key={g.id} value={g.name} />
              ))}
            </datalist>
          </Field>
          <Field label="Weight (kg)" name="weight_kg" error={error}>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.weight_kg ?? ''}
              onChange={(e) => set({ weight_kg: e.target.value })}
            />
          </Field>
          <Field label="Packages" name="packages" error={error}>
            <input
              type="number"
              min="0"
              value={form.packages ?? ''}
              onChange={(e) =>
                set({ packages: e.target.value === '' ? null : Number(e.target.value) })
              }
            />
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <legend>Truck and driver</legend>
        <div className="grid-4">
          <VehiclePicker
            value={form.vehicle_number ?? ''}
            error={error}
            onPick={(v, text) =>
              set({
                vehicle_id: v?.id ?? null,
                vehicle_number: v?.registration_number ?? text,
                body_type_id: v?.body_type_id ?? form.body_type_id,
              })
            }
          />
          <Field label="Type" name="body_type_id">
            <select
              value={form.body_type_id ?? ''}
              onChange={(e) =>
                set({ body_type_id: e.target.value ? Number(e.target.value) : null })
              }
            >
              <option value="">—</option>
              {(bodyTypes.data ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <DriverPicker
            value={form.driver_name ?? ''}
            error={error}
            onPick={(d, text) =>
              set({
                driver_user_id: d?.id ?? null,
                driver_name: d?.name ?? text,
                driver_mobile: d?.mobile ?? form.driver_mobile,
              })
            }
          />
          <Field label="Driver mobile" name="driver_mobile" error={error}>
            <input
              value={form.driver_mobile ?? ''}
              onChange={(e) => set({ driver_mobile: e.target.value })}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <legend>Charges</legend>
        <div className="grid-4">
          {(
            [
              ['freight_charges', 'Freight'],
              ['loading_charges', 'Loading'],
              ['unloading_charges', 'Unloading'],
              ['other_charges', 'Other'],
              ['advance', 'Advance'],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label} name={key} error={error}>
              <input
                type="number"
                min="0"
                step="0.01"
                value={(form[key] as string | number | undefined) ?? ''}
                onChange={(e) => set({ [key]: e.target.value } as Partial<LrSaveRequest>)}
              />
            </Field>
          ))}
        </div>
        {/* Shown, not sent. The database computes both — see the generated columns on
            lorry_receipts — and this is only so the clerk sees the sum before saving. */}
        <p className="lr-sum">
          Total {money(String(total))} · Balance {money(String(balance))}
          {balance < 0 && <strong className="lr-owed"> — the advance is more than the total</strong>}
        </p>
      </fieldset>

      <div className="grid-2">
        <Field label="Special instructions" name="special_instructions">
          <input
            value={form.special_instructions ?? ''}
            onChange={(e) => set({ special_instructions: e.target.value })}
          />
        </Field>
        <Field label="Notes" name="notes">
          <input value={form.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </div>

      <div className="actions">
        <button type="submit" className="primary" disabled={busy || balance < 0}>
          {existing ? 'Save' : 'Write the receipt'}
        </button>
        <button type="button" className="link" onClick={onClose} disabled={busy}>
          Close
        </button>
      </div>
    </form>
  )
}

// ── the pickers ─────────────────────────────────────────────────────────────

/**
 * A type-ahead that does not insist on a match.
 *
 * The distinction it keeps is between "picked a known row" (an id goes with the name) and
 * "typed something new" (no id, and the server creates the row). Collapsing those two would
 * either block the receipt or silently attach it to the wrong customer.
 */
/** The sentinel option that switches the picker into free-text mode. */
const ADD_NEW = '__add_new__'

/**
 * Pick a customer from the list.
 *
 * <p>A real {@code <select>} rather than the type-ahead this was: customers are a master now,
 * managed on the Masters screen, and a dropdown is what says so — it shows what exists instead
 * of waiting to be guessed at.
 *
 * <p><b>It still allows a name that is not on the list</b>, through one explicit option at the
 * bottom. A clerk at a loading bay has the truck in front of them and a consignor nobody has
 * entered yet; making them leave the half-written receipt, go to Masters, add the customer and
 * come back would be the kind of tidiness that gets worked around with a fake name. The server
 * creates the row either way — the difference is that choosing it is now deliberate rather
 * than a side effect of typing.
 *
 * <p>When editing an old receipt whose customer has since been renamed or retired, that name is
 * added to the list as its own option. The document says what it says; the dropdown must be
 * able to show it rather than silently falling back to blank.
 */
function CustomerPicker({
  label,
  field,
  name,
  error,
  options,
  selectedId,
  onPick,
  onType,
}: {
  label: string
  field: string
  name: string
  error: ApiError | null
  options: Customer[]
  selectedId: number | null | undefined
  onPick: (c: Customer | null) => void
  onType: (name: string) => void
}) {
  // Free-text mode is entered deliberately, and stays until the clerk goes back to the list.
  const [adding, setAdding] = useState(false)

  // A customer the receipt names but the active list does not contain — renamed, or retired
  // since it was issued. Shown so the field is not silently blank.
  const missing =
    name && !options.some((c) => c.name === name)
      ? ({ id: selectedId ?? -1, name, mobile: null } as Customer)
      : null
  const all = missing ? [missing, ...options] : options

  if (adding) {
    return (
      <Field label={label} name={field} error={error}>
        <input
          autoFocus
          value={name}
          placeholder="New customer's name"
          onChange={(e) => onType(e.target.value)}
        />
        <button
          type="button"
          className="link field-aside"
          onClick={() => {
            setAdding(false)
            onPick(null)
          }}
        >
          Choose from the list instead
        </button>
      </Field>
    )
  }

  return (
    <Field label={label} name={field} error={error}>
      <select
        value={selectedId ?? (missing ? missing.id : '')}
        onChange={(e) => {
          if (e.target.value === ADD_NEW) {
            setAdding(true)
            onType('')
            return
          }
          const picked = all.find((c) => String(c.id) === e.target.value)
          if (picked && picked.id < 0) {
            // The receipt names a customer whose row is gone (ON DELETE SET NULL). Keep the
            // printed name, but do not post the placeholder id -- the server would 404 on it.
            onType(picked.name)
            return
          }
          onPick(picked ?? null)
        }}
      >
        <option value="">Pick a customer</option>
        {all.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.mobile ? ' · ' + c.mobile : ''}
          </option>
        ))}
        <option value={ADD_NEW}>+ Someone not on the list…</option>
      </select>
    </Field>
  )
}

/**
 * A place, matched against the city list but not restricted to it.
 *
 * Loads are picked up at factory gates on highways. "NH-48, near Bagru" is a real answer that
 * no city list contains, and the server keeps it as text — the city link is a bonus that makes
 * "everything out of Jaipur" work, not a requirement.
 */
function CityPicker({
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
        list={'lr-city-' + label}
        value={term}
        onChange={(e) => {
          setTerm(e.target.value)
          const match = (found.data?.items ?? []).find((c) => c.name === e.target.value)
          onPick(match ?? null, e.target.value)
        }}
      />
      <datalist id={'lr-city-' + label}>
        {(found.data?.items ?? []).map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>
    </Field>
  )
}

/** The truck. May be one of ours, or a hired one that is not in the register at all. */
function VehiclePicker({
  value,
  error,
  onPick,
}: {
  value: string
  error: ApiError | null
  onPick: (v: VehicleSummary | null, text: string) => void
}) {
  const [term, setTerm] = useState(value)
  const debounced = useDebounced(term)
  const found = useAsync(
    () =>
      debounced.trim().length < 3
        ? Promise.resolve(null)
        : vehicles.list({ q: debounced.trim(), page_size: 8 }),
    [debounced],
  )

  useEffect(() => setTerm(value), [value])

  return (
    <Field label="Truck" name="vehicle_number" error={error}>
      <input
        list="lr-vehicles"
        value={term}
        placeholder="RJ14CA1234"
        onChange={(e) => {
          setTerm(e.target.value)
          const match = (found.data?.items ?? []).find(
            (v) => v.registration_number === e.target.value.toUpperCase(),
          )
          onPick(match ?? null, e.target.value.toUpperCase())
        }}
      />
      <datalist id="lr-vehicles">
        {(found.data?.items ?? []).map((v) => (
          <option key={v.id} value={v.registration_number} />
        ))}
      </datalist>
    </Field>
  )
}

/** The driver. The server refuses anyone who is not a driver, so only drivers are offered. */
function DriverPicker({
  value,
  error,
  onPick,
}: {
  value: string
  error: ApiError | null
  onPick: (d: UserSummary | null, text: string) => void
}) {
  const [term, setTerm] = useState(value)
  const debounced = useDebounced(term)
  const found = useAsync(
    () =>
      debounced.trim().length < 2
        ? Promise.resolve(null)
        : users.list({ q: debounced.trim(), type: 'DRIVER', page_size: 8 }),
    [debounced],
  )

  useEffect(() => setTerm(value), [value])

  return (
    <Field label="Driver" name="driver_name" error={error}>
      <input
        list="lr-drivers"
        value={term}
        onChange={(e) => {
          setTerm(e.target.value)
          const match = (found.data?.items ?? []).find((d) => d.name === e.target.value)
          onPick(match ?? null, e.target.value)
        }}
      />
      <datalist id="lr-drivers">
        {(found.data?.items ?? []).map((d) => (
          <option key={d.id} value={d.name}>
            {d.mobile}
          </option>
        ))}
      </datalist>
    </Field>
  )
}

