import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { TOKEN_STORAGE_KEY } from '../api/client.js'
import { getWeekStart, addDays, getWeekDays } from '../utils/week.js'
import WeeklySchedule from './WeeklySchedule.jsx'
import EventForm from './EventForm.jsx'

function jsonResponse(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
  })
}

const WEEK = '2026-11-09'
const EVENTS = [
  { id: 1, childId: 1, createdBy: 10, title: 'Swimming', startTime: '2026-11-10T14:00', endTime: '2026-11-10T15:00' },
  { id: 2, childId: 1, createdBy: 20, title: 'Speech therapy', startTime: '2026-11-12T10:00', endTime: '2026-11-12T11:00' },
]

beforeEach(() => {
  localStorage.setItem(TOKEN_STORAGE_KEY, 'test-jwt')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('week helpers', () => {
  it('finds the Monday of a week', () => {
    expect(getWeekStart(new Date(2026, 10, 12))).toBe('2026-11-09') // Thursday
    expect(getWeekStart(new Date(2026, 10, 9))).toBe('2026-11-09') // Monday
    expect(getWeekStart(new Date(2026, 10, 15))).toBe('2026-11-09') // Sunday
  })

  it('moves between weeks and lists seven days', () => {
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04')
    expect(getWeekDays(WEEK)).toEqual([
      '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15',
    ])
  })
})

describe('WeeklySchedule (M3)', () => {
  it('loads the selected week and shows events under their day (FR-M3-02)', async () => {
    const fetchMock = vi.fn(() => jsonResponse(EVENTS))
    vi.stubGlobal('fetch', fetchMock)

    render(<WeeklySchedule childId={1} currentUserId={10} canEdit initialWeek={WEEK} />)

    expect(await screen.findByText('Swimming')).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/children/1/events?week=2026-11-09')
    const tuesday = screen.getByRole('region', { name: /Tue 10 Nov/ })
    expect(within(tuesday).getByText('14:00–15:00')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /Thu 12 Nov/ })).toHaveTextContent('Speech therapy')
  })

  it('shows Edit and Delete only on the current user\'s own events (FR-M3-05)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse(EVENTS)))
    render(<WeeklySchedule childId={1} currentUserId={10} canEdit initialWeek={WEEK} />)

    await screen.findByText('Swimming')
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1)
    expect(within(screen.getByRole('region', { name: /Thu 12 Nov/ })).queryByRole('button', { name: 'Edit' })).toBeNull()
  })

  it('is read-only for the child (FR-M3-03)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse(EVENTS)))
    render(<WeeklySchedule childId={1} currentUserId={30} canEdit={false} initialWeek={WEEK} />)

    await screen.findByText('Swimming')
    expect(screen.queryByRole('button', { name: 'Add event' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  })

  it('goes to the next week', async () => {
    const fetchMock = vi.fn(() => jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)
    render(<WeeklySchedule childId={1} currentUserId={10} canEdit initialWeek={WEEK} />)

    await screen.findAllByText('No events')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findAllByText('No events')
    expect(fetchMock.mock.calls.at(-1)[0]).toBe('/api/children/1/events?week=2026-11-16')
  })

  it('adds an event with POST and reloads the week (FR-M3-01)', async () => {
    const fetchMock = vi.fn((url, options = {}) =>
      options.method === 'POST' ? jsonResponse({ id: 3 }, 201) : jsonResponse([])
    )
    vi.stubGlobal('fetch', fetchMock)
    render(<WeeklySchedule childId={1} currentUserId={10} canEdit initialWeek={WEEK} />)

    await screen.findAllByText('No events')
    fireEvent.click(screen.getByRole('button', { name: 'Add event' }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Piano' } })
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-11' } })
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '17:00' } })
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '18:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await screen.findByRole('button', { name: 'Add event' })
    const post = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST')
    expect(post[0]).toBe('/api/children/1/events')
    expect(JSON.parse(post[1].body)).toEqual({ title: 'Piano', startTime: '2026-11-11T17:00', endTime: '2026-11-11T18:00' })
    expect(fetchMock.mock.calls.filter(([, options]) => !options?.method || options.method === 'GET').length).toBeGreaterThanOrEqual(2)
  })

  it('deletes an own event after confirmation', async () => {
    const fetchMock = vi.fn((url, options = {}) =>
      options.method === 'DELETE' ? Promise.resolve({ ok: true, status: 204 }) : jsonResponse(EVENTS)
    )
    vi.stubGlobal('fetch', fetchMock)
    render(<WeeklySchedule childId={1} currentUserId={10} canEdit initialWeek={WEEK} />)

    await screen.findByText('Swimming')
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' }))

    await screen.findByText('Swimming')
    expect(fetchMock.mock.calls.some(([url, options]) => url === '/api/events/1' && options?.method === 'DELETE')).toBe(true)
  })

  it('shows an access message on 403', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ error: 'You do not have access to this child.' }, 403)))
    render(<WeeklySchedule childId={1} currentUserId={10} canEdit initialWeek={WEEK} />)

    expect(await screen.findByRole('alert')).toHaveTextContent("You do not have access to this child's schedule.")
  })
})

describe('EventForm', () => {
  it('rejects an end time that is not after the start time (FR-M3-04)', () => {
    const onSubmit = vi.fn()
    render(<EventForm defaultDate={WEEK} onSubmit={onSubmit} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Swimming' } })
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '15:00' } })
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '14:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByRole('alert')).toHaveTextContent('End time must be after start time.')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('requires a title', () => {
    const onSubmit = vi.fn()
    render(<EventForm defaultDate={WEEK} onSubmit={onSubmit} onCancel={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Title is required.')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('fills in the values of an event being edited', () => {
    render(<EventForm initialEvent={EVENTS[0]} defaultDate={WEEK} onSubmit={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Edit event' })).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('Swimming')
    expect(screen.getByLabelText('Date')).toHaveValue('2026-11-10')
    expect(screen.getByLabelText('Start time')).toHaveValue('14:00')
  })
})
