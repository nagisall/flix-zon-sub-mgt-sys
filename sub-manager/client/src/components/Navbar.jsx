import { NavLink, useNavigate } from 'react-router-dom'
import { apiFetch } from '../api.js'

export default function Navbar() {
  const navigate = useNavigate()

  let user = null
  try {
    const raw = localStorage.getItem('user')
    if (raw) user = JSON.parse(raw)
  } catch {
    user = null
  }

  const isAdmin = user && user.role === 'admin'
  const isStaff = user && user.role === 'staff'
  const isAdminOrStaff = isAdmin || isStaff

  function handleLogout() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    navigate('/login', { replace: true })
  }

  async function switchDemoRole(role) {
    try {
      const data = await apiFetch('/api/auth/demo-login', {
        method: 'POST',
        body: JSON.stringify({ role })
      })
      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      window.location.href = '/' // Full reload to re-evaluate route permissions
    } catch (err) {
      console.error('Failed to switch demo role:', err)
    }
  }

  return (
    <header style={{ width: '100%', position: 'sticky', top: 0, zIndex: 100 }}>
      {/* 1. Main Navigation Bar — Clean, Single Straight Line */}
      <nav className="navbar">
        <NavLink to="/" className="navbar-brand">
          <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#ffffff', marginRight: '6px' }}></span>
          BRIGHTLOOP
        </NavLink>

        <ul className="navbar-links">
          <li>
            <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
              Dashboard
            </NavLink>
          </li>
          {isAdminOrStaff && (
            <>
              <li>
                <NavLink to="/products" className={({ isActive }) => isActive ? 'active' : ''}>
                  Products & Plans
                </NavLink>
              </li>
              <li>
                <NavLink to="/quotes" className={({ isActive }) => isActive ? 'active' : ''}>
                  Quotes
                </NavLink>
              </li>
            </>
          )}
          <li>
            <NavLink to="/subscriptions" className={({ isActive }) => isActive ? 'active' : ''}>
              Subscriptions
            </NavLink>
          </li>
          <li>
            <NavLink to="/invoices" className={({ isActive }) => isActive ? 'active' : ''}>
              Invoices & Billing
            </NavLink>
          </li>
          {isAdmin && (
            <>
              <li>
                <NavLink to="/taxes-discounts" className={({ isActive }) => isActive ? 'active' : ''}>
                  Taxes & Discounts
                </NavLink>
              </li>
              <li>
                <NavLink to="/staff" className={({ isActive }) => isActive ? 'active' : ''}>
                  Staff
                </NavLink>
              </li>
            </>
          )}
        </ul>

        <div className="navbar-user">
          {user && (
            <>
              <span style={{ fontWeight: 600, color: '#f4f4f5' }}>{user.name}</span>
              <span className="role-badge">
                {user.role}
              </span>
            </>
          )}
          <button className="btn btn-danger btn-sm" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </nav>

      {/* 2. Dedicated Demo Toolbar Strip Below (Clean & Compact) */}
      <div className="demo-sub-bar">
        <div className="demo-sub-bar-left">
          <span className="demo-sub-bar-label">Switch Tier:</span>
          <button
            type="button"
            className={`demo-role-btn ${user?.role === 'admin' ? 'active' : ''}`}
            onClick={() => switchDemoRole('admin')}
            title="Switch to Admin view"
          >
            👑 Admin
          </button>
          <button
            type="button"
            className={`demo-role-btn ${user?.role === 'staff' ? 'active' : ''}`}
            onClick={() => switchDemoRole('staff')}
            title="Switch to Staff view"
          >
            💼 Staff
          </button>
          <button
            type="button"
            className={`demo-role-btn ${user?.role === 'customer' ? 'active' : ''}`}
            onClick={() => switchDemoRole('customer')}
            title="Switch to Customer view"
          >
            👤 Customer
          </button>
        </div>

        <div className="demo-sub-bar-desc">
          Viewing system as <strong>{user?.name}</strong> ({user?.role?.toUpperCase()} tier)
        </div>
      </div>
    </header>
  )
}
