import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../auth/useAuth.js'
import { TOKEN_STORAGE_KEY } from '../api/client.js'
import SpecialistChildrenPage from './SpecialistChildrenPage.jsx'

function jsonResponse(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
  })
}

const SPECIALIST_USER = {
  id: 3,
  name: 'Zeynep Arslan',
  email: 'zeynep.arslan@example.com',
  role: 'specialist',
}

function renderPage(user = SPECIALIST_USER) {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={{ user, loading: false, login: vi.fn(), logout: vi.fn() }}>
        <SpecialistChildrenPage />
      </AuthContext.Provider>
    </MemoryRouter>
  )
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, 'spec-jwt')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('SpecialistChildrenPage (FR-M2-05, FR-M2-06)', () => {
  it('lists linked children and lets the specialist switch between child workspaces (FR-M2-05)', async () => {
    const linkedChildren = [
      {
        id: 1,
        name: 'Deniz Demir',
        birthDate: '2018-05-14',
        parentId: 1,
        parentName: 'Ayşe Demir',
        specialistType: 'Psychologist',
      },
      {
        id: 2,
        name: 'Ali Yıldız',
        birthDate: '2019-09-01',
        parentId: 7,
        parentName: 'Kemal Yıldız',
        specialistType: 'Teacher',
      },
    ]

    const fetchMock = vi.fn((url) => {
      if (url === '/api/specialist/children') {
        return jsonResponse(linkedChildren)
      }
      if (url === '/api/children/1') {
        return jsonResponse({ id: 1, name: 'Deniz Demir', birthDate: '2018-05-14' })
      }
      if (url === '/api/children/2') {
        return jsonResponse({ id: 2, name: 'Ali Yıldız', birthDate: '2019-09-01' })
      }
      return jsonResponse({ error: 'Not found.' }, 404)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    expect(screen.getByRole('heading', { name: 'My Children' })).toBeInTheDocument()
    expect(screen.getByText('Signed in as Zeynep Arslan.')).toBeInTheDocument()

    expect(await screen.findByRole('heading', { name: 'Deniz Demir' })).toBeInTheDocument()
    expect(screen.getByText('Parent: Ayşe Demir')).toBeInTheDocument()
    expect(screen.getByText('Birth date: 2018-05-14')).toBeInTheDocument()

    // Select second child
    fireEvent.click(screen.getByRole('button', { name: /Ali Yıldız/i }))

    expect(await screen.findByRole('heading', { name: 'Ali Yıldız' })).toBeInTheDocument()
    expect(screen.getByText('Parent: Kemal Yıldız')).toBeInTheDocument()
    expect(screen.getByText('Birth date: 2019-09-01')).toBeInTheDocument()
  })

  it('shows a clear empty state when no children are linked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url) => {
        if (url === '/api/specialist/children') {
          return jsonResponse([])
        }
        return jsonResponse({ error: 'Not found.' }, 404)
      })
    )

    renderPage()

    expect(
      await screen.findByText('No children are currently linked to your account.')
    ).toBeInTheDocument()
  })

  it('shows access revoked message when child endpoint returns 403 after unlinking (FR-M2-06)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url) => {
        if (url === '/api/specialist/children') {
          return jsonResponse([
            {
              id: 1,
              name: 'Deniz Demir',
              birthDate: '2018-05-14',
              parentId: 1,
              parentName: 'Ayşe Demir',
              specialistType: 'Psychologist',
            },
          ])
        }
        if (url === '/api/children/1') {
          return jsonResponse({ error: 'You do not have access to this child.' }, 403)
        }
        return jsonResponse({ error: 'Not found.' }, 404)
      })
    )

    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You no longer have access to this child.'
    )
  })

  it('shows an error banner when loading linked children fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({ error: 'Server error' }, 500))
    )

    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Server error')
  })
})
