import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { getRoleHomePath, useAuth } from '../auth/useAuth.js'

/**
 * Login page allowing users to sign in with email and password (FR-M1-01..03).
 * Redirects to the role-specific workspace after authentication.
 */
function LoginPage() {
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (loading) {
    return (
      <div className="status-message" role="status">
        Loading session...
      </div>
    )
  }

  if (user) {
    return <Navigate to={getRoleHomePath(user.role)} replace />
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (!email.trim() || !password) {
      setError('Email and password are required.')
      return
    }

    setSubmitting(true)
    try {
      const loggedInUser = await login(email, password)
      navigate(getRoleHomePath(loggedInUser.role), { replace: true })
    } catch (err) {
      setError(err.message || 'Could not log in. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <span className="brand-title">Child Development Platform</span>
        </div>
      </header>

      <main className="login-wrapper">
        <section className="login-card">
          <h1 className="login-heading">Log in</h1>

          <form onSubmit={handleSubmit} className="login-form" noValidate>
            <div className="form-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="ayse.demir@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <div className="alert-error" role="alert">
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Logging in...' : 'Log in'}
            </button>

            <p className="login-note">
              There is no role choice: after login, you are taken directly to the screens
              for your account role.
            </p>
          </form>
        </section>
      </main>
    </div>
  )
}

export default LoginPage
