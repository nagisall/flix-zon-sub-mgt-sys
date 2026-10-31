import { Navigate } from 'react-router-dom'

/**
 * ProtectedRoute — guards routes that require authentication.
 * Reads `user` from localStorage (stored as JSON).
 * If not logged in → redirect to /login.
 * If `roles` prop provided → check user.role is in the array, else show Access Denied.
 */
export default function ProtectedRoute({ children, roles }) {
  let user = null
  try {
    const raw = localStorage.getItem('user')
    if (raw) user = JSON.parse(raw)
  } catch {
    user = null
  }

  if (!user || !localStorage.getItem('token')) {
    return <Navigate to="/login" replace />
  }

  if (roles && !roles.includes(user.role)) {
    return (
      <div className="access-denied">
        <h2>Access Denied</h2>
        <p>You do not have permission to view this page.</p>
      </div>
    )
  }

  return children
}
