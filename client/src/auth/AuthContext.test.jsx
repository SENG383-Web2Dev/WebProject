import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { apiFetch, ApiError, TOKEN_STORAGE_KEY } from '../api/client.js'
import { AuthProvider } from './AuthContext.jsx'
import { useAuth } from './useAuth.js'
import RoleRoute from '../components/RoleRoute.jsx'

function AuthProbe() {
  const { user, loading, isAuthenticated, login, logout } = useAuth()
  if (loading) {
    return <span>Loading...</span>
  }
  return (
    <div>
      <span data-testid="auth-state">{isAuthenticated ? `${user.name}:${user.role}` : 'guest'}</span>
      <button type="button" onClick={() => login('ayse.demir@example.com', 'password123')}>
        DoLogin
      </button>
      <button type="button" onClick={() => logout()}>
        DoLogout
      </button>
    </div>
  )
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('apiFetch', () => {
  it('attaches Bearer token from localStorage and sends JSON body', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'jwt-123')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ ok: true }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await apiFetch('/api/children', { method: 'POST', body: { name: 'Deniz' } })
    expect(result).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith('/api/children', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer jwt-123',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Deniz' }),
    })
  })

  it('skips Authorization when skipAuth is true and returns null on 204', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'jwt-123')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      headers: { get: () => null },
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await apiFetch('/api/children/1/specialists/2', {
      method: 'DELETE',
      skipAuth: true,
    })
    expect(result).toBeNull()
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined()
  })

  it('throws ApiError with backend message when response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        headers: { get: () => 'application/json' },
        json: async () => ({ error: 'Forbidden' }),
      })
    )

    await expect(apiFetch('/api/secret')).rejects.toEqual(
      expect.objectContaining({ name: 'ApiError', status: 403, message: 'Forbidden' })
    )
    await expect(apiFetch('/api/secret')).rejects.toBeInstanceOf(ApiError)
  })
})

describe('AuthProvider', () => {
  it('restores the user from /api/auth/me when a valid token is stored', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'saved-jwt')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ id: 1, name: 'Ayse Demir', email: 'ayse.demir@example.com', role: 'parent' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    )

    expect(await screen.findByText('Ayse Demir:parent')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer saved-jwt' }),
      })
    )
  })

  it('clears invalid stored tokens when /api/auth/me fails', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'expired-jwt')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: { get: () => 'application/json' },
        json: async () => ({ error: 'Invalid or expired token.' }),
      })
    )

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    )

    expect(await screen.findByText('guest')).toBeInTheDocument()
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
  })

  it('stores token on login and removes token on logout', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({
          token: 'new-jwt',
          user: { id: 1, name: 'Ayse Demir', email: 'ayse.demir@example.com', role: 'parent' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ message: 'Logged out.' }),
      })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    )

    expect(screen.getByText('guest')).toBeInTheDocument()

    fireEvent.click(screen.getByText('DoLogin'))
    expect(await screen.findByText('Ayse Demir:parent')).toBeInTheDocument()
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('new-jwt')

    fireEvent.click(screen.getByText('DoLogout'))
    await waitFor(() => {
      expect(screen.getByText('guest')).toBeInTheDocument()
    })
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
  })
})

describe('RoleRoute', () => {
  it('redirects unauthenticated users to /login', () => {
    render(
      <MemoryRouter initialEntries={['/parent']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<div>Login Screen</div>} />
            <Route
              path="/parent"
              element={
                <RoleRoute allowedRoles={['parent']}>
                  <div>Parent Secret</div>
                </RoleRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    expect(screen.getByText('Login Screen')).toBeInTheDocument()
    expect(screen.queryByText('Parent Secret')).not.toBeInTheDocument()
  })

  it('redirects a user with a disallowed role to their own role home screen', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'child-jwt')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ id: 5, name: 'Deniz Demir', email: 'deniz.demir@example.com', role: 'child' }),
      })
    )

    render(
      <MemoryRouter initialEntries={['/parent']}>
        <AuthProvider>
          <Routes>
            <Route path="/child" element={<div>Child Home Screen</div>} />
            <Route
              path="/parent"
              element={
                <RoleRoute allowedRoles={['parent']}>
                  <div>Parent Secret</div>
                </RoleRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    expect(await screen.findByText('Child Home Screen')).toBeInTheDocument()
    expect(screen.queryByText('Parent Secret')).not.toBeInTheDocument()
  })

  it('renders protected content when user has an allowed role', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'parent-jwt')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ id: 1, name: 'Ayse Demir', email: 'ayse.demir@example.com', role: 'parent' }),
      })
    )

    render(
      <MemoryRouter initialEntries={['/parent']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/parent"
              element={
                <RoleRoute allowedRoles={['parent']}>
                  <div>Parent Secret</div>
                </RoleRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    )

    expect(await screen.findByText('Parent Secret')).toBeInTheDocument()
  })
})
