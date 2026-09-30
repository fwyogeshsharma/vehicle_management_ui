import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { users } from '../api/resources'
import type { UserType } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { Empty, Field, FormError, Notice, Spinner } from '../components/Form'
import { Pager, SortHeader } from '../components/Pager'
import { useAsync, useDebounced } from '../components/useAsync'

/**
 * Users.
 *
 * Called "Drivers" because that is who is mostly in here, but the table is the whole directory —
 * `user_type` is one column on one user, and an owner-operator is DRIVER *and* owner at once.
 * Filtering pretends otherwise only when you ask it to.
 */
export function DriversPage() {
  const { isAdmin } = useAuth()
  const [params, setParams] = useSearchParams()
  const [term, setTerm] = useState(params.get('q') ?? '')
  const debounced = useDebounced(term)
  const [adding, setAdding] = useState(false)

  const page = Number(params.get('page') ?? 1)
  const pageSize = Number(params.get('page_size') ?? 25)
  const sort = params.get('sort') ?? 'name'
  const type = (params.get('type') ?? '') as UserType | ''
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
      users.list({
        q: debounced.trim() || undefined,
        type: type || undefined,
        active: activeParam === null ? null : activeParam === 'true',
        page,
        page_size: pageSize,
        sort,
      }),
    [debounced, type, activeParam, page, pageSize, sort],
  )

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Drivers &amp; users</h1>
          <p className="muted">
            Everyone on file: the drivers and owners who move the freight, and the office staff
            who run the system.
          </p>
        </div>
        {/* Adding a user is administrator-only, so the button is not shown to anyone else --
            the API answers 403, and a button that always fails is worse than no button.
            Office staff add a driver by registering the vehicle they drive. */}
        {isAdmin && (
          <button type="button" className="primary" onClick={() => setAdding(true)}>
            Add a user
          </button>
        )}
      </header>

      {!isAdmin && (
        <Notice kind="info">
          Only an administrator can add or remove a user here. To put a new driver on file,
          register the vehicle they drive from <strong>Vehicles</strong> — typing their name and
          mobile there creates the record. New office staff are created by an administrator
          under <strong>Accounts</strong>.
        </Notice>
      )}

      {adding && (
        <NewUserForm
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false)
            list.reload()
          }}
        />
      )}

      <div className="filters card">
        <input
          className="search"
          placeholder="Name or mobile…"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value)
            patch({ q: e.target.value || null })
          }}
        />
        <select value={type} onChange={(e) => patch({ type: e.target.value || null })}>
          <option value="">Everyone</option>
          <option value="DRIVER">Drivers</option>
          <option value="BOTH">Owner-drivers</option>
          <option value="OWNER">Owners</option>
          <option value="STAFF">Office staff</option>
          <option value="ADMIN">Administrators</option>
        </select>
        <select
          value={activeParam ?? ''}
          onChange={(e) => patch({ active: e.target.value || null })}
        >
          <option value="">Active and inactive</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      {list.error && <Notice kind="error">{list.error.message}</Notice>}
      {list.loading && !list.data && <Spinner />}

      {list.data && (
        <>
          {list.data.items.length === 0 ? (
            <Empty>Nobody matches. Clear the filters, or add someone.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <SortHeader label="Name" field="name" sort={sort} onSort={(s) => patch({ sort: s })} />
                  <SortHeader
                    label="Mobile"
                    field="mobile"
                    sort={sort}
                    onSort={(s) => patch({ sort: s })}
                  />
                  <th>Type</th>
                  <th>Signs in</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((u) => (
                  <tr key={u.id} className={u.active ? '' : 'row-muted'}>
                    <td>
                      <Link to={`/drivers/${u.id}`}>{u.name}</Link>
                    </td>
                    <td>{u.mobile}</td>
                    <td>
                      <span className="badge">{u.user_type}</span>
                    </td>
                    <td>
                      {u.username ? (
                        u.username
                      ) : u.user_type === 'STAFF' || u.user_type === 'ADMIN' ? (
                        <span className="muted">no login yet</span>
                      ) : (
                        /* Not a gap to be filled. A driver has no username and no password and
                           the API refuses to give them one, so an em dash here reads as missing
                           data when it is in fact the rule. */
                        <span className="muted">never signs in</span>
                      )}
                    </td>
                    <td>
                      {u.active ? (
                        <span className="badge badge-ok">Active</span>
                      ) : (
                        <span className="badge">Inactive</span>
                      )}
                    </td>
                  </tr>
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

function NewUserForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [type, setType] = useState<UserType>('DRIVER')
  const [error, setError] = useState<ApiError | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await users.create(name, mobile, type)
      onCreated()
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Add a user</h2>
      <FormError error={error} />
      <div className="grid-3">
        <Field label="Name" name="name" error={error}>
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        <Field
          label="Mobile"
          name="mobile"
          error={error}
          hint="The natural key: one user, one number."
        >
          <input value={mobile} onChange={(e) => setMobile(e.target.value)} required />
        </Field>
        <Field
          label="Type"
          name="user_type"
          error={error}
          hint="Office staff are created under Accounts, where they also get a login."
        >
          <select value={type} onChange={(e) => setType(e.target.value as UserType)}>
            <option value="DRIVER">Driver</option>
            <option value="BOTH">Owner-driver</option>
            <option value="OWNER">Owner</option>
          </select>
        </Field>
      </div>
      {/* Set expectations here rather than at the point of failure: a DRIVER cannot be given a
          login at all, and someone will otherwise add a driver and go looking for the password
          field. */}
      <p className="muted small">
        This records someone in the fleet, not an account. <strong>Drivers and owners never sign
        in</strong> — they have no username and no password, and the system will not give them
        one. Office staff are added under <strong>Accounts</strong>, which creates their login at
        the same time.
      </p>
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
