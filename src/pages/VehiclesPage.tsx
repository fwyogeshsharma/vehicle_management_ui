import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { fetchAll, ApiError } from '../api/client'
import { companies, geo, intake, users, vehicles } from '../api/resources'
import type { BodyType, Capacity, City, Place, VehicleSummary } from '../api/types'
import { Empty, Field, FormError, Notice, Spinner } from '../components/Form'
import { Pager, SortHeader } from '../components/Pager'
import { PlacesEditor } from '../components/PlacesEditor'
import { PlacesPicker } from '../components/PlacesPicker'
import { DeleteAction, EditAction, RestoreAction } from '../components/RowActions'
import { useAsync, useDebounced } from '../components/useAsync'

/** Only keys the API whitelists: an unknown `sort` is a 422, not a silent fallback. */
const SORTS = ['registration_number', 'capacity_tons', 'created_at', 'id']

/** What the intake worklist hands over when a photo is ticked: the form opens already filled. */
export interface RegisterPrefill {
  intakeId: number
  registration_number: string
  body_type_id: number | null
  capacity: string | null
  driver_name: string
  driver_mobile: string
  driver_alt_mobile: string
  company_mobile: string
  company_name: string
  places: Place[]
}

export function VehiclesPage() {
  const [params, setParams] = useSearchParams()
  const [term, setTerm] = useState(params.get('q') ?? '')
  const debounced = useDebounced(term)
  // Arriving from the intake worklist opens the register form straight away.
  const prefill = (useLocation().state as { register?: RegisterPrefill } | null)?.register
  const [adding, setAdding] = useState(prefill !== undefined)
  const navigate = useNavigate()

  const page = Number(params.get('page') ?? 1)
  const pageSize = Number(params.get('page_size') ?? 25)
  const sort = params.get('sort') ?? 'registration_number'
  const activeParam = params.get('active')
  const companyId = params.get('company_id')
  const ownerUserId = params.get('owner_user_id')
  const bodyTypeId = params.get('body_type_id')
  const minTons = params.get('min_tons')
  const servingCityId = params.get('serving_city_id')
  const owned = params.get('owned')
  const [contactTerm, setContactTerm] = useState(params.get('contact') ?? '')
  const contact = useDebounced(contactTerm)

  function patch(next: Record<string, string | null>) {
    const merged = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === '') merged.delete(k)
      else merged.set(k, v)
    }
    // Any change of filter invalidates the page number -- staying on page 4 of a new result set
    // is how a user concludes the search is broken.
    if (!('page' in next)) merged.delete('page')
    setParams(merged, { replace: true })
  }

  const bodyTypes = useAsync(() => geo.bodyTypes(true), [])
  const capacities = useAsync(() => geo.capacities(false), [])
  const list = useAsync(
    () =>
      vehicles.list({
        q: debounced.trim() || undefined,
        active: activeParam === null ? null : activeParam === 'true',
        contact: contact.trim() || undefined,
        company_id: companyId ? Number(companyId) : null,
        owner_user_id: ownerUserId ? Number(ownerUserId) : null,
        body_type_id: bodyTypeId ? Number(bodyTypeId) : null,
        min_tons: minTons ? Number(minTons) : null,
        serving_city_id: servingCityId ? Number(servingCityId) : null,
        owned: owned ?? null,
        page,
        page_size: pageSize,
        sort,
      }),
    [
      debounced,
      contact,
      activeParam,
      companyId,
      ownerUserId,
      bodyTypeId,
      minTons,
      servingCityId,
      owned,
      page,
      pageSize,
      sort,
    ],
  )

  const byId = new Map((bodyTypes.data ?? []).map((b) => [b.id, b.name]))

  return (
    <div className="stack">
      <header className="page-header">
        <h1>Vehicles</h1>
        <button type="button" className="primary" onClick={() => setAdding(true)}>
          Register a vehicle
        </button>
      </header>

      {adding && (
        <NewVehicleForm
          bodyTypes={(bodyTypes.data ?? []).filter((b) => b.active)}
          capacities={capacities.data ?? []}
          prefill={prefill}
          onClose={() => {
            setAdding(false)
            // Cancelling a form opened from a photo goes back to the worklist it came from.
            if (prefill) navigate('/intake')
          }}
          onCreated={() => {
            setAdding(false)
            list.reload()
          }}
        />
      )}

      <div className="filters card">
        <input
          className="search"
          placeholder="Registration number…"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value)
            patch({ q: e.target.value || null })
          }}
        />
        <input
          className="search"
          placeholder="Driver, owner or number…"
          aria-label="Contact"
          value={contactTerm}
          onChange={(e) => {
            setContactTerm(e.target.value)
            patch({ contact: e.target.value || null })
          }}
        />
        <select
          value={bodyTypeId ?? ''}
          onChange={(e) => patch({ body_type_id: e.target.value || null })}
          aria-label="Body type"
        >
          <option value="">Any body type</option>
          {(bodyTypes.data ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        {/*
          A minimum, not an exact match. Nobody looks for "a truck of exactly 16 tonnes" — they
          have a load and need something that will carry it, so the API filters on >=.
        */}
        <select
          value={minTons ?? ''}
          onChange={(e) => patch({ min_tons: e.target.value || null })}
          aria-label="Capacity"
        >
          <option value="">Any capacity</option>
          {[5, 9, 16, 21, 25, 30, 40].map((t) => (
            <option key={t} value={t}>
              {t} tonnes or more
            </option>
          ))}
        </select>
        <CityFilter
          cityId={servingCityId ? Number(servingCityId) : null}
          onChange={(id) => patch({ serving_city_id: id === null ? null : String(id) })}
        />
        {/*
          The KIND of owner, not a specific one. `company_id` and `owner_user_id` already filter
          to a named company or person and are set from their own pages; this answers the
          different question "show me the owner-drivers", which is most of Indian trucking.
        */}
        <select
          value={owned ?? ''}
          onChange={(e) => patch({ owned: e.target.value || null })}
          aria-label="Owner"
        >
          <option value="">Any owner</option>
          <option value="company">Company-owned</option>
          <option value="person">Owner-driver</option>
        </select>
        {(debounced || contact || bodyTypeId || minTons || servingCityId || owned
          || activeParam) && (
          <button
            type="button"
            className="link"
            onClick={() => {
              setTerm('')
              setContactTerm('')
              setParams(new URLSearchParams(), { replace: true })
            }}
          >
            Clear
          </button>
        )}
      </div>

      {list.error && <Notice kind="error">{list.error.message}</Notice>}
      {list.loading && !list.data && <Spinner />}

      {list.data && (
        <>
          {list.data.items.length === 0 ? (
            <Empty>No vehicle matches. Clear the filters, or register one.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <SortHeader
                    label="Registration"
                    field="registration_number"
                    sort={sort}
                    onSort={(s) => patch({ sort: SORTS.includes(s.replace('-', '')) ? s : null })}
                  />
                  <th>Body type</th>
                  <SortHeader
                    label="Capacity"
                    field="capacity_tons"
                    sort={sort}
                    onSort={(s) => patch({ sort: s })}
                  />
                  <th>Contact</th>
                  <th>Owner</th>
                  {/*
                    The EFFECTIVE locations: a company's truck shows the company's, an
                    owner-driver's shows its own. Replaces the status column, which said the
                    same thing about almost every row -- the interesting ones are retired, and
                    the filter already answers that.
                  */}
                  <th>Runs in</th>
                  <th className="col-actions" />
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((v) => (
                  <VehicleRow
                    key={v.id}
                    vehicle={v}
                    bodyTypeName={byId.get(v.body_type_id)}
                    bodyTypes={(bodyTypes.data ?? []).filter((b) => b.active)}
                    capacities={(capacities.data ?? []).filter((c) => c.active)}
                    onChanged={list.reload}
                  />
                ))}
              </tbody>
            </table>
          )}
          <Pager
            page={list.data}
            onPage={(p) => patch({ page: String(p) })}
            onPageSize={(s) => patch({ page_size: String(s), page: null })}
          />
        </>
      )}
    </div>
  )
}

/**
 * One vehicle, editable where you noticed it needed editing.
 *
 * <p><b>Retiring is not deleting.</b> The API deactivates and keeps the row, because vehicles are
 * referenced by drivers, history and reports — so the icon's tooltip says "Take off the road" and
 * the confirm says what survives. A bin icon with no words would promise something this system
 * never does.
 */
function VehicleRow({
  vehicle,
  bodyTypeName,
  bodyTypes,
  capacities,
  onChanged,
}: {
  vehicle: VehicleSummary
  bodyTypeName?: string
  bodyTypes: BodyType[]
  capacities: Capacity[]
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

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

  if (editing) {
    return (
      <tr>
        <td colSpan={7}>
          <EditVehicleForm
            vehicle={vehicle}
            bodyTypes={bodyTypes}
            capacities={capacities}
            onClose={() => setEditing(false)}
            onSaved={() => {
              setEditing(false)
              onChanged()
            }}
          />
        </td>
      </tr>
    )
  }

  return (
    <>
      <tr className={vehicle.active ? '' : 'row-muted'}>
        <td>
          <Link to={`/vehicles/${vehicle.id}`}>{vehicle.registration_number}</Link>
          {!vehicle.active && <span className="badge"> retired</span>}
        </td>
        <td>{bodyTypeName ?? '—'}</td>
        <td>{vehicle.capacity ?? '—'}</td>
        <td>
          <Contact vehicle={vehicle} />
        </td>
        <td>{vehicle.company_owned ? 'Company' : 'Owner-driver'}</td>
        <td>
          {vehicle.locations ? (
            <>
              {vehicle.locations}
              {vehicle.location_count > 3 && (
                <span className="muted small"> +{vehicle.location_count - 3}</span>
              )}
            </>
          ) : (
            /* Not a blank: a truck serving nowhere matches no city search, which is exactly why
               a dispatcher cannot find it. Saying so is the point of the column. */
            <span className="muted">serves nowhere</span>
          )}
        </td>
        <td className="col-actions">
          <EditAction onClick={() => setEditing(true)} disabled={busy} />
          {vehicle.active ? (
            <DeleteAction
              title="Take off the road"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    `Take ${vehicle.registration_number} off the road? It stays on file with its ` +
                      `drivers and history; it just cannot be dispatched.`,
                  )
                ) {
                  run(() => vehicles.deactivate(vehicle.id))
                }
              }}
            />
          ) : (
            <RestoreAction
              title="Put back on the road"
              disabled={busy}
              onClick={() => run(() => vehicles.restore(vehicle.id))}
            />
          )}
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={7}>
            <Notice kind="error">{error.message}</Notice>
          </td>
        </tr>
      )}
    </>
  )
}

/**
 * Editing a vehicle's own attributes, and where it runs.
 *
 * <p><b>Registration, owner and drivers are not here.</b> That is the API's shape rather than an
 * oversight: changing an owner clears every driver assignment and returns a count of what it
 * removed, and a registration number is the truck's identity. Those belong on the detail page
 * where the consequences can be shown; a list row would make them look like ordinary edits.
 *
 * <p>Locations are here, but a company-owned truck's are <b>read-only</b>: they belong to the
 * company and every one of its trucks inherits them. The API answers a PUT on one with a 409,
 * and offering the control anyway would be inviting it.
 */
function EditVehicleForm({
  vehicle,
  bodyTypes,
  capacities,
  onClose,
  onSaved,
}: {
  vehicle: VehicleSummary
  bodyTypes: BodyType[]
  capacities: Capacity[]
  onClose: () => void
  onSaved: () => void
}) {
  const [bodyTypeId, setBodyTypeId] = useState<number | ''>(vehicle.body_type_id ?? '')
  const [axles, setAxles] = useState(vehicle.no_of_axles?.toString() ?? '')
  const [wheels, setWheels] = useState(vehicle.no_of_wheels?.toString() ?? '')
  const [capacity, setCapacity] = useState(vehicle.capacity ?? '')
  const [lengthFt, setLengthFt] = useState(vehicle.length_ft ?? '')
  const [places, setPlaces] = useState<Place[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  // `GET /vehicles/{id}/locations` returns the EFFECTIVE set — the company's and the vehicle's
  // own, each tagged with its source. Only the vehicle's own are editable here, so the
  // company's are filtered out; editing them belongs on the company, where the change applies
  // to its whole fleet.
  const current = useAsync(() => vehicles.locations(vehicle.id), [vehicle.id])
  const inherited = (current.data ?? []).filter((l) => l.source === 'COMPANY')
  const shown =
    places ??
    (current.data ?? [])
      .filter((l) => l.source === 'VEHICLE')
      .map((l) => ({ state_id: l.state_id, city_id: l.city_id }))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await vehicles.update(vehicle.id, {
        body_type_id: Number(bodyTypeId),
        no_of_axles: axles === '' ? null : Number(axles),
        no_of_wheels: wheels === '' ? null : Number(wheels),
        capacity: capacity.trim() || null,
        length_ft: lengthFt === '' ? null : lengthFt,
      })
      // Only when touched. Replaces this vehicle's OWN rows; the company's are untouched.
      if (places !== null) {
        await vehicles.setLocations(vehicle.id, places)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, String(err)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="inset row-editor" onSubmit={save}>
      <FormError error={error} />
      <p className="muted small">
        Editing <strong>{vehicle.registration_number}</strong>. The registration, the owner and the
        drivers are changed from the vehicle&rsquo;s own page — each has consequences a list row
        cannot show.
      </p>
      <div className="row-editor-fields">
        <Field label="Body type" name="body_type_id" error={error}>
          <select
            value={bodyTypeId}
            onChange={(e) => setBodyTypeId(e.target.value === '' ? '' : Number(e.target.value))}
            required
          >
            {bodyTypes.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Capacity" name="capacity" error={error}>
          <select value={capacity} onChange={(e) => setCapacity(e.target.value)}>
            <option value="">Not recorded</option>
            {/* An imported value that is off the pick list is offered back, never dropped. */}
            {capacity && !capacities.some((c) => c.label === capacity) && (
              <option value={capacity}>{capacity} (as recorded)</option>
            )}
            {capacities.map((c) => (
              <option key={c.id} value={c.label}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Axles" name="no_of_axles" error={error}>
          <input type="number" value={axles} onChange={(e) => setAxles(e.target.value)} />
        </Field>
        <Field label="Wheels" name="no_of_wheels" error={error}>
          <input type="number" value={wheels} onChange={(e) => setWheels(e.target.value)} />
        </Field>
        <Field label="Length (ft)" name="length_ft" error={error}>
          <input
            type="number"
            step="0.1"
            value={lengthFt}
            onChange={(e) => setLengthFt(e.target.value)}
          />
        </Field>
      </div>

      {/*
        Editable for every vehicle now, company-owned included. A truck's own locations are
        ADDITIVE to its company's rather than an alternative: a fleet covering Maharashtra can
        still say that this one runs the Nagpur shuttle, which under the old rule could only be
        expressed by rerouting the whole company.
      */}
      <Field
        label="Runs in"
        name="places"
        error={error}
        hint={
          vehicle.company_owned
            ? "This truck's own route, on top of whatever its company covers."
            : undefined
        }
      >
        {current.loading ? <Spinner /> : <PlacesPicker value={shown} onChange={setPlaces} />}
        {inherited.length > 0 && (
          <p className="muted small">
            Also inherited from the owning company:{' '}
            {inherited.map((l) => l.city_name ?? `${l.state_name} (all)`).join(', ')}. Change
            those on the company — they apply to every truck it owns.
          </p>
        )}
      </Field>

      <div className="read-actions">
        <button type="submit" className="primary" disabled={busy}>
          Save
        </button>
        <button type="button" className="link" disabled={busy} onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  )
}

/**
 * Filter by the city a truck serves.
 *
 * <p>A type-ahead, not a dropdown of every city in India. The API resolves a city to "trucks that
 * serve it OR serve its whole state", so picking Ludhiana finds the ones that named Ludhiana and
 * the ones that said all of Punjab.
 */
function CityFilter({
  cityId,
  onChange,
}: {
  cityId: number | null
  onChange: (id: number | null) => void
}) {
  const [term, setTerm] = useState('')
  const debounced = useDebounced(term)
  const [matches, setMatches] = useState<City[]>([])
  const [chosen, setChosen] = useState<string | null>(null)

  useEffect(() => {
    const q = debounced.trim()
    if (q.length < 2) {
      setMatches([])
      return
    }
    let live = true
    geo
      .searchCities(q, null, 6)
      .then((page) => live && setMatches(page.items))
      .catch(() => live && setMatches([]))
    return () => {
      live = false
    }
  }, [debounced])

  if (cityId && chosen) {
    return (
      <span className="chosen-filter">
        Runs in {chosen}
        <button
          type="button"
          className="chip-remove"
          aria-label="Clear the location filter"
          onClick={() => {
            setChosen(null)
            setTerm('')
            onChange(null)
          }}
        >
          ×
        </button>
      </span>
    )
  }

  return (
    <span className="place-search filter-search">
      <input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Runs in…"
        aria-label="Runs in"
      />
      {matches.length > 0 && (
        <ul className="place-suggestions">
          {matches.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  setChosen(c.name)
                  setMatches([])
                  onChange(c.id)
                }}
              >
                {c.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  )
}

/**
 * Who to ring about this truck.
 *
 * The role label is not decoration: "call the driver" and "call the company switchboard" are
 * different acts, and a bare number does not say which one this is.
 */
function Contact({ vehicle }: { vehicle: VehicleSummary }) {
  if (!vehicle.contact_mobile && !vehicle.contact_name) {
    return <span className="muted">no number on file</span>
  }
  const role =
    vehicle.contact_role === 'DRIVER'
      ? 'driver'
      : vehicle.contact_role === 'OWNER'
        ? 'owner-driver'
        : 'company'
  return (
    <>
      <a className="contact-mobile" href={`tel:${vehicle.contact_mobile ?? ''}`}>
        {vehicle.contact_mobile ?? '—'}
      </a>
      <div className="muted small">
        {vehicle.contact_name} · {role}
      </div>
    </>
  )
}

/**
 * Registering a vehicle.
 *
 * <p>The default is the way it actually happens at a desk: a plate, the driver's name and
 * number, and the company. The API creates whatever is not already on file and wires it
 * together in one transaction, so there is no four-step dance to get wrong and nothing
 * half-created if the plate is rejected.
 *
 * <p>The second mode exists for the case the first cannot express — a truck with no driver yet —
 * and picks from records that already exist.
 */
function NewVehicleForm({
  bodyTypes,
  capacities,
  prefill,
  onClose,
  onCreated,
}: {
  bodyTypes: BodyType[]
  capacities: Capacity[]
  prefill?: RegisterPrefill
  onClose: () => void
  onCreated: () => void
}) {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'intake' | 'existing'>('intake')
  const [error, setError] = useState<ApiError | null>(null)
  const [busy, setBusy] = useState(false)

  const [reg, setReg] = useState(prefill?.registration_number ?? '')
  const [bodyTypeId, setBodyTypeId] = useState<number | ''>(prefill?.body_type_id ?? '')
  const [axles, setAxles] = useState('2')
  const [wheels, setWheels] = useState('6')
  const [capacity, setCapacity] = useState(prefill?.capacity ?? '')
  const [lengthFt, setLengthFt] = useState('')

  // intake mode
  const [driverName, setDriverName] = useState(prefill?.driver_name ?? '')
  const [driverMobile, setDriverMobile] = useState(prefill?.driver_mobile ?? '')
  const [companyName, setCompanyName] = useState(prefill?.company_name ?? '')
  // Only a photo carries these; the manual form never asked for them.
  const [driverAltMobile, setDriverAltMobile] = useState(prefill?.driver_alt_mobile ?? '')
  const [companyMobile, setCompanyMobile] = useState(prefill?.company_mobile ?? '')

  // existing-records mode
  const [ownerKind, setOwnerKind] = useState<'company' | 'user'>('company')
  const [companyId, setCompanyId] = useState<number | ''>('')
  const [ownerUserId, setOwnerUserId] = useState<number | ''>('')
  const [ownerAlsoDrives, setOwnerAlsoDrives] = useState(true)

  const [places, setPlaces] = useState<Place[]>(prefill?.places ?? [])

  // Complete lists, not the first page of them: an owner missing from the picker cannot be
  // chosen, and the form gives no hint that they were left out.
  const companyList = useAsync(
    () => fetchAll((page, page_size) => companies.list({ active: true, page, page_size })), [])
  const ownerList = useAsync(
    () => (mode === 'existing'
      ? fetchAll((page, page_size) => users.list({ active: true, page, page_size }))
      : Promise.resolve(null)),
    [mode],
  )

  const dimensions = {
    no_of_axles: axles === '' ? null : Number(axles),
    no_of_wheels: wheels === '' ? null : Number(wheels),
    capacity: capacity || null,
    length_ft: lengthFt === '' ? null : lengthFt,
  }

  // Where the locations will actually land. A company's truck may not hold its own -- the API
  // refuses them outright rather than dropping them -- so on this form they become the
  // company's, and in the other mode they are simply not offered for a company.
  const namedCompany = companyName.trim()
  const routeBelongsToCompany = mode === 'intake' ? namedCompany !== '' : ownerKind === 'company'
  const existingCompany = (companyList.data?.items ?? []).find(
    (c) => c.name.toLowerCase() === namedCompany.toLowerCase(),
  )

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      // From a photo, completing goes through the intake so the row leaves the worklist; the
      // server creates the vehicle by the same path as the manual form.
      if (prefill && mode === 'intake') {
        const done = await intake.complete(prefill.intakeId, {
          registration_number: reg,
          body_type_id: Number(bodyTypeId),
          driver_name: driverName,
          driver_mobile: driverMobile,
          driver_alt_mobile: driverAltMobile.trim() || null,
          company_name: companyName.trim() || null,
          company_mobile: companyMobile.trim() || null,
          places,
          ...dimensions,
        })
        onCreated()
        navigate(done.vehicle_id ? `/vehicles/${done.vehicle_id}` : '/intake')
        return
      }
      const created =
        mode === 'intake'
          ? await vehicles.intake({
              registration_number: reg,
              body_type_id: Number(bodyTypeId),
              driver_name: driverName,
              driver_mobile: driverMobile,
              company_name: companyName.trim() || null,
              places,
              ...dimensions,
            })
          : await vehicles.create({
              registration_number: reg,
              body_type_id: Number(bodyTypeId),
              owner_company_id: ownerKind === 'company' ? Number(companyId) : null,
              owner_user_id: ownerKind === 'user' ? Number(ownerUserId) : null,
              owner_also_drives: ownerKind === 'user' && ownerAlsoDrives,
              ...dimensions,
            })
      onCreated()
      navigate(`/vehicles/${created.id}`)
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Register a vehicle</h2>
      <FormError error={error} />

      <div className="grid-2">
        <Field
          label="Registration number"
          name="registration_number"
          error={error}
          hint="Stored canonically — MH12AB1234."
        >
          <input value={reg} onChange={(e) => setReg(e.target.value)} required autoFocus />
        </Field>

        <Field label="Body type" name="body_type_id" error={error}>
          <select
            value={bodyTypeId}
            onChange={(e) => setBodyTypeId(e.target.value === '' ? '' : Number(e.target.value))}
            required
          >
            <option value="">Choose…</option>
            {bodyTypes.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {mode === 'intake' ? (
        <fieldset>
          <legend>Driver and company</legend>
          <div className="grid-2">
            <Field label="Driver's name" name="driver_name" error={error}>
              <input
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                required
              />
            </Field>
            <Field
              label="Driver's mobile"
              name="driver_mobile"
              error={error}
              hint="Ten digits. This is how an existing driver is recognised."
            >
              <input
                value={driverMobile}
                onChange={(e) => setDriverMobile(e.target.value)}
                required
              />
            </Field>
          </div>

          {prefill && (
            <div className="grid-2">
              <Field
                label="Driver's other number"
                name="driver_alt_mobile"
                error={error}
                hint="Optional. Another way to reach the same driver."
              >
                <input
                  value={driverAltMobile}
                  onChange={(e) => setDriverAltMobile(e.target.value)}
                />
              </Field>
              <Field
                label="Company's number"
                name="company_mobile"
                error={error}
                hint="Optional. The transport office, not the driver."
              >
                <input value={companyMobile} onChange={(e) => setCompanyMobile(e.target.value)} />
              </Field>
            </div>
          )}

          <Field
            label="Company"
            name="company_name"
            error={error}
            hint="Leave blank if the driver owns the truck — the owner-operator."
          >
            {/* A datalist rather than a select: the point is to be able to type a company that
                does not exist yet, while still making an existing one easy to hit exactly. */}
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              list="known-companies"
              placeholder="Kumar Roadways — or leave blank"
            />
          </Field>
          <datalist id="known-companies">
            {(companyList.data?.items ?? []).map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </fieldset>
      ) : (
        <fieldset className="owner-choice">
          <legend>Owner</legend>
          <p className="muted small">
            A vehicle has exactly one owner — a company or a user, never both and never neither.
          </p>
          <label className="radio">
            <input
              type="radio"
              checked={ownerKind === 'company'}
              onChange={() => setOwnerKind('company')}
            />
            A company
          </label>
          <label className="radio">
            <input
              type="radio"
              checked={ownerKind === 'user'}
              onChange={() => setOwnerKind('user')}
            />
            A user (owner-driver)
          </label>

          {ownerKind === 'company' ? (
            <Field label="Which company" name="owner" error={error}>
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
              <Field label="Which user" name="owner" error={error}>
                <select
                  value={ownerUserId}
                  onChange={(e) =>
                    setOwnerUserId(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  required
                >
                  <option value="">Choose…</option>
                  {(ownerList.data?.items ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.mobile})
                    </option>
                  ))}
                </select>
              </Field>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={ownerAlsoDrives}
                  onChange={(e) => setOwnerAlsoDrives(e.target.checked)}
                />
                They drive it themselves
              </label>
            </>
          )}
        </fieldset>
      )}

      <fieldset>
        <legend>Where it runs</legend>
        {routeBelongsToCompany ? (
          <>
            <p className="muted small">
              {mode === 'intake' && namedCompany
                ? `A company's truck runs where the company runs, so these become ${namedCompany}'s locations — shared by every truck it owns.`
                : "A company's truck runs where the company runs, so it cannot have locations of its own. Set them on the company."}
            </p>
            {mode === 'intake' && existingCompany && (
              <Notice kind="warn">
                {existingCompany.name} is already on file. Anything set here{' '}
                <strong>replaces its current locations</strong>, for every truck it owns. Leave
                this empty to keep them as they are.
              </Notice>
            )}
            {mode === 'intake' ? (
              <PlacesEditor value={places} onChange={setPlaces} disabled={busy} />
            ) : (
              <p className="muted small">
                Register it first, then set them on the company's page.
              </p>
            )}
          </>
        ) : (
          <>
            <PlacesEditor value={places} onChange={setPlaces} disabled={busy} />
          </>
        )}
      </fieldset>

      <div className="grid-4">
        <Field label="Axles" name="no_of_axles" error={error}>
          <input type="number" min={1} value={axles} onChange={(e) => setAxles(e.target.value)} />
        </Field>
        <Field label="Wheels" name="no_of_wheels" error={error}>
          <input
            type="number"
            min={2}
            step={2}
            value={wheels}
            onChange={(e) => setWheels(e.target.value)}
          />
        </Field>
        <Field label="Capacity" name="capacity" error={error}>
          <select value={capacity} onChange={(e) => setCapacity(e.target.value)} required>
            <option value="">Choose…</option>
            {capacity && !capacities.some((c) => c.label === capacity) && (
              <option value={capacity}>{capacity} (as recorded)</option>
            )}
            {capacities.map((c) => (
              <option key={c.id} value={c.label}>
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

      <div className="actions">
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="link" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="link"
          onClick={() => {
            setMode(mode === 'intake' ? 'existing' : 'intake')
            setError(null)
          }}
        >
          {mode === 'intake'
            ? 'Pick an existing owner instead (for a truck with no driver yet)'
            : 'Type the driver and company instead'}
        </button>
      </div>
    </form>
  )
}
