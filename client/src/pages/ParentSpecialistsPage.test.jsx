import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TOKEN_STORAGE_KEY } from '../api/client.js'
import ParentSpecialistsPage from './ParentSpecialistsPage.jsx'

function jsonResponse(body, status = 200) {
  if (status === 204) {
    return Promise.resolve({
      ok: true,
      status: 204,
      headers: { get: () => '' },
    })
  }
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
  })
}

const SAMPLE_CHILDREN = [
  { id: 1, parentId: 1, childAccountId: 5, name: 'Deniz Demir', birthDate: '2018-05-14' },
]

const SAMPLE_SPECIALISTS = [
  {
    id: 1,
    childId: 1,
    specialistId: 2,
    name: 'Mehmet Kaya',
    email: 'mehmet.kaya@example.com',
    specialistType: 'Teacher',
    active: true,
  },
  {
    id: 2,
    childId: 1,
    specialistId: 3,
    name: 'Zeynep Arslan',
    email: 'zeynep.arslan@example.com',
    specialistType: 'Psychologist',
    active: true,
  },
]

function renderPage() {
  return render(
    <MemoryRouter>
      <ParentSpecialistsPage />
    </MemoryRouter>
  )
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, 'parent-jwt')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('ParentSpecialistsPage (FR-M2-01..04)', () => {
  it('loads the parent child heading and linked specialists list (FR-M2-03)', async () => {
    const fetchMock = vi.fn((url) => {
      if (url === '/api/children') {
        return jsonResponse(SAMPLE_CHILDREN)
      }
      if (url === '/api/children/1/specialists') {
        return jsonResponse(SAMPLE_SPECIALISTS)
      }
      return jsonResponse({ error: 'Not found.' }, 404)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Specialists of Deniz Demir' })).toBeInTheDocument()
    expect(await screen.findByText('Mehmet Kaya')).toBeInTheDocument()
    expect(screen.getByText('mehmet.kaya@example.com')).toBeInTheDocument()
    expect(screen.getByText('Zeynep Arslan')).toBeInTheDocument()
    expect(screen.getByText('zeynep.arslan@example.com')).toBeInTheDocument()
  })

  it('validates empty email client-side without calling the API', async () => {
    const fetchMock = vi.fn((url) => {
      if (url === '/api/children') {
        return jsonResponse(SAMPLE_CHILDREN)
      }
      if (url === '/api/children/1/specialists') {
        return jsonResponse([])
      }
      return jsonResponse({ error: 'Not found.' }, 404)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    expect(await screen.findByText('No specialists linked yet.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Link' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Specialist email is required.')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('links a registered specialist by email and type and updates the list (FR-M2-01)', async () => {
    const newLink = {
      id: 3,
      childId: 1,
      specialistId: 4,
      name: 'Selin Öz',
      email: 'selin.oz@example.com',
      specialistType: 'Doctor',
      active: true,
    }

    const fetchMock = vi.fn((url, options = {}) => {
      if (url === '/api/children') {
        return jsonResponse(SAMPLE_CHILDREN)
      }
      if (url === '/api/children/1/specialists' && (!options.method || options.method === 'GET')) {
        return jsonResponse(SAMPLE_SPECIALISTS)
      }
      if (url === '/api/children/1/specialists' && options.method === 'POST') {
        return jsonResponse(newLink, 201)
      }
      return jsonResponse({ error: 'Not found.' }, 404)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    expect(await screen.findByText('Mehmet Kaya')).toBeInTheDocument()

    const emailInput = screen.getByLabelText("Specialist's email")
    const typeSelect = screen.getByLabelText('Type')

    fireEvent.change(emailInput, { target: { value: 'selin.oz@example.com' } })
    fireEvent.change(typeSelect, { target: { value: 'Doctor' } })
    fireEvent.click(screen.getByRole('button', { name: 'Link' }))

    expect(await screen.findByText('Selin Öz')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Selin Öz linked as Doctor.')
    expect(emailInput).toHaveValue('')

    const postCall = fetchMock.mock.calls.find(
      ([url, opts]) => url === '/api/children/1/specialists' && opts?.method === 'POST'
    )
    expect(postCall[1].headers.Authorization).toBe('Bearer parent-jwt')
    expect(JSON.parse(postCall[1].body)).toEqual({
      email: 'selin.oz@example.com',
      specialistType: 'Doctor',
    })
  })

  it('shows the API error message when the email is not a registered specialist (FR-M2-02)', async () => {
    const fetchMock = vi.fn((url, options = {}) => {
      if (url === '/api/children') {
        return jsonResponse(SAMPLE_CHILDREN)
      }
      if (url === '/api/children/1/specialists' && (!options.method || options.method === 'GET')) {
        return jsonResponse(SAMPLE_SPECIALISTS)
      }
      if (url === '/api/children/1/specialists' && options.method === 'POST') {
        return jsonResponse({ error: 'No registered specialist with this email.' }, 404)
      }
      return jsonResponse({ error: 'Not found.' }, 404)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    expect(await screen.findByText('Mehmet Kaya')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Specialist's email"), {
      target: { value: 'unknown@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Link' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No registered specialist with this email.'
    )
  })

  it('asks for confirmation before unlinking and removes the specialist when confirmed (FR-M2-04)', async () => {
    const fetchMock = vi.fn((url, options = {}) => {
      if (url === '/api/children') {
        return jsonResponse(SAMPLE_CHILDREN)
      }
      if (url === '/api/children/1/specialists' && (!options.method || options.method === 'GET')) {
        return jsonResponse(SAMPLE_SPECIALISTS)
      }
      if (url === '/api/children/1/specialists/3' && options.method === 'DELETE') {
        return jsonResponse(null, 204)
      }
      return jsonResponse({ error: 'Not found.' }, 404)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    expect(await screen.findByText('Zeynep Arslan')).toBeInTheDocument()

    // Click Unlink on Zeynep Arslan -> confirmation modal opens without sending DELETE yet
    fireEvent.click(screen.getByRole('button', { name: 'Unlink Zeynep Arslan' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Unlink Zeynep Arslan?' })).toBeInTheDocument()
    expect(
      screen.getByText("This specialist will no longer have access to any of Deniz Demir's records.")
    ).toBeInTheDocument()

    // Cancelling closes the dialog and preserves the specialist row
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Zeynep Arslan')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([, opts]) => opts?.method === 'DELETE')).toBe(false)

    // Re-open confirmation and confirm Unlink -> sends DELETE and removes row
    fireEvent.click(screen.getByRole('button', { name: 'Unlink Zeynep Arslan' }))
    const dialog = screen.getByRole('dialog')
    const confirmButton = dialog.querySelector('.modal-actions .btn-primary')
    fireEvent.click(confirmButton)

    await waitFor(() => {
      expect(screen.queryByText('Zeynep Arslan')).not.toBeInTheDocument()
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Mehmet Kaya')).toBeInTheDocument()

    const deleteCall = fetchMock.mock.calls.find(
      ([url, opts]) => url === '/api/children/1/specialists/3' && opts?.method === 'DELETE'
    )
    expect(deleteCall).toBeDefined()
    expect(deleteCall[1].headers.Authorization).toBe('Bearer parent-jwt')
  })

  it('supports switching between multiple children belonging to the parent', async () => {
    const multipleChildren = [
      { id: 1, parentId: 1, childAccountId: 5, name: 'Deniz Demir', birthDate: '2018-05-14' },
      { id: 2, parentId: 1, childAccountId: null, name: 'Ege Demir', birthDate: '2021-01-10' },
    ]

    const fetchMock = vi.fn((url) => {
      if (url === '/api/children') {
        return jsonResponse(multipleChildren)
      }
      if (url === '/api/children/1/specialists') {
        return jsonResponse([SAMPLE_SPECIALISTS[0]])
      }
      if (url === '/api/children/2/specialists') {
        return jsonResponse([SAMPLE_SPECIALISTS[1]])
      }
      return jsonResponse({ error: 'Not found.' }, 404)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()
    expect(await screen.findByText('Mehmet Kaya')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Child'), { target: { value: '2' } })

    expect(await screen.findByRole('heading', { name: 'Specialists of Ege Demir' })).toBeInTheDocument()
    expect(await screen.findByText('Zeynep Arslan')).toBeInTheDocument()
    expect(screen.queryByText('Mehmet Kaya')).not.toBeInTheDocument()
  })
})
