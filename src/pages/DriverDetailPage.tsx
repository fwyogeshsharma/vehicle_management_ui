import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchAll, ApiError } from '../api/client'
import { companies, users } from '../api/resources'
import type { UserDetail } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { Empty, Field, FormError, Notice, Spinner } from '../components/Form'
import { useAsync } from '../components/useAsync'

export function DriverDetailPage() {
  const id = Number(useParams().id)
  const user = useAsync(() => users.get(id), [id])

  if (user.loading && !user.data) return <Spinner />
  if (user.error) return <Notice kind="error">{user.error.message}</Notice>
  if (!user.data) return null
  const p = user.data

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>{p.name}</h1>
          <p className="muted">
            {p.mobile} · <span className="badge">{p.user_type}</span>
            {!p.active && ' · inactive'}
          </p>
        </div>
      </header>

      <div className="columns">
        <div className="stack">
          <EmploymentCard user={p} />
          <TrucksDrivenCard user={p} />
        </div>
        <div className="stack">
          <UserDetailsCard user={p} onSaved={user.reload} />
        </div>
      </div>
    </div>
  )
}

/**
 * Attaching a user to a company — and detaching them.
 *
 * This is the screen behind "only a company's own drivers ride its trucks": employment recorded
 * here is what makes someone assignable to that company's vehicles. Ending it cascades those
 * assignments away, which the confirmation says beforehand and the result confirms afterwards.
 */
function EmploymentCard({ user }: { user: UserDetail }) {
  const memberships = useAsync(() => users.companies(user.id), [user.id])
  const all = useAsync(
    () => fetchAll((page, page_size) => companies.list({ active: true, page, page_size })), [])
  const [pick, setPick] = useState<number | ''>('')
  const [position, setPosition] = useState('Driver')
  const [primary, setPrimary] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const joined = new Set((memberships.data ?? []).map((m) => m.company_id))
  const available = (all.data?.items ?? []).filter((c) => !joined.has(c.id))

  async function attach(e: React.FormEvent) {
    e.preventDefault()
    if (pick === '') return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      await users.joinCompany(user.id, Number(pick), position, primary)
      setPick('')
      setPrimary(false)
      memberships.reload()
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, String(e)))
    } finally {
      setBusy(false)
    }
  }

  async function detach(companyId: number, companyName: string | null) {
    const label = companyName ?? 'this company'
    const confirmed = window.confirm(
      `Take ${user.name} off ${label}'s books?\n\n` +
        `This also removes every assignment they hold on ${label}'s trucks — that cascade is ` +
        `what keeps "only a company's own drivers ride its trucks" true.`,
    )
    if (!confirmed) return
    setBusy(true)
    setError(null)
    try {
      const left = await users.leaveCompany(user.id, companyId)
      setResult(
        left.removed_driver_assignments === 0
          ? `${user.name} is off ${label}'s books. They were not driving any of its trucks.`
          : `${user.name} is off ${label}'s books, and was removed from ` +
            `${left.removed_driver_assignments} of its truck${
              left.removed_driver_assignments === 1 ? '' : 's'
            }.`,
      )
      memberships.reload()
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h2>Companies</h2>
      {result && <Notice kind="ok">{result}</Notice>}
      {error && <Notice kind="error">{error.message}</Notice>}

      {memberships.loading && !memberships.data && <Spinner />}
      {memberships.data?.length === 0 && (
        <Empty>
          On nobody's books. They can still drive a user-owned truck, but not a company's.
        </Empty>
      )}

      {memberships.data && memberships.data.length > 0 && (
        <table className="table">
          <tbody>
            {memberships.data.map((m) => (
              <tr key={m.company_id}>
                <td>
                  <Link to={`/companies/${m.company_id}`}>{m.company_name ?? '—'}</Link>
                </td>
                <td>{m.position ?? '—'}</td>
                <td>{m.primary && <span className="badge badge-ok">Main</span>}</td>
                <td className="right">
                  <button
                    type="button"
                    className="link danger"
                    disabled={busy}
                    onClick={() => detach(m.company_id, m.company_name)}
                  >
                    End employment
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form className="inline-form" onSubmit={attach}>
        <select value={pick} onChange={(e) => setPick(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">Attach to a company…</option>
          {available.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          placeholder="Position"
          aria-label="Position"
        />
        <label className="checkbox inline">
          <input type="checkbox" checked={primary} onChange={(e) => setPrimary(e.target.checked)} />
          Main employer
        </label>
        <button type="submit" disabled={busy || pick === ''}>
          Attach
        </button>
      </form>

      <p className="muted small">
        Being on a company's books is what makes this user assignable to that company's
        vehicles. Somebody can be on two companies' books at once; only one can be their main
        employer.
      </p>
    </section>
  )
}

function TrucksDrivenCard({ user }: { user: UserDetail }) {
  const driven = useAsync(() => users.vehicles(user.id), [user.id])

  return (
    <section className="card">
      <h2>Trucks they drive</h2>
      {driven.loading && !driven.data && <Spinner />}
      {driven.error && <Notice kind="error">{driven.error.message}</Notice>}
      {driven.data?.length === 0 && <Empty>Not assigned to any vehicle.</Empty>}
      {driven.data && driven.data.length > 0 && (
        <ul className="chips">
          {driven.data.map((v) => (
            <li key={v.id} className="chip">
              <Link to={`/vehicles/${v.id}`}>{v.registration_number}</Link>
            </li>
          ))}
        </ul>
      )}
      {/* Driving and owning are different facts and live in different places, so say which
          this list is. */}
      <p className="muted small">
        Driving, not owning. What they own is on the{' '}
        <Link to={`/vehicles?owner_user_id=${user.id}`}>vehicle list</Link>.
      </p>
    </section>
  )
}

function UserDetailsCard({ user, onSaved }: { user: UserDetail; onSaved: () => void }) {
  const { isAdmin } = useAuth()
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [busy, setBusy] = useState(false)

  const [name, setName] = useState(user.name)
  const [mobile, setMobile] = useState(user.mobile)
  const [altMobile, setAltMobile] = useState(user.alt_mobile ?? '')
  const [email, setEmail] = useState(user.email ?? '')
  const [notes, setNotes] = useState(user.notes ?? '')

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await users.update(user.id, {
        name,
        mobile,
        alt_mobile: altMobile || null,
        email: email || null,
        city_id: user.city_id,
        notes: notes || null,
      })
      setEditing(false)
      onSaved()
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, String(e)))
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive() {
    setBusy(true)
    setError(null)
    try {
      if (user.active) await users.deactivate(user.id)
      else await users.restore(user.id)
      onSaved()
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h2>Details</h2>
      {error && <Notice kind="error">{error.message}</Notice>}

      {!editing ? (
        <>
          <dl className="pairs">
            <dt>Mobile</dt>
            <dd>{user.mobile}</dd>
            <dt>Alternate</dt>
            <dd>{user.alt_mobile ?? '—'}</dd>
            <dt>Email</dt>
            <dd>{user.email ?? '—'}</dd>
            <dt>Signs in</dt>
            <dd>
              {user.can_sign_in ? (
                <>
                  yes, as <strong>{user.username}</strong>
                </>
              ) : user.user_type === 'STAFF' || user.user_type === 'ADMIN' ? (
                <>
                  not yet — an administrator can give them a login under{' '}
                  <strong>Accounts</strong>
                </>
              ) : (
                'never — drivers and owners have no username or password'
              )}
            </dd>
            <dt>Notes</dt>
            <dd>{user.notes ?? '—'}</dd>
          </dl>
          <div className="actions">
            <button type="button" onClick={() => setEditing(true)}>
              Edit
            </button>
            {/* Deactivating a user is account administration, so only an administrator is
                offered it -- the API returns 403 to anyone else. */}
            {isAdmin && (
              <button type="button" className="link danger" onClick={toggleActive} disabled={busy}>
                {user.active ? 'Deactivate' : 'Reactivate'}
              </button>
            )}
          </div>
        </>
      ) : (
        <form onSubmit={save}>
          <FormError error={error} />
          <Field label="Name" name="name" error={error}>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Mobile" name="mobile" error={error}>
            <input value={mobile} onChange={(e) => setMobile(e.target.value)} required />
          </Field>
          <Field label="Alternate mobile" name="alt_mobile" error={error}>
            <input value={altMobile} onChange={(e) => setAltMobile(e.target.value)} />
          </Field>
          <Field label="Email" name="email" error={error}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Notes" name="notes" error={error}>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </Field>
          <p className="muted small">
            Their type cannot be changed here — that is privilege escalation, and it lives under
            Accounts where only an administrator can reach it.
          </p>
          <div className="actions">
            <button type="submit" className="primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
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
