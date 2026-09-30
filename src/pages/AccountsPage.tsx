import { useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchAll, ApiError } from '../api/client'
import { users } from '../api/resources'
import { ROLE_LABEL, USER_ROLES } from '../api/types'
import type { UserRole, UserSummary, UserType } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { Empty, Field, FormError, Notice, Spinner } from '../components/Form'
import { useAsync } from '../components/useAsync'

/**
 * Accounts: the users who can sign in to this system.
 *
 * Distinct from Drivers on purpose. That page is a directory of *users*; this one is about
 * *credentials*, which is the thing an administrator owns and everybody else does not. Only
 * STAFF and ADMIN may hold a login at all — the API refuses to give one to a driver — so this
 * screen never offers it.
 *
 * Creating an account is three calls, because they are three different facts: the user, their
 * role, and their credentials. The form does all three and reports which step failed.
 */
export function AccountsPage() {
  const { user: me } = useAuth()
  const [creating, setCreating] = useState(false)

  // Two lists rather than one filtered client-side: the API filters by type, and paging means a
  // client-side filter would only ever see one page of the directory.
  // Both complete. At 200 accounts the previous fetch simply stopped, and somebody's login
  // disappeared from the only screen that can revoke it.
  const staff = useAsync(
    () => fetchAll((page, page_size) =>
      users.list({ type: 'STAFF', page, page_size, sort: 'name' })), [])
  const admins = useAsync(
    () => fetchAll((page, page_size) =>
      users.list({ type: 'ADMIN', page, page_size, sort: 'name' })), [])

  function reloadAll() {
    staff.reload()
    admins.reload()
  }

  const rows = [...(admins.data?.items ?? []), ...(staff.data?.items ?? [])]
  const withLogin = rows.filter((u) => u.username)
  const withoutLogin = rows.filter((u) => !u.username)

  return (
    <div className="stack">
      <header className="page-header">
        <h1>Accounts</h1>
        <button type="button" className="primary" onClick={() => setCreating(true)}>
          Create an account
        </button>
      </header>

      <Notice kind="info">
        Only <strong>office staff</strong> and <strong>administrators</strong> can sign in.
        Drivers and owners are recorded under Drivers and never get a password — which is why
        this system has no public sign-up page.
      </Notice>

      {creating && (
        <CreateAccountForm
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false)
            reloadAll()
          }}
        />
      )}

      {(staff.loading || admins.loading) && !rows.length && <Spinner />}
      {staff.error && <Notice kind="error">{staff.error.message}</Notice>}

      <section className="card">
        <h2>Can sign in</h2>
        {withLogin.length === 0 ? (
          <Empty>Nobody has a login.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                {/* Two columns, because they are two facts: what somebody IS, and what they
                    may DO. They were one overloaded column until the role was split out. */}
                <th>Type</th>
                <th>Role</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {withLogin.map((u) => (
                <AccountRow key={u.id} account={u} me={me?.id} onChanged={reloadAll} />
              ))}
            </tbody>
          </table>
        )}
      </section>

      {withoutLogin.length > 0 && (
        <section className="card">
          <h2>Could sign in, but has no login yet</h2>
          <p className="muted small">
            Staff and administrators on file without a username. Give them one to let them in.
          </p>
          <table className="table">
            <tbody>
              {withoutLogin.map((u) => (
                <AccountRow key={u.id} account={u} me={me?.id} onChanged={reloadAll} />
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}

function AccountRow({
  account,
  me,
  onChanged,
}: {
  account: UserSummary
  me: number | undefined
  onChanged: () => void
}) {
  const [error, setError] = useState<ApiError | null>(null)
  const [busy, setBusy] = useState(false)
  const [granting, setGranting] = useState(false)

  async function run(action: () => Promise<unknown>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return
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

  const isMe = account.id === me

  return (
    <>
      <tr className={account.active ? '' : 'row-muted'}>
        <td>
          <Link to={`/drivers/${account.id}`}>{account.name}</Link>
          {isMe && <span className="badge">you</span>}
        </td>
        <td>{account.username ?? <span className="muted">—</span>}</td>
        <td>
          <span className="badge">{account.user_type}</span>
        </td>
        <td>
          {/* What they may DO. Separate from the type beside it, which is what they ARE --
              an administrator can be office staff, and since the role column those are two
              independent facts rather than one overloaded one. */}
          {account.role ? (
            <select
              value={account.role}
              disabled={busy}
              onChange={(e) => run(() => users.setRole(account.id, e.target.value as UserRole))}
            >
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          ) : (
            <span className="muted">no login</span>
          )}
        </td>
        <td>
          {account.active ? (
            <span className="badge badge-ok">Active</span>
          ) : (
            <span className="badge">Inactive</span>
          )}
        </td>
        <td className="right">
          <button type="button" className="link" onClick={() => setGranting((g) => !g)}>
            {account.username ? 'Reset password' : 'Give a login'}
          </button>
          {account.username && (
            <button
              type="button"
              className="link danger"
              disabled={busy}
              onClick={() =>
                run(
                  () => users.removeLogin(account.id),
                  `Remove ${account.name}'s login?\n\nThey stay in the directory but can no ` +
                    `longer sign in, and any token they currently hold stops working at once.`,
                )
              }
            >
              Remove login
            </button>
          )}
          {/* The promote/demote button is gone: authority is the role dropdown now.
              Changing user_type used to be how somebody became an administrator, and leaving
              a button that says "Make administrator" but changes what they ARE would be the
              most misleading control on the screen. */}
          <button
            type="button"
            className="link danger"
            disabled={busy}
            onClick={() =>
              run(
                () =>
                  account.active ? users.deactivate(account.id) : users.restore(account.id),
                account.active
                  ? `Deactivate ${account.name}?\n\nThey stop being able to sign in immediately.`
                  : undefined,
              )
            }
          >
            {account.active ? 'Deactivate' : 'Reactivate'}
          </button>
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={5}>
            {/* The API refuses to remove the last administrator, and to demote them. Show that
                refusal verbatim -- it explains itself, and inventing a friendlier version would
                lose the reason. */}
            <Notice kind="error">{error.message}</Notice>
          </td>
        </tr>
      )}
      {granting && (
        <tr>
          <td colSpan={5}>
            <GrantLoginForm
              account={account}
              onClose={() => setGranting(false)}
              onDone={() => {
                setGranting(false)
                onChanged()
              }}
            />
          </td>
        </tr>
      )}
    </>
  )
}

function GrantLoginForm({
  account,
  onClose,
  onDone,
}: {
  account: UserSummary
  onClose: () => void
  onDone: () => void
}) {
  const [username, setUsername] = useState(account.username ?? '')
  const [password, setPassword] = useState('')
  // Keeps what they already have when this is a password reset, so resetting a password is
  // not also a silent chance to change somebody's authority.
  const [role, setRole] = useState<UserRole>(account.role ?? 'CSR')
  const [error, setError] = useState<ApiError | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await users.setLogin(account.id, username, password, role)
      onDone()
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="inset" onSubmit={submit}>
      <FormError error={error} />
      <div className="grid-3">
        <Field label="Role" name="role" error={error} hint="What they may do here.">
          <select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Username" name="username" error={error} hint="Lower case; 3–50 characters.">
          <input value={username} onChange={(e) => setUsername(e.target.value)} required />
        </Field>
        <Field
          label="Password"
          name="password"
          error={error}
          hint="At least 8 characters. Shown to nobody afterwards — pass it on yourself."
        >
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>
      </div>
      {account.username && (
        <Notice kind="warn">
          Resetting the password signs {account.name} out everywhere — any token issued before
          now stops being accepted.
        </Notice>
      )}
      <div className="actions">
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save login'}
        </button>
        <button type="button" className="link" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  )
}

/**
 * Creating an account from nothing: the person, then their credentials and role.
 *
 * Two calls, reported as one action. If the second fails the person still exists — so the
 * error says so rather than implying nothing happened, and the list below will show them
 * waiting for a login.
 *
 * It used to be three: create as STAFF, promote the `user_type` to ADMIN, then grant a login.
 * Authority is `role` now and travels with the login, so the promotion step is gone.
 */
function CreateAccountForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  // What they ARE, which for anyone getting a login is office staff.
  const userType: UserType = 'STAFF'
  // What they may DO.
  const [role, setRole] = useState<UserRole>('CSR')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<ApiError | null>(null)
  const [partial, setPartial] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setPartial(null)

    let createdId: number | null = null
    try {
      const user = await users.create(name, mobile, userType)
      createdId = user.id

      await users.setLogin(user.id, username, password, role)
      onCreated()
    } catch (e) {
      const apiError = e instanceof ApiError ? e : new ApiError(0, String(e))
      setError(apiError)
      if (createdId !== null) {
        setPartial(
          `${name} was added to the directory, but the account was not finished. ` +
            `They are listed below without a login — fix the problem and grant one there, ` +
            `rather than adding them again.`,
        )
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Create an account</h2>
      <FormError error={error} />
      {partial && <Notice kind="warn">{partial}</Notice>}

      <div className="grid-2">
        <Field label="Full name" name="name" error={error}>
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        <Field label="Mobile" name="mobile" error={error} hint="Ten digits, starting 6–9.">
          <input value={mobile} onChange={(e) => setMobile(e.target.value)} required />
        </Field>
      </div>

      <Field
        label="Role"
        name="role"
        error={error}
        hint="An administrator can also manage accounts — creating logins, changing roles, deactivating people. CSR and Tejjj CSR can do the same work as each other."
      >
        <select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
          {USER_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid-2">
        <Field label="Username" name="username" error={error}>
          <input value={username} onChange={(e) => setUsername(e.target.value)} required />
        </Field>
        <Field
          label="Password"
          name="password"
          error={error}
          hint="At least 8 characters. It is never shown again — pass it on yourself."
        >
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>
      </div>

      <div className="actions">
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
        <button type="button" className="link" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  )
}
