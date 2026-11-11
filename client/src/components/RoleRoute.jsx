import { Navigate, Outlet } from 'react-router-dom'
import { getRoleHomePath, useAuth } from '../auth/useAuth.js'

/**
 * Route guard that ensures an authenticated user has one of the allowed roles (FR-M1-05).
 * Unauthenticated users are redirected to /login; wrong roles are sent to their own home route.
 */
function RoleRoute({ allowedRoles, children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="status-message" role="status">
        Loading session...
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={getRoleHomePath(user.role)} replace />
  }

  return children ?? <Outlet />
}

export default RoleRoute
