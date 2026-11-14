import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { DEVELOPMENT_AREAS, TOKEN_STORAGE_KEY } from '../api/client.js'
import TaskList from './TaskList.jsx'
import AssignTaskForm from './AssignTaskForm.jsx'

function jsonResponse(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
  })
}

// Same shape as GET /api/children/:childId/tasks (WEB-47)
const TASKS = [
  {
    id: 1,
    childId: 1,
    assignedBy: { id: 20, name: 'Mehmet Kaya' },
    title: 'Read for 20 minutes',
    description: 'Read a story book aloud',
    developmentArea: 'Language',
    dueDate: '2026-11-17',
    status: 'done',
    doneAt: '2026-11-17 15:00:00',
    createdAt: '2026-11-14 10:00:00',
  },
  {
    id: 2,
    childId: 1,
    assignedBy: { id: 10, name: 'Ayşe Demir' },
    title: 'Tie shoelaces',
    description: null,
    developmentArea: 'Self-care',
    dueDate: '2026-11-19',
    status: 'pending',
    doneAt: null,
    createdAt: '2026-11-14 10:00:00',
  },
]

beforeEach(() => {
  localStorage.setItem(TOKEN_STORAGE_KEY, 'test-jwt')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('TaskList for the parent and specialists (M4)', () => {
  it("shows every task of the child with area, due date, who assigned it and status (FR-M4-04)", async () => {
    const fetchMock = vi.fn(() => jsonResponse(TASKS))
    vi.stubGlobal('fetch', fetchMock)

    render(<TaskList childId={1} canAssign />)

    expect(screen.getByText('Loading tasks...')).toBeInTheDocument()
    const rows = await screen.findAllByRole('row')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/children/1/tasks')
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-jwt')

    // The first row is the header
    expect(rows).toHaveLength(3)
    expect(within(rows[1]).getByText('Read for 20 minutes')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Language')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Tue 17 Nov')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Mehmet Kaya')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Done')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Ayşe Demir')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Pending')).toBeInTheDocument()

    // Only the child marks tasks as done
    expect(screen.queryByRole('button', { name: 'Mark as done' })).not.toBeInTheDocument()
  })

  it('assigns a task and reloads the list (FR-M4-01)', async () => {
    const created = {
      ...TASKS[1],
      id: 3,
      title: 'Draw a family picture',
      developmentArea: 'Motor',
      dueDate: '2026-11-20',
    }
    let tasks = [...TASKS]
    const fetchMock = vi.fn((url, options = {}) => {
      if (options.method === 'POST') {
        tasks = [...tasks, created]
        return jsonResponse(created, 201)
      }
      return jsonResponse(tasks)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<TaskList childId={1} canAssign />)
    await screen.findByText('Tie shoelaces')

    fireEvent.click(screen.getByRole('button', { name: 'Assign task' }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '  Draw a family picture ' } })
    fireEvent.change(screen.getByLabelText('Description (optional)'), { target: { value: 'With crayons' } })
    fireEvent.change(screen.getByLabelText('Development area'), { target: { value: 'Motor' } })
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-11-20' } })
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }))

    expect(await screen.findByText('Draw a family picture')).toBeInTheDocument()
    const postCall = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST')
    expect(postCall[0]).toBe('/api/children/1/tasks')
    expect(JSON.parse(postCall[1].body)).toEqual({
      title: 'Draw a family picture',
      description: 'With crayons',
      developmentArea: 'Motor',
      dueDate: '2026-11-20',
    })
    // The form closes after saving
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument()
  })

  it('shows the server message when assigning fails and keeps the form open', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url, options = {}) =>
        options.method === 'POST'
          ? jsonResponse({ error: 'Due date is required.' }, 400)
          : jsonResponse([])
      )
    )

    render(<TaskList childId={1} canAssign />)
    expect(await screen.findByText('No tasks assigned yet.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Assign task' }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Read' } })
    fireEvent.change(screen.getByLabelText('Development area'), { target: { value: 'Language' } })
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Due date is required.')
    expect(screen.getByLabelText('Title')).toHaveValue('Read')
  })

  it('shows a clear message when the user has no access to the child', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ error: 'Forbidden.' }, 403)))

    render(<TaskList childId={1} canAssign />)

    expect(await screen.findByRole('alert')).toHaveTextContent("You do not have access to this child's tasks.")
  })
})

describe('TaskList for the child (M4)', () => {
  it('lists the tasks and marks a pending one as done (FR-M4-02, FR-M4-03)', async () => {
    const fetchMock = vi.fn((url, options = {}) => {
      if (options.method === 'PATCH') {
        return jsonResponse({ ...TASKS[1], status: 'done', doneAt: '2026-11-14 12:00:00' })
      }
      return jsonResponse(TASKS)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<TaskList childId={1} canMarkDone title="My Tasks" />)

    const items = await screen.findAllByRole('listitem')
    expect(screen.getByRole('heading', { name: 'My Tasks' })).toBeInTheDocument()
    expect(within(items[0]).getByText('Due Tue 17 Nov · Language')).toBeInTheDocument()
    expect(within(items[0]).getByText('✓ Done')).toBeInTheDocument()
    expect(within(items[1]).getByText('Due Thu 19 Nov · Self-care')).toBeInTheDocument()
    // The child cannot assign tasks
    expect(screen.queryByRole('button', { name: 'Assign task' })).not.toBeInTheDocument()

    fireEvent.click(within(items[1]).getByRole('button', { name: 'Mark as done' }))

    expect(await within(items[1]).findByText('✓ Done')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/tasks/2/done', expect.objectContaining({ method: 'PATCH' }))
    expect(screen.queryByRole('button', { name: 'Mark as done' })).not.toBeInTheDocument()
  })

  it('shows an error when marking a task as done fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url, options = {}) =>
        options.method === 'PATCH'
          ? jsonResponse({ error: 'You can only mark your own tasks as done.' }, 403)
          : jsonResponse([TASKS[1]])
      )
    )

    render(<TaskList childId={1} canMarkDone />)
    fireEvent.click(await screen.findByRole('button', { name: 'Mark as done' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('You can only mark your own tasks as done.')
    expect(screen.getByRole('button', { name: 'Mark as done' })).toBeEnabled()
  })

  it('shows a message when the child has no tasks', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse([])))

    render(<TaskList childId={1} canMarkDone />)

    expect(await screen.findByText('You have no tasks yet.')).toBeInTheDocument()
  })
})

describe('AssignTaskForm (M4)', () => {
  it('offers the development areas as a fixed list (FR-M4-06)', () => {
    render(<AssignTaskForm onSubmit={vi.fn()} onCancel={vi.fn()} />)

    const options = within(screen.getByLabelText('Development area')).getAllByRole('option')
    expect(options.map((option) => option.value)).toEqual(['', ...DEVELOPMENT_AREAS])
  })

  it('does not submit without a title, due date or development area (FR-M4-05)', () => {
    const onSubmit = vi.fn()
    render(<AssignTaskForm onSubmit={onSubmit} onCancel={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Assign' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Title is required.')

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Read' } })
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Due date is required.')

    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-11-20' } })
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a development area.')

    expect(onSubmit).not.toHaveBeenCalled()
  })
})
