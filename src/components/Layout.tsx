import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

type Needs = 'admin' | 'lorryReceipts'

/**
 * The tabs along the top, in order.
 *
 * `needs` names the permission a link requires; a link without one is open to any login,
 * which is most of them. Kept as data rather than as JSX conditionals so the ORDER is visible
 * in one place — a conditional link appended after the map ends up last on the bar no matter
 * where it belongs.
 */
const LINKS: { to: string; label: string; needs?: Needs }[] = [
  { to: '/intake', label: 'Intake' },
  { to: '/lr', label: 'Lorry receipts', needs: 'lorryReceipts' },
  { to: '/load-requests', label: 'Load requests', needs: 'lorryReceipts' },
  { to: '/contracts', label: 'Contracts', needs: 'lorryReceipts' },
  { to: '/lanes', label: 'Lanes' },
  { to: '/vehicles', label: 'Vehicles' },
  { to: '/drivers', label: 'Drivers' },
  { to: '/companies', label: 'Companies' },
]

/**
 * What lives in the menu at the top right: the pages that are set-up rather than daily work.
 * Same `needs` rule as the tabs.
 */
const MENU_LINKS: { to: string; label: string; needs?: Needs }[] = [
  { to: '/masters', label: 'Masters' },
  { to: '/accounts', label: 'Accounts', needs: 'admin' },
]

export function Layout() {
  const { isAdmin, canSeeLorryReceipts, signOut } = useAuth()

  // A menu item that always 403s is worse than no menu item, so the ones a person may not use
  // are not rendered. The API refuses them regardless -- this only avoids offering a locked door.
  const permitted = (l: { needs?: Needs }) =>
    l.needs === 'admin' ? isAdmin : l.needs === 'lorryReceipts' ? canSeeLorryReceipts : true
  const tabs = LINKS.filter(permitted)
  const menu = MENU_LINKS.filter(permitted)
  const navigate = useNavigate()

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">Vehicle Management</div>
        <nav className="nav">
          {tabs.map((l) => (
            <NavLink key={l.to} to={l.to}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <AccountMenu
          links={menu}
          onSignOut={() => {
            signOut()
            navigate('/login', { replace: true })
          }}
        />
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}

/**
 * The menu at the extreme top right.
 *
 * <p>Deliberately says nothing about who is signed in: no name and no role. It holds the
 * set-up pages and Sign out. Closes on a click anywhere else, on Escape, and on going to
 * another page.
 */
function AccountMenu({
  links,
  onSignOut,
}: {
  links: { to: string; label: string }[]
  onSignOut: () => void
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()

  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div className="menu" ref={box}>
      <button
        type="button"
        className="menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu"
        title="Menu"
        onClick={() => setOpen((o) => !o)}
      >
        {/* Three bars, inline SVG so it inherits the text colour and needs no request. */}
        <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
          <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="menu-panel" role="menu">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} role="menuitem">
              {l.label}
            </NavLink>
          ))}
          <button type="button" role="menuitem" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
