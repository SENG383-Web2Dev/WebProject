import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'

const ROLE_LABELS = {
  parent: 'Parent',
  specialist: 'Specialist',
  child: 'Child',
}

const ROLE_NAV_ITEMS = {
  parent: [
    { to: '/parent', label: 'Dashboard', end: true },
    { to: '/parent/specialists', label: 'Specialists', end: false },
  ],
  specialist: [{ to: '/specialist', label: 'My children', end: true }],
  child: [{ to: '/child', label: 'My week', end: true }],
}

/**
 * Shared application shell displaying the top navigation bar for the user's role
 * and the Log out button (FR-M1-05, FR-M1-06).
 */
function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const navItems = ROLE_NAV_ITEMS[user?.role] || []
  const roleLabel = ROLE_LABELS[user?.role] || user?.role

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <span className="brand-title">Child Development Platform</span>
          <nav className="nav-links" aria-label="Main navigation">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  isActive ? 'nav-link nav-link-active' : 'nav-link'
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="topbar-right">
          <span className="user-badge">
            {user?.name} ({roleLabel})
          </span>
          <button type="button" className="btn-secondary" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}

export default AppLayout
