import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { customers, geo, goodsTypes } from '../api/resources'
import type { Customer } from '../api/types'
import { Empty, Field, FormError, Notice, Spinner } from '../components/Form'
import { Pager } from '../components/Pager'
import { useAsync, useDebounced } from '../components/useAsync'

/**
 * One screen for every pick list in the system.
 *
 * <p><b>Why one screen and not six.</b> These lists are edited rarely and almost always in a
 * batch — somebody onboarding a new branch adds the customers, the goods they ship and the
 * town they ship from in one sitting. Six nav items for that would bury the four screens people
 * use daily.
 *
 * <p><b>Nothing here deletes.</b> Every list retires instead, because every one of them is
 * pointed at by rows that must keep reading correctly: a lorry receipt names a customer and a
 * city, a vehicle names a body type. Retiring takes a value off the pick lists and leaves
 * history alone; deleting would either be refused by the database or silently blank a link on
 * a document somebody holds a copy of.
 *
 * <p><b>States are shown but not editable.</b> There are 36, and a new one is a constitutional
 * event rather than a data-entry task. The API has no endpoint for it.
 */
const TABS = [
  { key: 'customers', label: 'Customers' },
  { key: 'goods', label: 'Goods' },
  { key: 'body-types', label: 'Body types' },
  { key: 'capacities', label: 'Capacities' },
  { key: 'cities', label: 'Cities' },
] as const

type TabKey = (typeof TABS)[number]['key']

export function MastersPage() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') ?? 'customers') as TabKey

  return (
    <div className="stack">
      <header className="page-header">
        <h1>Masters</h1>
      </header>

      <Notice>
        These are the pick lists the rest of the app offers. Values are <strong>retired</strong>,
        never deleted — receipts and vehicles point at them, and removing a row would change a
        document that has already been issued.
      </Notice>

      <nav className="master-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={t.key === tab ? 'master-tab active' : 'master-tab'}
            onClick={() => setParams({ tab: t.key }, { replace: true })}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'customers' && <CustomersTab />}
      {tab === 'goods' && <GoodsTab />}
      {tab === 'body-types' && <BodyTypesTab />}
      {tab === 'capacities' && <CapacitiesTab />}
      {tab === 'cities' && <CitiesTab />}
    </div>
  )
}

/**
 * The shared shape of a master list: a row, its state, and the two verbs.
 *
 * Kept as one component because the alternative is five copies of the same
 * busy/error/retire/restore logic, and they would drift — one of them would end up saying
 * "Delete".
 */
function MasterRow({
  name,
  meta,
  active,
  onRetire,
  onRestore,
  children,
}: {
  name: string
  meta?: React.ReactNode
  active: boolean
  onRetire: () => Promise<unknown>
  onRestore: () => Promise<unknown>
  children?: React.ReactNode
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className={active ? 'master-row' : 'master-row retired'}>
      <span className="master-name">{name}</span>
      {meta && <span className="master-meta">{meta}</span>}
      {!active && <span className="badge">retired</span>}
      <span className="master-actions">
        {children}
        {active ? (
          <button
            type="button"
            className="link danger"
            disabled={busy}
            onClick={() => run(onRetire)}
          >
            Retire
          </button>
        ) : (
          <button type="button" className="link" disabled={busy} onClick={() => run(onRestore)}>
            Restore
          </button>
        )}
      </span>
      <FormError error={error} />
    </li>
  )
}

/** The add box every tab has, so the wording and the error handling are written once. */
function AddBox({
  children,
  onAdd,
  label = 'Add',
}: {
  children: React.ReactNode
  onAdd: () => Promise<unknown>
  label?: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onAdd()
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, String(err)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card master-add" onSubmit={submit}>
      <FormError error={error} />
      <div className="master-add-fields">{children}</div>
      <button type="submit" className="primary" disabled={busy}>
        {label}
      </button>
    </form>
  )
}

// ── customers ───────────────────────────────────────────────────────────────

/**
 * Consignors and consignees.
 *
 * <p>One list for both roles: the same firm sends on Monday and receives on Friday, and two
 * lists would duplicate it the first time that happened.
 *
 * <p>Renaming one does <b>not</b> rewrite the receipts already issued to it — their
 * consignor_name is what was printed and agreed.
 */
function CustomersTab() {
  const [term, setTerm] = useState('')
  const debounced = useDebounced(term)
  const [showRetired, setShowRetired] = useState(false)
  const [draft, setDraft] = useState({ name: '', mobile: '', address: '', gstin: '' })
  const [editing, setEditing] = useState<Customer | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  // Paged, not a fixed slice. This is a management list rather than a picker: it is where
  // somebody goes to FIND one customer, so the right answer to "there are more than fit" is
  // a pager and the search box above it, not a longer fetch.
  const list = useAsync(
    () =>
      customers.list({
        q: debounced.trim() || undefined,
        active: showRetired ? undefined : true,
        page,
        page_size: pageSize,
        sort: 'name',
      }),
    [debounced, showRetired, page, pageSize],
  )

  return (
    <>
      <AddBox
        label="Add customer"
        onAdd={async () => {
          await customers.create({
            name: draft.name,
            mobile: draft.mobile || undefined,
            address: draft.address || undefined,
            gstin: draft.gstin || undefined,
          })
          setDraft({ name: '', mobile: '', address: '', gstin: '' })
          list.reload()
        }}
      >
        <Field label="Name" name="name">
          <input
            required
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </Field>
        <Field label="Mobile" name="mobile">
          <input
            value={draft.mobile}
            onChange={(e) => setDraft({ ...draft, mobile: e.target.value })}
          />
        </Field>
        <Field label="Address" name="address">
          <input
            value={draft.address}
            onChange={(e) => setDraft({ ...draft, address: e.target.value })}
          />
        </Field>
        <Field label="GSTIN" name="gstin">
          <input
            value={draft.gstin}
            onChange={(e) => setDraft({ ...draft, gstin: e.target.value })}
          />
        </Field>
      </AddBox>

      <div className="filters">
        <input
          type="search"
          value={term}
          placeholder="Search customers"
          onChange={(e) => {
            setTerm(e.target.value)
            // Staying on page 4 of a new result set is how somebody concludes the search is
            // broken.
            setPage(1)
          }}
        />
        <label className="check">
          <input
            type="checkbox"
            checked={showRetired}
            onChange={(e) => {
              setShowRetired(e.target.checked)
              setPage(1)
            }}
          />
          Include retired
        </label>
      </div>

      {list.loading && <Spinner />}
      <FormError error={list.error} />
      {list.data?.items.length === 0 && <Empty>No customers yet.</Empty>}

      {editing && (
        <EditCustomer
          customer={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            list.reload()
          }}
        />
      )}

      <ul className="master-list">
        {(list.data?.items ?? []).map((c) => (
          <MasterRow
            key={c.id}
            name={c.name}
            active={c.active}
            meta={[c.mobile, c.gstin, c.address].filter(Boolean).join(' · ')}
            onRetire={() => customers.retire(c.id).then(list.reload)}
            onRestore={() => customers.restore(c.id).then(list.reload)}
          >
            <button type="button" className="link" onClick={() => setEditing(c)}>
              Edit
            </button>
          </MasterRow>
        ))}
      </ul>

      {list.data && (
        <Pager
          page={list.data}
          onPage={setPage}
          onPageSize={(size) => {
            setPageSize(size)
            setPage(1)
          }}
        />
      )}
    </>
  )
}

function EditCustomer({
  customer,
  onClose,
  onSaved,
}: {
  customer: Customer
  onClose: () => void
  onSaved: () => void
}) {
  const [draft, setDraft] = useState({
    name: customer.name,
    mobile: customer.mobile ?? '',
    address: customer.address ?? '',
    gstin: customer.gstin ?? '',
  })

  return (
    <AddBox
      label="Save"
      onAdd={async () => {
        await customers.update(customer.id, {
          name: draft.name,
          mobile: draft.mobile || undefined,
          address: draft.address || undefined,
          gstin: draft.gstin || undefined,
        })
        onSaved()
      }}
    >
      <Field
        label="Name"
        name="name"
        hint="Receipts already issued keep the name they were printed with."
      >
        <input
          required
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </Field>
      <Field label="Mobile" name="mobile">
        <input
          value={draft.mobile}
          onChange={(e) => setDraft({ ...draft, mobile: e.target.value })}
        />
      </Field>
      <Field label="Address" name="address">
        <input
          value={draft.address}
          onChange={(e) => setDraft({ ...draft, address: e.target.value })}
        />
      </Field>
      <Field label="GSTIN" name="gstin">
        <input
          value={draft.gstin}
          onChange={(e) => setDraft({ ...draft, gstin: e.target.value })}
        />
      </Field>
      <button type="button" className="link" onClick={onClose}>
        Close
      </button>
    </AddBox>
  )
}

// ── goods ───────────────────────────────────────────────────────────────────

function GoodsTab() {
  const [name, setName] = useState('')
  const list = useAsync(() => goodsTypes.list(true), [])

  return (
    <>
      <AddBox
        label="Add goods type"
        onAdd={async () => {
          await goodsTypes.create(name)
          setName('')
          list.reload()
        }}
      >
        <Field
          label="Name"
          name="name"
          hint="A pick list — a receipt may still describe something that is not on it."
        >
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </AddBox>

      {list.loading && <Spinner />}
      <FormError error={list.error} />
      <ul className="master-list">
        {(list.data ?? []).map((g) => (
          <MasterRow
            key={g.id}
            name={g.name}
            active={g.active}
            onRetire={() => goodsTypes.retire(g.id).then(list.reload)}
            onRestore={() => goodsTypes.restore(g.id).then(list.reload)}
          />
        ))}
      </ul>
    </>
  )
}

// ── body types ──────────────────────────────────────────────────────────────

function BodyTypesTab() {
  const [name, setName] = useState('')
  const list = useAsync(() => geo.bodyTypes(true), [])

  return (
    <>
      <AddBox
        label="Add body type"
        onAdd={async () => {
          await geo.createBodyType(name)
          setName('')
          list.reload()
        }}
      >
        <Field
          label="Name"
          name="name"
          hint="Vehicles reference this one for real — a retired type stays on the trucks that have it."
        >
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </AddBox>

      {list.loading && <Spinner />}
      <FormError error={list.error} />
      <ul className="master-list">
        {(list.data ?? []).map((b) => (
          <MasterRow
            key={b.id}
            name={b.name}
            active={b.active}
            onRetire={() => geo.retireBodyType(b.id).then(list.reload)}
            onRestore={() => geo.restoreBodyType(b.id).then(list.reload)}
          />
        ))}
      </ul>
    </>
  )
}

// ── capacities ──────────────────────────────────────────────────────────────

function CapacitiesTab() {
  const [draft, setDraft] = useState({ label: '', tons: '' })
  const list = useAsync(() => geo.capacities(true), [])

  return (
    <>
      <AddBox
        label="Add capacity"
        onAdd={async () => {
          await geo.createCapacity(draft.label, Number(draft.tons))
          setDraft({ label: '', tons: '' })
          list.reload()
        }}
      >
        <Field label="Label" name="label" hint='Exactly what gets stored, e.g. "16 Ton".'>
          <input
            required
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          />
        </Field>
        <Field
          label="Tonnage"
          name="tons"
          hint="Orders the list only. A vehicle's own tonnage is still read from its text."
        >
          <input
            required
            type="number"
            min="0.01"
            step="0.01"
            value={draft.tons}
            onChange={(e) => setDraft({ ...draft, tons: e.target.value })}
          />
        </Field>
      </AddBox>

      {list.loading && <Spinner />}
      <FormError error={list.error} />
      <ul className="master-list">
        {(list.data ?? []).map((c) => (
          <MasterRow
            key={c.id}
            name={c.label}
            meta={Number(c.tons) + ' t'}
            active={c.active}
            onRetire={() => geo.retireCapacity(c.id).then(list.reload)}
            onRestore={() => geo.restoreCapacity(c.id).then(list.reload)}
          />
        ))}
      </ul>
    </>
  )
}

// ── cities ──────────────────────────────────────────────────────────────────

/**
 * Cities, under a state.
 *
 * <p>Scoped to one state rather than listing all 3,285: the list is only ever consulted to
 * check whether one particular place is there, and several states have a Sagar.
 */
function CitiesTab() {
  const states = useAsync(() => geo.states(), [])
  const [stateId, setStateId] = useState<number | null>(null)
  const [name, setName] = useState('')

  const cities = useAsync(
    () => (stateId ? geo.citiesOfState(stateId) : Promise.resolve([])),
    [stateId],
  )

  return (
    <>
      <div className="filters">
        <label>
          State{' '}
          <select
            value={stateId ?? ''}
            onChange={(e) => setStateId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Pick a state</option>
            {(states.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <span className="master-meta">
          States are not editable — there are 36 and a new one is a constitutional event.
        </span>
      </div>

      {stateId && (
        <AddBox
          label="Add city"
          onAdd={async () => {
            await geo.createCity(stateId, name)
            setName('')
            cities.reload()
          }}
        >
          <Field
            label="City"
            name="name"
            hint="The seed has 3,285 places and still misses industrial townships."
          >
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </AddBox>
      )}

      {!stateId && <Empty>Pick a state to see its cities.</Empty>}
      {cities.loading && <Spinner />}
      <FormError error={cities.error} />

      <ul className="master-list">
        {(cities.data ?? []).map((c) => (
          <MasterRow
            key={c.id}
            name={c.name}
            active={c.active}
            onRetire={() => geo.retireCity(c.id).then(cities.reload)}
            onRestore={() => geo.restoreCity(c.id).then(cities.reload)}
          />
        ))}
      </ul>
    </>
  )
}
