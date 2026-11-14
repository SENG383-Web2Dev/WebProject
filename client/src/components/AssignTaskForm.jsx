import { useState } from 'react'
import { DEVELOPMENT_AREAS } from '../api/client.js'
import { toDateString } from '../utils/week.js'

/**
 * Form for assigning a task to a child (FR-M4-01, FR-M4-05, FR-M4-06).
 * `onSubmit` receives { title, description, developmentArea, dueDate }.
 */
function AssignTaskForm({ submitting = false, serverError = '', onSubmit, onCancel }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [developmentArea, setDevelopmentArea] = useState('')
  const [dueDate, setDueDate] = useState(() => toDateString(new Date()))
  const [formError, setFormError] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    // The server checks the same rules and answers 400 (FR-M4-05); checking here saves a request
    if (!title.trim()) {
      setFormError('Title is required.')
      return
    }
    if (!dueDate) {
      setFormError('Due date is required.')
      return
    }
    if (!developmentArea) {
      setFormError('Choose a development area.')
      return
    }
    setFormError('')
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      developmentArea,
      dueDate,
    })
  }

  const error = formError || serverError

  return (
    <form className="event-form" onSubmit={handleSubmit} noValidate>
      <h3>Assign task</h3>

      <div className="form-field">
        <label htmlFor="task-title">Title</label>
        <input id="task-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div className="form-field">
        <label htmlFor="task-description">Description (optional)</label>
        <textarea
          id="task-description"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="event-form-row">
        <div className="form-field">
          <label htmlFor="task-area">Development area</label>
          <select id="task-area" value={developmentArea} onChange={(e) => setDevelopmentArea(e.target.value)}>
            <option value="">Choose an area</option>
            {DEVELOPMENT_AREAS.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="task-due">Due date</label>
          <input id="task-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>

      {error && (
        <p className="alert-error" role="alert">
          {error}
        </p>
      )}

      <div className="event-form-actions">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Assigning...' : 'Assign'}
        </button>
      </div>
    </form>
  )
}

export default AssignTaskForm
