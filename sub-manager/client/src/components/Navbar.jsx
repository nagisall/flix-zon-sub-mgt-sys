import { NavLink, useNavigate } from 'react-router-dom'

/**
 * Navbar — shows app name, role-appropriate nav links, user info, and Logout.
 */
export default function Navbar() {
  const navigate = useNavigate()

  let user = null
  try {
    const raw = localStorage.getItem('user')
    if (raw) user = JSON.parse(raw)
  } catch {
    user = null
  }

  const isAdminOrStaff = user && (user.role === 'admin' || user.role === 'staff')

  function handleLogout() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    navigate('/login', { replace: true })
  }

  return (
    <nav className="navbar">
      <NavLink to="/" className="navbar-brand">
        SubManager
      </NavLink>

      <ul className="navbar-links">
        <li>
          <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
            Dashboard
          </NavLink>
        </li>
        {isAdminOrStaff && (
          <li>
            <NavLink to="/products" className={({ isActive }) => isActive ? 'active' : ''}>
              Products
            </NavLink>
          </li>
        )}
        <li>
          <NavLink to="/subscriptions" className={({ isActive }) => isActive ? 'active' : ''}>
            Subscriptions
          </NavLink>
        </li>
      </ul>

      <div className="navbar-user">
        {user && (
          <>
            <span>{user.name}</span>
            <span className="role-badge">{user.role}</span>
          </>
        )}
        <button className="btn btn-danger btn-sm" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </nav>
  )
}
