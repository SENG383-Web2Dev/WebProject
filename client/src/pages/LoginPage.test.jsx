import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../auth/AuthContext.jsx'
import { TOKEN_STORAGE_KEY } from '../api/client.js'
import LoginPage from './LoginPage.jsx'

function renderLogin(initialPath = '/login') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/parent" element={<h1>Parent Dashboard</h1>} />
          <Route path="/specialist" element={<h1>My Children</h1>} />
          <Route path="/child" element={<h1>My Week</h1>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
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

describe('LoginPage', () => {
  it('renders email and password inputs with no role selector', () => {
    renderLogin()

    expect(screen.getByRole('heading', { name: 'Log in' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('shows a validation error when submitted with empty fields', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    renderLogin()
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Email and password are required.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the error message returned by the API when credentials are wrong', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: { get: () => 'application/json' },
        json: async () => ({ error: 'Wrong email or password.' }),
      })
    )

    renderLogin()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ayse.demir@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password.')
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull()
  })

  it('disables the submit button while logging in', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))

    renderLogin()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ayse.demir@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))

    const button = screen.getByRole('button', { name: 'Logging in...' })
    expect(button).toBeDisabled()
  })

  it.each([
    {
      role: 'parent',
      email: 'ayse.demir@example.com',
      name: 'Ayse Demir',
      expectedHeading: 'Parent Dashboard',
    },
    {
      role: 'specialist',
      email: 'mehmet.kaya@example.com',
      name: 'Mehmet Kaya',
      expectedHeading: 'My Children',
    },
    {
      role: 'child',
      email: 'deniz.demir@example.com',
      name: 'Deniz Demir',
      expectedHeading: 'My Week',
    },
  ])(
    'stores token and redirects $role to its home route',
    async ({ role, email, name, expectedHeading }) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({
            token: `jwt-${role}`,
            user: { id: 1, name, email, role },
          }),
        })
      )

      renderLogin()
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } })
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
      fireEvent.click(screen.getByRole('button', { name: 'Log in' }))

      expect(await screen.findByRole('heading', { name: expectedHeading })).toBeInTheDocument()
      expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe(`jwt-${role}`)
    }
  )
})
