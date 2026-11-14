import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../auth/useAuth.js'
import { TOKEN_STORAGE_KEY } from '../api/client.js'
import ChildHomePage from './ChildHomePage.jsx'

function jsonResponse(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
  })
}

const CHILD_USER = { id: 5, name: 'Deniz Demir', email: 'deniz.demir@example.com', role: 'child' }

const TASK = {
  id: 1,
  childId: 1,
  assignedBy: { id: 2, name: 'Mehmet Kaya' },
  title: 'Read a picture book aloud',
  description: null,
  developmentArea: 'Language',
  dueDate: '2026-11-18',
  status: 'pending',
  doneAt: null,
  createdAt: '2026-11-14 10:00:00',
}

// Answers the calls the child home page makes: /me, the week's events and the tasks of child 1
function mockApi(me = { ...CHILD_USER, childProfileId: 1 }) {
  const fetchMock = vi.fn((url) => {
    if (url === '/api/auth/me') {
      return jsonResponse(me)
    }
    if (url.startsWith('/api/children/1/events')) {
      return jsonResponse([])
    }
    if (url === '/api/children/1/tasks') {
      return jsonResponse([TASK])
    }
    return jsonResponse({ error: 'Not found.' }, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderPage(user) {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={{ user, loading: false, login: vi.fn(), logout: vi.fn() }}>
        <ChildHomePage />
      </AuthContext.Provider>
    </MemoryRouter>
  )
}

beforeEach(() => {
  localStorage.setItem(TOKEN_STORAGE_KEY, 'child-jwt')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('ChildHomePage (M3, M4)', () => {
  it("shows the child's own tasks right after login, using childProfileId from the login response (FR-M4-02)", async () => {
    const fetchMock = mockApi()

    renderPage({ ...CHILD_USER, childProfileId: 1 })

    expect(await screen.findByText('Read a picture book aloud')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'My Tasks' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark as done' })).toBeInTheDocument()
    const urls = fetchMock.mock.calls.map(([url]) => url)
    expect(urls).toContain('/api/children/1/tasks')
    expect(urls).not.toContain('/api/auth/me')
  })

  it('asks /me for the profile id when the user object does not have it', async () => {
    const fetchMock = mockApi()

    renderPage(CHILD_USER)

    expect(await screen.findByText('Read a picture book aloud')).toBeInTheDocument()
    expect(fetchMock.mock.calls.map(([url]) => url)).toContain('/api/auth/me')
  })

  it('shows a message when no child profile is linked to the account', async () => {
    mockApi(CHILD_USER)

    renderPage(CHILD_USER)

    expect(await screen.findByText('Your tasks are not available yet.')).toBeInTheDocument()
    expect(screen.getByText('Your schedule is not available yet.')).toBeInTheDocument()
  })
})
