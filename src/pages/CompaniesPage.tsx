import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { companies } from '../api/resources'
import type { CompanySummary, Place } from '../api/types'
import { Empty, Field, FormError, Notice, Spinner } from '../components/Form'
import { Pager, SortHeader } from '../components/Pager'
import { PlacesPicker } from '../components/PlacesPicker'
import { PlacesEditor } from '../components/PlacesEditor'
import { DeleteAction, EditAction, RestoreAction } from '../components/RowActions'
import { useAsync, useDebounced } from '../components/useAsync'

export function CompaniesPage() {
  const [params, setParams] = useSearchParams()
  const [term, setTerm] = useState(params.get('q') ?? '')
  const debounced = useDebounced(term)
  const [adding, setAdding] = useState(false)

  const page = Number(params.get('page') ?? 1)
  const pageSize = Number(params.get('page_size') ?? 25)
  const sort = params.get('sort') ?? 'name'
  const activeParam = params.get('active')

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
      companies.list({
        q: debounced.trim() || undefined,
        active: activeParam === null ? null : activeParam === 'true',
        page,
        page_size: pageSize,
        sort,
      }),
    [debounced, activeParam, page, pageSize, sort],
  )

  return (
    <div className="stack">
      <header className="page-header">
        <h1>Companies</h1>
        <button type="button" className="primary" onClick={() => setAdding(true)}>
          Add a company
        </button>
      </header>

      {adding && <NewCompanyForm onClose={() => setAdding(false)} />}

      <div className="filters card">
        <input
          className="search"
          placeholder="Name or GSTIN…"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value)
            patch({ q: e.target.value || null })
          }}
        />
        <select
          value={activeParam ?? ''}
          onChange={(e) => patch({ active: e.target.value || null })}
        >
          <option value="">Active and retired</option>
          <option value="true">Active</option>
          <option value="false">Retired</option>
        </select>
      </div>

      {list.error && <Notice kind="error">{list.error.message}</Notice>}
      {list.loading && !list.data && <Spinner />}

      {list.data && (
        <>
          {list.data.items.length === 0 ? (
            <Empty>No company matches.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <SortHeader label="Name" field="name" sort={sort} onSort={(s) => patch({ sort: s })} />
                  <th>Mobile</th>
                  <th>GSTIN</th>
                  {/*
                    A company's locations are what EVERY truck it owns inherits, so this is its
                    operating area and not a detail — an empty one means none of its vehicles
                    match any city search.
                  */}
                  <th>Operates in</th>
                  <th>Status</th>
                  <th className="col-actions" />
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((c) => (
                  <CompanyRow key={c.id} company={c} onChanged={list.reload} />
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
 * One company, and the two things you can do to it without leaving the list.
 *
 * <p>Editing happens in place rather than on the detail page because the fields worth correcting
 * from a list — a mistyped name, a missing number — are the ones you notice while scanning it.
 * The locations are edited here too: they belong to the company and every truck it owns inherits
 * them, so "where does this firm operate" is a property of this row and not of any vehicle.
 */
function CompanyRow({ company, onChanged }: { company: CompanySummary; onChanged: () => void }) {
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
        <td colSpan={6}>
          <EditCompanyForm
            company={company}
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
      <tr className={company.active ? '' : 'row-muted'}>
        <td>
          <Link to={`/companies/${company.id}`}>{company.name}</Link>
        </td>
        <td>{company.mobile ?? '—'}</td>
        <td>{company.gstin ?? '—'}</td>
        <td>
          {company.locations ? (
            <>
              {company.locations}
              {company.location_count > 3 && (
                <span className="muted small"> +{company.location_count - 3}</span>
              )}
            </>
          ) : (
            /* Not a blank: "nowhere" has consequences for every truck this company owns. */
            <span className="muted">serves nowhere</span>
          )}
        </td>
        <td>
          {company.active ? (
            <span className="badge badge-ok">Active</span>
          ) : (
            <span className="badge">Retired</span>
          )}
        </td>
        <td className="col-actions">
          <EditAction onClick={() => setEditing(true)} disabled={busy} />
          {company.active ? (
            <DeleteAction
              title="Retire this company"
              disabled={busy}
              onClick={() => {
                // The API deactivates and keeps the row — its vehicles and history still refer
                // to it — so the confirm says what will actually happen.
                if (
                  window.confirm(
                    `Retire ${company.name}? It stays on file and its vehicles keep pointing at ` +
                      `it, but it cannot be chosen for anything new.`,
                  )
                ) {
                  run(() => companies.deactivate(company.id))
                }
              }}
            />
          ) : (
            <RestoreAction
              title="Put this company back in service"
              disabled={busy}
              onClick={() => run(() => companies.restore(company.id))}
            />
          )}
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={6}>
            <Notice kind="error">{error.message}</Notice>
          </td>
        </tr>
      )}
    </>
  )
}

/**
 * Editing a company in place.
 *
 * <p>Two endpoints, deliberately: {@code PUT /companies/{id}} for the attributes and
 * {@code PUT /companies/{id}/locations} for where it operates. They are separate on the server
 * because replacing a company's locations replaces them for <b>every truck it owns</b>, and a
 * form that folded them into one request would make that a side effect of editing a phone
 * number. Here they are saved together only when the locations were actually touched.
 */
function EditCompanyForm({
  company,
  onClose,
  onSaved,
}: {
  company: CompanySummary
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(company.name)
  const [mobile, setMobile] = useState(company.mobile ?? '')
  const [gstin, setGstin] = useState(company.gstin ?? '')
  const [places, setPlaces] = useState<Place[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  // The list carries a summary string, not the rows, so the real set is fetched when the form
  // opens. Until it arrives `places` is null, which is what tells save() not to touch them.
  const current = useAsync(() => companies.locations(company.id), [company.id])
  const loaded = current.data
  const shown =
    places ?? (loaded ? loaded.map((l) => ({ state_id: l.state_id, city_id: l.city_id })) : [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await companies.update(company.id, {
        name,
        mobile: mobile.trim() || null,
        gstin: gstin.trim() || null,
      })
      // Only when edited. Sending the fetched set back unchanged would still be a replace, and
      // a replace on a company is a change to every vehicle that inherits from it.
      if (places !== null) {
        await companies.setLocations(company.id, places)
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
      <div className="row-editor-fields">
        <Field label="Name" name="name" error={error}>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Mobile" name="mobile" error={error}>
          <input value={mobile} onChange={(e) => setMobile(e.target.value)} />
        </Field>
        <Field label="GSTIN" name="gstin" error={error}>
          <input value={gstin} onChange={(e) => setGstin(e.target.value)} />
        </Field>
      </div>
      <Field
        label="Operates in"
        name="places"
        error={error}
        hint="Every truck this company owns inherits these. An empty list means it serves nowhere."
      >
        {current.loading ? <Spinner /> : <PlacesPicker value={shown} onChange={setPlaces} />}
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

function NewCompanyForm({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [places, setPlaces] = useState<Place[]>([])
  const [error, setError] = useState<ApiError | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      // One call, one transaction: a rejected location leaves no half-made company behind.
      const created = await companies.create(name, places)
      navigate(`/companies/${created.id}`)
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Add a company</h2>
      <FormError error={error} />
      <Field
        label="Name"
        name="name"
        error={error}
        hint="GSTIN, address and contact details are filled in on the company's page."
      >
        <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      </Field>

      <fieldset>
        <legend>Where it operates</legend>
        <p className="muted small">
          Optional, and more than one is normal — a location can be a single city or a whole
          state, which matches every city in it. <strong>Every vehicle this company owns runs
          here</strong>, so a company with none serves nowhere until you set some.
        </p>
        <PlacesEditor value={places} onChange={setPlaces} disabled={busy} />
      </fieldset>

      <div className="actions">
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Adding…' : 'Add'}
        </button>
        <button type="button" className="link" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  )
}
