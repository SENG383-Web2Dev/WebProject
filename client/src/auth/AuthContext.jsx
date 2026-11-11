import { useEffect, useState } from 'react'
import {
  clearStoredToken,
  fetchMeRequest,
  getStoredToken,
  loginRequest,
  logoutRequest,
  setStoredToken,
} from '../api/client.js'
import { AuthContext } from './useAuth.js'

/**
 * Provides authentication state, session restoration on reload, login and logout actions.
 */
export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getStoredToken())
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(() => Boolean(getStoredToken()))

  useEffect(() => {
    if (!getStoredToken()) {
      return
    }

    let ignore = false

    fetchMeRequest()
      .then((profile) => {
        if (!ignore) {
          setUser(profile)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!ignore) {
          clearStoredToken()
          setToken(null)
          setUser(null)
          setLoading(false)
        }
      })

    return () => {
      ignore = true
    }
  }, [])

  async function login(email, password) {
    const data = await loginRequest(email, password)
    setStoredToken(data.token)
    setToken(data.token)
    setUser(data.user)
    return data.user
  }

  async function logout() {
    if (getStoredToken()) {
      try {
        await logoutRequest()
      } catch {
        // Ignore server/network errors when clearing the local session.
      }
    }
    clearStoredToken()
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isAuthenticated: Boolean(user),
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
