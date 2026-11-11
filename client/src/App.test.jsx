import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TOKEN_STORAGE_KEY } from './api/client.js'
import App from './App.jsx'

function mockMeForUser(user) {
  return vi.fn().mockImplementation((url) => {
    if (url === '/api/auth/me') {
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => user,
      })
    }
    if (url === '/api/auth/logout') {
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ message: 'Logged out.' }),
      })
    }
    return Promise.resolve({
      ok: false,
      status: 404,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'Not found.' }),
    })
  })
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('App routing and role screens', () => {
  it('redirects unauthenticated users to the login screen', () => {
    render(
      <MemoryRouter initialEntries={['/parent']}>
        <App />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { name: 'Log in' })).toBeInTheDocument()
  })

  it('shows parent screens to a parent user and blocks specialist routes', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'parent-jwt')
    vi.stubGlobal(
      'fetch',
      mockMeForUser({
        id: 1,
        name: 'Ayşe Demir',
        email: 'ayse.demir@example.com',
        role: 'parent',
      })
    )

    render(
      <MemoryRouter initialEntries={['/specialist']}>
        <App />
      </MemoryRouter>
    )

    expect(await screen.findByRole('heading', { name: 'Parent Dashboard' })).toBeInTheDocument()
    expect(screen.getByText('Ayşe Demir (Parent)')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Specialists' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'My children' })).not.toBeInTheDocument()
  })

  it('shows specialist screens to a specialist user and blocks parent routes', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'spec-jwt')
    vi.stubGlobal(
      'fetch',
      mockMeForUser({
        id: 2,
        name: 'Mehmet Kaya',
        email: 'mehmet.kaya@example.com',
        role: 'specialist',
      })
    )

    render(
      <MemoryRouter initialEntries={['/parent']}>
        <App />
      </MemoryRouter>
    )

    expect(await screen.findByRole('heading', { name: 'My Children' })).toBeInTheDocument()
    expect(screen.getByText('Mehmet Kaya (Specialist)')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'My children' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Specialists' })).not.toBeInTheDocument()
  })

  it('shows child screens to a child user and blocks parent/specialist routes', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'child-jwt')
    vi.stubGlobal(
      'fetch',
      mockMeForUser({
        id: 5,
        name: 'Deniz Demir',
        email: 'deniz.demir@example.com',
        role: 'child',
      })
    )

    render(
      <MemoryRouter initialEntries={['/parent/specialists']}>
        <App />
      </MemoryRouter>
    )

    expect(await screen.findByRole('heading', { name: 'My Week' })).toBeInTheDocument()
    expect(screen.getByText('Deniz Demir (Child)')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'My week' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument()
  })

  it('logs out, clears the token, and returns to the login page', async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'parent-jwt')
    const fetchMock = mockMeForUser({
      id: 1,
      name: 'Ayşe Demir',
      email: 'ayse.demir@example.com',
      role: 'parent',
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter initialEntries={['/parent']}>
        <App />
      </MemoryRouter>
    )

    expect(await screen.findByRole('heading', { name: 'Parent Dashboard' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
    await waitFor(() => {
      expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST' })
    )
  })
})
