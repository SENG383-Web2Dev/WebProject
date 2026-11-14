import { useEffect, useState } from 'react'
import { createTaskRequest, fetchChildTasksRequest, markTaskDoneRequest } from '../api/client.js'
import { formatDayLabel } from '../utils/week.js'
import AssignTaskForm from './AssignTaskForm.jsx'

const STATUS_LABELS = { pending: 'Pending', done: 'Done' }

/**
 * Tasks of one child (FR-M4-01 to FR-M4-04).
 * The parent and linked specialists (`canAssign`) see every task with its status and can assign new ones;
 * the child (`canMarkDone`) sees only their own tasks and marks them as done.
 */
function TaskList({ childId, canAssign = false, canMarkDone = false, title = 'Tasks' }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [markingId, setMarkingId] = useState(null)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    if (!childId) {
      return
    }
    let ignore = false

    async function loadTasks() {
      setLoading(true)
      setLoadError('')
      try {
        const data = await fetchChildTasksRequest(childId)
        if (!ignore) {
          setTasks(data)
        }
      } catch (error) {
        if (!ignore) {
          setTasks([])
          setLoadError(
            error.status === 403
              ? 'You do not have access to this child\'s tasks.'
              : error.message || 'Could not load the tasks.'
          )
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    loadTasks()
    return () => {
      ignore = true
    }
  }, [childId, reloadKey])

  async function handleAssign(values) {
    setSaving(true)
    setSaveError('')
    try {
      await createTaskRequest(childId, values)
      setShowForm(false)
      setReloadKey((key) => key + 1)
    } catch (error) {
      setSaveError(error.message || 'Could not assign the task.')
    } finally {
      setSaving(false)
    }
  }

  async function handleMarkDone(task) {
    setMarkingId(task.id)
    setActionError('')
    try {
      const updated = await markTaskDoneRequest(task.id)
      setTasks((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    } catch (error) {
      setActionError(error.message || 'Could not mark the task as done.')
    } finally {
      setMarkingId(null)
    }
  }

  function renderTasks() {
    if (loading) {
      return <p className="card-text">Loading tasks...</p>
    }
    if (loadError) {
      return (
        <p className="alert-error" role="alert">
          {loadError}
        </p>
      )
    }
    if (tasks.length === 0) {
      return <p className="card-text">{canMarkDone ? 'You have no tasks yet.' : 'No tasks assigned yet.'}</p>
    }

    // Child view (FR-M4-02, FR-M4-03): own tasks with a button to mark each one as done
    if (canMarkDone) {
      return (
        <ul className="task-list">
          {tasks.map((task) => {
            const isDone = task.status === 'done'
            return (
              <li key={task.id} className={isDone ? 'task task-done' : 'task'}>
                <div className="task-info">
                  <span className="task-title">{task.title}</span>
                  {task.description && <span className="task-description">{task.description}</span>}
                  <span className="task-meta">
                    Due {formatDayLabel(task.dueDate)} · {task.developmentArea}
                  </span>
                </div>
                {isDone ? (
                  <span className="task-status">✓ Done</span>
                ) : (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleMarkDone(task)}
                    disabled={markingId === task.id}
                  >
                    {markingId === task.id ? 'Saving...' : 'Mark as done'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )
    }

    // Parent and specialist view (FR-M4-04): every task of the child with who assigned it and its status
    return (
      <div className="table-wrapper">
        <table className="specialists-table task-table">
          <thead>
            <tr>
              <th scope="col">Title</th>
              <th scope="col">Area</th>
              <th scope="col">Due</th>
              <th scope="col">Assigned by</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id}>
                <td>
                  {task.title}
                  {task.description && <span className="task-description">{task.description}</span>}
                </td>
                <td className="task-nowrap">{task.developmentArea}</td>
                <td className="task-nowrap">{formatDayLabel(task.dueDate)}</td>
                <td>{task.assignedBy?.name ?? 'Unknown'}</td>
                <td className="task-nowrap">
                  <span className={`status-pill status-${task.status}`}>
                    {STATUS_LABELS[task.status] ?? task.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="task-section">
      <h2>{title}</h2>

      {canAssign && !showForm && (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            setSaveError('')
            setShowForm(true)
          }}
        >
          Assign task
        </button>
      )}

      {canAssign && showForm && (
        <AssignTaskForm
          submitting={saving}
          serverError={saveError}
          onSubmit={handleAssign}
          onCancel={() => setShowForm(false)}
        />
      )}

      {actionError && (
        <p className="alert-error" role="alert">
          {actionError}
        </p>
      )}

      {renderTasks()}
    </div>
  )
}

export default TaskList
