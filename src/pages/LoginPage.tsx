import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Field, FormError } from '../components/Form'

export function LoginPage() {
  const { signIn, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<ApiError | null>(null)
  const [busy, setBusy] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? '/'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(username, password)
      navigate(from, { replace: true })
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, String(e)))
    } finally {
      setBusy(false)
    }
  }

  // A <Navigate> rather than navigate() during render, which React warns about on every sign-in.
  if (user) {
    return <Navigate to={from} replace />
  }

  return (
    <div className="login-page">
      <form className="card login-card" onSubmit={submit}>
        <h1>Vehicle Management</h1>
        <p className="muted">Sign in to continue.</p>

        <FormError error={error} />

        <Field label="Username" name="username" error={error}>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </Field>

        <Field label="Password" name="password" error={error}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>

        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        {/*
          There is no "create an account" link, and that is not an omission. Accounts are made by
          an administrator from inside the app: the API has no public signup, and a driver has no
          login at all -- they are recorded as a user of the fleet, never as a user of this app.
        */}
        <p className="muted small">
          No account? Accounts are created by an administrator. Drivers do not sign in — they are
          recorded under <strong>Drivers</strong> by someone who does.
        </p>
      </form>
    </div>
  )
}
