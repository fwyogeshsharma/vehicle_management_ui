import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

/**
 * Route guards.
 *
 * **These hide things; they do not protect them.** Every rule here is enforced again by the API,
 * which is the only place it counts — a guard in a browser is a convenience for whoever is
 * using it, not a security boundary. Their job is to avoid showing a button that is guaranteed to
 * return 403.
 */

export function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()

  // Wait for the stored token to be checked. Redirecting here would bounce a signed-in user to
  // the login page on every refresh.
  if (loading) return <div className="page-loading">Checking your session…</div>

  if (!user) {
    // Remember where they were headed, so signing in resumes rather than dumping them home.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <Outlet />
}

/**
 * Lorry receipts are the operating firm's own work: administrators and TEJJJ_CSR.
 *
 * <p>Hiding the nav item is not enough on its own — somebody types the URL, or follows an old
 * link — and without this they would get a page that renders and then 403s on every call,
 * which reads as broken rather than as not-for-you.
 */
export function RequireLorryReceipts() {
  const { user, loading, canSeeLorryReceipts } = useAuth()

  if (loading) return <div className="page-loading">Checking your session…</div>
  if (!user) return <Navigate to="/login" replace />

  if (!canSeeLorryReceipts) {
    return (
      <div className="card notice notice-error">
        <h2>Not your desk</h2>
        <p>
          Lorry receipts are handled by the transport desk. You are signed in as{' '}
          <strong>{user.role}</strong>; ask an administrator if you should be a Tejjj CSR.
        </p>
      </div>
    )
  }
  return <Outlet />
}

export function RequireAdmin() {
  const { user, loading, isAdmin } = useAuth()

  if (loading) return <div className="page-loading">Checking your session…</div>
  if (!user) return <Navigate to="/login" replace />

  if (!isAdmin) {
    return (
      <div className="card notice notice-error">
        <h2>Administrators only</h2>
        <p>
          Managing accounts — creating or removing a login, changing someone's role,
          deactivating a user — needs an administrator. You are signed in as{' '}
          <strong>{user.role}</strong>, which can do everything else: vehicles, companies,
          users and locations.
        </p>
      </div>
    )
  }
  return <Outlet />
}
