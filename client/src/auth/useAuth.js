import { createContext, useContext } from 'react'

export const AuthContext = createContext(null)

/**
 * Resolve the default home route path for a given user role.
 * @param {string|undefined} role
 * @returns {string}
 */
export function getRoleHomePath(role) {
  switch (role) {
    case 'parent':
      return '/parent'
    case 'specialist':
      return '/specialist'
    case 'child':
      return '/child'
    default:
      return '/login'
  }
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
