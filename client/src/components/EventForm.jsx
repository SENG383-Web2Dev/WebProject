import { useState } from 'react'

/**
 * Form for adding or editing an event (FR-M3-01, FR-M3-04, FR-M3-05).
 * `initialEvent` fills the form when editing; `onSubmit` receives { title, startTime, endTime }.
 */
function EventForm({ initialEvent = null, defaultDate, submitting = false, serverError = '', onSubmit, onCancel }) {
  const [title, setTitle] = useState(initialEvent?.title ?? '')
  const [date, setDate] = useState(initialEvent?.startTime.slice(0, 10) ?? defaultDate)
  const [startTime, setStartTime] = useState(initialEvent?.startTime.slice(11, 16) ?? '09:00')
  const [endTime, setEndTime] = useState(initialEvent?.endTime.slice(11, 16) ?? '10:00')
  const [formError, setFormError] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    if (!title.trim()) {
      setFormError('Title is required.')
      return
    }
    if (!date || !startTime || !endTime) {
      setFormError('Date, start time and end time are required.')
      return
    }
    if (endTime <= startTime) {
      setFormError('End time must be after start time.')
      return
    }
    setFormError('')
    onSubmit({
      title: title.trim(),
      startTime: `${date}T${startTime}`,
      endTime: `${date}T${endTime}`,
    })
  }

  const error = formError || serverError

  return (
    <form className="event-form" onSubmit={handleSubmit} noValidate>
      <h3>{initialEvent ? 'Edit event' : 'Add event'}</h3>

      <div className="form-field">
        <label htmlFor="event-title">Title</label>
        <input id="event-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div className="event-form-row">
        <div className="form-field">
          <label htmlFor="event-date">Date</label>
          <input id="event-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="form-field">
          <label htmlFor="event-start">Start time</label>
          <input id="event-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div className="form-field">
          <label htmlFor="event-end">End time</label>
          <input id="event-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
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
          {submitting ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  )
}

export default EventForm
