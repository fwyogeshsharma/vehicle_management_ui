import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchAll, ApiError } from '../api/client'
import { companies, geo, users, vehicles } from '../api/resources'
import type { Place, VehicleDetail } from '../api/types'
import { Empty, Field, FormError, Notice, Spinner } from '../components/Form'
import { plateOf } from '../components/plate'
import { PlacesEditor, placeLabel } from '../components/PlacesEditor'
import { useAsync } from '../components/useAsync'
import { SAVED_CAPACITY, useCapacityPick } from '../components/useCapacityPick'
import { useMasters } from '../components/useMasters'

export function VehicleDetailPage() {
  const id = Number(useParams().id)
  const vehicle = useAsync(() => vehicles.get(id), [id])
  const bodyTypes = useAsync(() => geo.bodyTypes(true), [])

  if (vehicle.loading && !vehicle.data) return <Spinner />
  if (vehicle.error) return <Notice kind="error">{vehicle.error.message}</Notice>
  if (!vehicle.data) return null

  const v = vehicle.data
  const bodyType = (bodyTypes.data ?? []).find((b) => b.id === v.body_type_id)

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>{plateOf(v)}</h1>
          <p className="muted">
            {bodyType?.name ?? '—'} · {v.capacity ?? 'capacity unknown'} ·{' '}
            {v.company_owned ? 'owned by a company' : 'owned by an individual'}
            {!v.active && ' · retired'}
          </p>
        </div>
        <RetireButton vehicle={v} onDone={vehicle.reload} />
      </header>

      <div className="columns">
        <div className="stack">
          <OwnerCard vehicle={v} onChanged={vehicle.reload} />
          <DriversCard vehicle={v} />
        </div>
        <div className="stack">
          <LocationsCard vehicle={v} />
          <AttributesCard vehicle={v} onSaved={vehicle.reload} />
        </div>
      </div>
    </div>
  )
}

function RetireButton({ vehicle, onDone }: { vehicle: VehicleDetail; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    try {
      if (vehicle.active) await vehicles.deactivate(vehicle.id)
      else await vehicles.restore(vehicle.id)
      onDone()
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {/* "Retire", not "Delete": the API deactivates and keeps the row, and a button that says
          Delete would be promising something it does not do. */}
      <button type="button" onClick={run} disabled={busy}>
        {vehicle.active ? 'Take off the road' : 'Put back on the road'}
      </button>
      {error && <Notice kind="error">{error.message}</Notice>}
    </div>
  )
}

/**
 * Ownership, and selling.
 *
 * The confirmation says what the sale will actually do before it happens, and the result says
 * what it did. Both matter: a transfer clears every driver assignment and, when a company takes
 * over, the vehicle's own preferred locations. Finding that out afterwards is how a dispatcher
 * concludes the system lost their data.
 */
function OwnerCard({ vehicle, onChanged }: { vehicle: VehicleDetail; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [kind, setKind] = useState<'company' | 'user'>(vehicle.company_owned ? 'company' : 'user')
  const [companyId, setCompanyId] = useState<number | ''>(vehicle.owner_company_id ?? '')
  const [userId, setUserId] = useState<number | ''>(vehicle.owner_user_id ?? '')
  const [alsoDrives, setAlsoDrives] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const companyList = useAsync(
    () => fetchAll((page, page_size) => companies.list({ active: true, page, page_size })), [])
  const userList = useAsync(
    () => fetchAll((page, page_size) => users.list({ active: true, page, page_size })), [])
  const drivers = useAsync(() => vehicles.drivers(vehicle.id), [vehicle.id, vehicle.updated_at])

  const ownerName = vehicle.company_owned
    ? companyList.data?.items.find((c) => c.id === vehicle.owner_company_id)?.name
    : userList.data?.items.find((u) => u.id === vehicle.owner_user_id)?.name

  const driverCount = drivers.data?.length ?? 0

  async function sell(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const changed = await vehicles.setOwner(vehicle.id, {
        company_id: kind === 'company' ? Number(companyId) : null,
        user_id: kind === 'user' ? Number(userId) : null,
        owner_also_drives: kind === 'user' && alsoDrives,
      })
      setResult(
        changed.removed_drivers === 0
          ? 'Owner changed. There were no driver assignments to clear.'
          : `Owner changed. ${changed.removed_drivers} driver assignment${
              changed.removed_drivers === 1 ? '' : 's'
            } removed with the previous owner.`,
      )
      setEditing(false)
      onChanged()
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h2>Owner</h2>
      {result && <Notice kind="ok">{result}</Notice>}

      {!editing ? (
        <>
          <p className="big">
            {ownerName ?? (vehicle.company_owned ? 'A company' : 'A user')}{' '}
            <span className="badge">{vehicle.company_owned ? 'Company' : 'Owner-driver'}</span>
          </p>
          <button type="button" onClick={() => setEditing(true)}>
            Change owner
          </button>
        </>
      ) : (
        <form onSubmit={sell}>
          <FormError error={error} />

          <Notice kind="warn">
            <strong>Changing the owner clears the cab list.</strong>{' '}
            {driverCount > 0
              ? `${driverCount} driver assignment${driverCount === 1 ? '' : 's'} will be removed`
              : 'There are no drivers to remove'}
            , because a truck sold by one owner must not keep listing the previous owner's
            drivers.
            {!vehicle.company_owned && ' Its own preferred locations go too if a company takes it.'}
          </Notice>

          <label className="radio">
            <input type="radio" checked={kind === 'company'} onChange={() => setKind('company')} />
            Sell to a company
          </label>
          <label className="radio">
            <input type="radio" checked={kind === 'user'} onChange={() => setKind('user')} />
            Sell to a user
          </label>

          {kind === 'company' ? (
            <Field label="Company" name="owner" error={error}>
              <select
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value === '' ? '' : Number(e.target.value))}
                required
              >
                <option value="">Choose…</option>
                {(companyList.data?.items ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <>
              <Field label="User" name="owner" error={error}>
                <select
                  value={userId}
                  onChange={(e) => setUserId(e.target.value === '' ? '' : Number(e.target.value))}
                  required
                >
                  <option value="">Choose…</option>
                  {(userList.data?.items ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.mobile})
                    </option>
                  ))}
                </select>
              </Field>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={alsoDrives}
                  onChange={(e) => setAlsoDrives(e.target.checked)}
                />
                They drive it themselves
              </label>
            </>
          )}

          <div className="actions">
            <button type="submit" className="primary" disabled={busy}>
              {busy ? 'Transferring…' : 'Confirm transfer'}
            </button>
            <button type="button" className="link" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

/**
 * Who drives this.
 *
 * **For a company's truck the picker lists only that company's own users.** The API refuses
 * anyone else with a 409, so offering the whole directory would be offering a choice that cannot
 * work — and the reason ("they are not on this company's books") reads like a bug to whoever
 * hits it. Better to show the short list and say why it is short.
 */
function DriversCard({ vehicle }: { vehicle: VehicleDetail }) {
  // Re-read when the vehicle changes, not only when the page opens: a sale clears every driver
  // assignment server-side, and without updated_at here the card kept showing the old driver.
  const drivers = useAsync(() => vehicles.drivers(vehicle.id), [vehicle.id, vehicle.updated_at])
  const [error, setError] = useState<ApiError | null>(null)
  const [busy, setBusy] = useState(false)
  const [pick, setPick] = useState<number | ''>('')

  const candidates = useAsync(
    () =>
      vehicle.company_owned && vehicle.owner_company_id
        ? companies
            .members(vehicle.owner_company_id)
            .then((m) => m.map((x) => ({ id: x.user_id, name: x.name ?? '—', mobile: x.mobile })))
        : fetchAll((page, page_size) => users.list({ active: true, page, page_size }))
            .then((p) => p.items.map((u) => ({ id: u.id, name: u.name, mobile: u.mobile }))),
    [vehicle.company_owned, vehicle.owner_company_id],
  )

  const alreadyDriving = new Set((drivers.data ?? []).map((d) => d.user_id))
  const available = (candidates.data ?? []).filter((c) => !alreadyDriving.has(c.id))

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      drivers.reload()
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h2>Drivers</h2>
      {error && <Notice kind="error">{error.message}</Notice>}

      {drivers.loading && !drivers.data && <Spinner />}
      {drivers.data?.length === 0 && <Empty>Nobody is assigned to this vehicle.</Empty>}

      {drivers.data && drivers.data.length > 0 && (
        <table className="table">
          <tbody>
            {drivers.data.map((d) => (
              <tr key={d.user_id}>
                <td>
                  <Link to={`/drivers/${d.user_id}`}>{d.name}</Link>
                  <div className="muted small">{d.mobile}</div>
                </td>
                <td>{d.primary && <span className="badge badge-ok">Primary</span>}</td>
                <td className="right">
                  {!d.primary && (
                    <button
                      type="button"
                      className="link"
                      disabled={busy}
                      onClick={() => run(() => vehicles.setPrimaryDriver(vehicle.id, d.user_id))}
                    >
                      Make primary
                    </button>
                  )}
                  <button
                    type="button"
                    className="link danger"
                    disabled={busy}
                    onClick={() => run(() => vehicles.removeDriver(vehicle.id, d.user_id))}
                  >
                    Unassign
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="inline-form">
        <select value={pick} onChange={(e) => setPick(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">Assign someone…</option>
          {available.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.mobile ? `(${c.mobile})` : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || pick === ''}
          onClick={() =>
            run(async () => {
              await vehicles.addDriver(vehicle.id, Number(pick), (drivers.data ?? []).length === 0)
              setPick('')
            })
          }
        >
          Assign
        </button>
      </div>

      {vehicle.company_owned ? (
        <p className="muted small">
          This is a company's vehicle, so only users on that company's books may drive it. To
          widen this list, put the user on the company first — from{' '}
          <Link to={`/companies/${vehicle.owner_company_id}`}>the company's page</Link> or their
          own.
        </p>
      ) : (
        <p className="muted small">
          This vehicle belongs to an individual, so there is no payroll to be on: the owner may
          hand the keys to anyone.
        </p>
      )}
      {available.length === 0 && candidates.data && (
        <Notice kind="warn">
          {vehicle.company_owned
            ? 'Nobody is left on this company’s books to assign. Add someone to the company first.'
            : 'Everyone on file is already assigned to this vehicle.'}
        </Notice>
      )}
    </section>
  )
}

/**
 * Where it runs.
 *
 * A company-owned vehicle inherits its company's locations and **may not have any of its own** —
 * the API refuses with a 409. So the editor is replaced with a read-only view and a link to the
 * place the change actually belongs, rather than a form that is guaranteed to fail.
 */
function LocationsCard({ vehicle }: { vehicle: VehicleDetail }) {
  const effective = useAsync(() => vehicles.locations(vehicle.id), [vehicle.id, vehicle.updated_at])
  const [draft, setDraft] = useState<Place[] | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!draft) return
    setBusy(true)
    setError(null)
    try {
      await vehicles.setLocations(vehicle.id, draft)
      setDraft(null)
      effective.reload()
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h2>Where it runs</h2>
      {error && <Notice kind="error">{error.message}</Notice>}
      {effective.loading && !effective.data && <Spinner />}

      {effective.data && effective.data.length === 0 && (
        <Empty>
          <strong>Serves nowhere.</strong>{' '}
          {vehicle.company_owned
            ? 'Its company has no locations, and a company vehicle does not fall back to preferences of its own.'
            : 'Give it a preferred location to make it findable.'}
        </Empty>
      )}

      {effective.data && effective.data.length > 0 && (
        <ul className="chips">
          {effective.data.map((l, i) => (
            <li key={i} className="chip">
              {placeLabel(l.state_name, l.city_name)}
              <span className="chip-tag">{l.source === 'COMPANY' ? 'from the company' : 'its own'}</span>
            </li>
          ))}
        </ul>
      )}

      {vehicle.company_owned ? (
        <p className="muted small">
          A company's vehicle runs where the company runs, so it cannot have locations of its own.
          Change them on <Link to={`/companies/${vehicle.owner_company_id}`}>the company</Link>.
        </p>
      ) : draft === null ? (
        <button
          type="button"
          onClick={() =>
            setDraft(
              (effective.data ?? []).map((l) => ({ state_id: l.state_id, city_id: l.city_id })),
            )
          }
        >
          Edit locations
        </button>
      ) : (
        <>
          <PlacesEditor value={draft} onChange={setDraft} disabled={busy} />
          <div className="actions">
            <button type="button" className="primary" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save locations'}
            </button>
            <button type="button" className="link" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </>
      )}
    </section>
  )
}

function AttributesCard({ vehicle, onSaved }: { vehicle: VehicleDetail; onSaved: () => void }) {
  const masters = useMasters()
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [busy, setBusy] = useState(false)

  const [reg, setReg] = useState(vehicle.registration_number ?? '')
  const [bodyTypeId, setBodyTypeId] = useState<number | ''>(vehicle.body_type_id ?? '')
  const [axles, setAxles] = useState(String(vehicle.no_of_axles ?? ''))
  const [wheels, setWheels] = useState(String(vehicle.no_of_wheels ?? ''))
  const capacity = useCapacityPick(vehicle.capacity, masters.capacities)
  const [lengthFt, setLengthFt] = useState(String(vehicle.length_ft ?? ''))
  const [notes, setNotes] = useState(vehicle.notes ?? '')

  // The contacts the intake form carries. They are not the vehicle's own columns: the driver is a
  // user and the company is a company, each with its own record, so editing them here writes to
  // those records. The primary driver stands in for "the driver" — the same one the contact line
  // on the vehicle list rings.
  const drivers = useAsync(() => vehicles.drivers(vehicle.id), [vehicle.id, vehicle.updated_at])
  const primary = (drivers.data ?? []).find((d) => d.primary) ?? (drivers.data ?? [])[0]
  const driver = useAsync(
    () => (primary ? users.get(primary.user_id) : Promise.resolve(null)),
    [primary?.user_id],
  )
  const company = useAsync(
    () => (vehicle.owner_company_id ? companies.get(vehicle.owner_company_id) : Promise.resolve(null)),
    [vehicle.owner_company_id],
  )
  const [driverName, setDriverName] = useState('')
  const [driverMobile, setDriverMobile] = useState('')
  const [driverAlt, setDriverAlt] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [companyMobile, setCompanyMobile] = useState('')
  useEffect(() => {
    setDriverName(driver.data?.name ?? '')
    setDriverMobile(driver.data?.mobile ?? '')
    setDriverAlt(driver.data?.alt_mobile ?? '')
  }, [driver.data])
  useEffect(() => {
    setCompanyName(company.data?.name ?? '')
    setCompanyMobile(company.data?.mobile ?? '')
  }, [company.data])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await vehicles.update(vehicle.id, {
        // Blank keeps the current plate; the API never clears one.
        registration_number: reg.trim() || null,
        body_type_id: bodyTypeId === '' ? null : bodyTypeId,
        no_of_axles: axles === '' ? null : Number(axles),
        no_of_wheels: wheels === '' ? null : Number(wheels),
        ...capacity.body,
        length_ft: lengthFt === '' ? null : lengthFt,
        notes: notes || null,
      })
      // Only the records that actually changed are written, and each PUT carries the fields
      // this form does not show unchanged — a PUT that omitted them would blank them.
      const d = driver.data
      if (
        d &&
        (driverName !== d.name || driverMobile !== d.mobile || driverAlt !== (d.alt_mobile ?? ''))
      ) {
        await users.update(d.id, {
          name: driverName,
          mobile: driverMobile,
          alt_mobile: driverAlt || null,
          email: d.email,
          city_id: d.city_id,
          notes: d.notes,
        })
      }
      const c = company.data
      if (c && (companyName !== c.name || companyMobile !== (c.mobile ?? ''))) {
        await companies.update(c.id, {
          name: companyName,
          mobile: companyMobile || null,
          email: c.email,
          gstin: c.gstin,
          address: c.address,
          head_office_city_id: c.head_office_city_id,
        })
      }
      setEditing(false)
      onSaved()
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, String(e)))
    } finally {
      setBusy(false)
    }
  }

  if (!editing) {
    return (
      <section className="card">
        <h2>Details</h2>
        <dl className="pairs">
          <dt>Axles</dt>
          <dd>{vehicle.no_of_axles ?? '—'}</dd>
          <dt>Wheels</dt>
          <dd>{vehicle.no_of_wheels ?? '—'}</dd>
          <dt>Capacity</dt>
          <dd>
            {vehicle.capacity ?? '—'}
            {vehicle.capacity_tons && (
              <span className="muted small"> ({vehicle.capacity_tons} t, derived)</span>
            )}
          </dd>
          <dt>Length</dt>
          <dd>{vehicle.length_ft ? `${vehicle.length_ft} ft` : '—'}</dd>
          <dt>Notes</dt>
          <dd>{vehicle.notes ?? '—'}</dd>
          <dt>Added by</dt>
          <dd>
            {vehicle.added_by_name ?? '—'}
            <span className="muted small"> on {new Date(vehicle.created_at).toLocaleDateString()}</span>
          </dd>
        </dl>
        <button type="button" onClick={() => setEditing(true)}>
          Edit details
        </button>
      </section>
    )
  }

  return (
    <form className="card" onSubmit={save}>
      <h2>Details</h2>
      <FormError error={error} />
      <Field
        label="Registration number"
        name="registration_number"
        error={error}
        hint="Add the plate here once it is known. Stored canonically — MH12AB1234."
      >
        <input
          value={reg}
          onChange={(e) => setReg(e.target.value)}
          placeholder="Not known yet"
        />
      </Field>
      <Field label="Body type" name="body_type_id" error={error}>
        <select
          value={bodyTypeId}
          onChange={(e) => setBodyTypeId(e.target.value === '' ? '' : Number(e.target.value))}
        >
          <option value="">Not known yet</option>
          {/* A body type retired since this truck was registered is kept selectable. */}
          {bodyTypeId !== '' && !masters.bodyTypes.some((b) => b.id === bodyTypeId) && (
            <option value={bodyTypeId}>Current type (retired)</option>
          )}
          {masters.bodyTypes.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid-2">
        <Field label="Axles" name="no_of_axles" error={error}>
          <input type="number" value={axles} onChange={(e) => setAxles(e.target.value)} />
        </Field>
        <Field label="Wheels" name="no_of_wheels" error={error}>
          <input type="number" step={2} value={wheels} onChange={(e) => setWheels(e.target.value)} />
        </Field>
      </div>
      <div className="grid-2">
        <Field
          label="Capacity"
          name="capacity_id"
          error={error}
          hint="The tonnage used for sorting is derived from it by the server."
        >
          <select value={capacity.value} onChange={(e) => capacity.onChange(e.target.value)}>
            <option value="">Not known</option>
            {capacity.offList && (
              <option value={SAVED_CAPACITY}>{capacity.offList} (not on the list)</option>
            )}
            {masters.capacities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Length (ft)" name="length_ft" error={error}>
          <input
            type="number"
            step="0.5"
            value={lengthFt}
            onChange={(e) => setLengthFt(e.target.value)}
          />
        </Field>
      </div>
      {driver.data && (
        <fieldset>
          <legend>Driver</legend>
          <div className="grid-2">
            <Field label="Driver's name" name="name" error={error}>
              <input value={driverName} onChange={(e) => setDriverName(e.target.value)} required />
            </Field>
            <Field label="Driver's mobile" name="mobile" error={error}>
              <input
                value={driverMobile}
                onChange={(e) => setDriverMobile(e.target.value)}
                required
              />
            </Field>
          </div>
          <Field label="Driver's other number" name="alt_mobile" error={error} hint="Optional.">
            <input value={driverAlt} onChange={(e) => setDriverAlt(e.target.value)} />
          </Field>
        </fieldset>
      )}
      {company.data && (
        <fieldset>
          <legend>Company</legend>
          <div className="grid-2">
            <Field label="Company name" name="name" error={error}>
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
            </Field>
            <Field label="Company's number" name="mobile" error={error} hint="Optional.">
              <input value={companyMobile} onChange={(e) => setCompanyMobile(e.target.value)} />
            </Field>
          </div>
        </fieldset>
      )}
      <Field label="Notes" name="notes" error={error}>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </Field>
      <div className="actions">
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="link" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </form>
  )
}
