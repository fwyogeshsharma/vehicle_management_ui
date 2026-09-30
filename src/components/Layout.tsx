import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

/**
 * The nav, in order.
 *
 * `needs` names the permission a link requires; a link without one is open to any login,
 * which is most of them. Kept as data rather than as JSX conditionals so the ORDER is visible
 * in one place — a conditional link appended after the map ends up last on the bar no matter
 * where it belongs.
 */
const LINKS: { to: string; label: string; end?: boolean; needs?: 'admin' | 'lorryReceipts' }[] = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/intake', label: 'Intake' },
  { to: '/lr', label: 'Lorry receipts', needs: 'lorryReceipts' },
  { to: '/lanes', label: 'Lanes' },
  { to: '/vehicles', label: 'Vehicles' },
  { to: '/drivers', label: 'Drivers' },
  { to: '/companies', label: 'Companies' },
  { to: '/masters', label: 'Masters' },
  { to: '/accounts', label: 'Accounts', needs: 'admin' },
]

export function Layout() {
  const { user, isAdmin, canSeeLorryReceipts, signOut } = useAuth()

  const allowed = LINKS.filter((l) =>
    l.needs === 'admin' ? isAdmin : l.needs === 'lorryReceipts' ? canSeeLorryReceipts : true,
  )
  const navigate = useNavigate()

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">Vehicle Management</div>
        <nav className="nav">
          {/* A menu item that always 403s is worse than no menu item, so the ones a person
              may not use are not rendered. The API refuses them regardless -- this only
              avoids offering a door that is locked. */}
          {allowed.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="whoami">
          <span className="whoami-name">{user?.name}</span>
          <span className="badge">{user?.role ?? user?.user_type}</span>
          <button
            type="button"
            className="link"
            onClick={() => {
              signOut()
              navigate('/login', { replace: true })
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
