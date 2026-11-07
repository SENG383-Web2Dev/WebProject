import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
import TaskList from './TaskList.jsx'

// Same shape as the WEB-30 response; the first task is marked as done.
const sampleTasks = [
  { id: 1, title: 'Set up the development environment', done: 1, created_at: '2026-11-07 12:23:20' },
  { id: 2, title: 'Read the SRS document', done: 0, created_at: '2026-11-07 12:23:20' },
  { id: 3, title: 'Try the health endpoint at GET /api/health', done: 0, created_at: '2026-11-07 12:23:20' },
]

function mockFetch(response) {
  const fetchMock = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('TaskList', () => {
  it('shows a loading message before the tasks arrive', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    render(<TaskList />)
    expect(screen.getByText('Loading tasks...')).toBeInTheDocument()
  })

  it('shows the tasks returned by GET /api/tasks', async () => {
    const fetchMock = mockFetch({ ok: true, json: async () => sampleTasks })
    render(<TaskList />)

    const items = await screen.findAllByRole('listitem')
    expect(fetchMock).toHaveBeenCalledWith('/api/tasks')
    expect(items).toHaveLength(3)
    expect(within(items[0]).getByText('Set up the development environment')).toBeInTheDocument()
    expect(within(items[1]).getByText('Read the SRS document')).toBeInTheDocument()
  })

  it('shows "Done" for done = 1 and "To do" for done = 0', async () => {
    mockFetch({ ok: true, json: async () => sampleTasks })
    render(<TaskList />)

    const items = await screen.findAllByRole('listitem')
    expect(within(items[0]).getByText('Done')).toBeInTheDocument()
    expect(within(items[1]).getByText('To do')).toBeInTheDocument()
    expect(items[1].textContent).not.toContain('0')
  })

  it('shows an error message when the request fails', async () => {
    mockFetch({ ok: false, status: 500, json: async () => ({ error: 'Failed to fetch tasks' }) })
    render(<TaskList />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the tasks')
  })

  it('shows a message when there are no tasks', async () => {
    mockFetch({ ok: true, json: async () => [] })
    render(<TaskList />)

    expect(await screen.findByText('No tasks yet.')).toBeInTheDocument()
  })
})
