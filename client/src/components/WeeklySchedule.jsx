import { useEffect, useState } from 'react'
import {
  createEventRequest,
  deleteEventRequest,
  fetchChildEventsRequest,
  updateEventRequest,
} from '../api/client.js'
import { addDays, formatDayLabel, formatWeekRange, getWeekDays, getWeekStart } from '../utils/week.js'
import EventForm from './EventForm.jsx'

/**
 * Weekly schedule of one child (FR-M3-01 to FR-M3-05).
 * The parent and linked specialists can add events and edit or delete their own; the child only views.
 */
function WeeklySchedule({ childId, currentUserId, canEdit = false, initialWeek }) {
  const [week, setWeek] = useState(() => initialWeek || getWeekStart())
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  // null = no form, 'new' = add form, an event object = edit form
  const [formTarget, setFormTarget] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [pendingDelete, setPendingDelete] = useState(null)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    if (!childId) {
      return
    }
    let ignore = false

    async function loadEvents() {
      setLoading(true)
      setLoadError('')
      try {
        const data = await fetchChildEventsRequest(childId, week)
        if (!ignore) {
          setEvents(data)
        }
      } catch (error) {
        if (!ignore) {
          setEvents([])
          setLoadError(
            error.status === 403
              ? 'You do not have access to this child\'s schedule.'
              : error.message || 'Could not load the schedule.'
          )
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    loadEvents()
    return () => {
      ignore = true
    }
  }, [childId, week, reloadKey])

  function changeWeek(newWeek) {
    setWeek(newWeek)
    setFormTarget(null)
    setPendingDelete(null)
    setActionError('')
  }

  async function handleSave(values) {
    setSaving(true)
    setSaveError('')
    try {
      if (formTarget === 'new') {
        await createEventRequest(childId, values)
      } else {
        await updateEventRequest(formTarget.id, values)
      }
      setFormTarget(null)
      setReloadKey((key) => key + 1)
    } catch (error) {
      setSaveError(error.message || 'Could not save the event.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(event) {
    setActionError('')
    try {
      await deleteEventRequest(event.id)
      setPendingDelete(null)
      setReloadKey((key) => key + 1)
    } catch (error) {
      setActionError(error.message || 'Could not delete the event.')
    }
  }

  const days = getWeekDays(week)

  return (
    <div className="weekly-schedule">
      <div className="page-header">
        <h2>Weekly Schedule</h2>
        <div className="week-nav">
          <button type="button" className="btn-secondary" onClick={() => changeWeek(addDays(week, -7))}>
            Previous
          </button>
          <button type="button" className="btn-secondary" onClick={() => changeWeek(getWeekStart())}>
            This week
          </button>
          <button type="button" className="btn-secondary" onClick={() => changeWeek(addDays(week, 7))}>
            Next
          </button>
        </div>
      </div>

      <p className="week-range" aria-live="polite">
        {formatWeekRange(week)}
      </p>

      {canEdit && formTarget === null && (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            setSaveError('')
            setFormTarget('new')
          }}
        >
          Add event
        </button>
      )}

      {canEdit && formTarget !== null && (
        <EventForm
          key={formTarget === 'new' ? 'new' : formTarget.id}
          initialEvent={formTarget === 'new' ? null : formTarget}
          defaultDate={week}
          submitting={saving}
          serverError={saveError}
          onSubmit={handleSave}
          onCancel={() => setFormTarget(null)}
        />
      )}

      {actionError && (
        <p className="alert-error" role="alert">
          {actionError}
        </p>
      )}

      {loading ? (
        <p className="card-text">Loading schedule...</p>
      ) : loadError ? (
        <p className="alert-error" role="alert">
          {loadError}
        </p>
      ) : (
        <div className="week-grid">
          {days.map((day) => {
            const dayEvents = events.filter((event) => event.startTime.startsWith(day))
            return (
              <section key={day} className="week-day" aria-label={formatDayLabel(day)}>
                <h3 className="week-day-title">{formatDayLabel(day)}</h3>
                {dayEvents.length === 0 ? (
                  <p className="week-day-empty">No events</p>
                ) : (
                  <ul className="event-list">
                    {dayEvents.map((event) => {
                      const isOwn = canEdit && event.createdBy === currentUserId
                      return (
                        <li key={event.id} className="event-item">
                          <span className="event-time">
                            {event.startTime.slice(11, 16)}–{event.endTime.slice(11, 16)}
                          </span>
                          <span className="event-title">{event.title}</span>
                          {isOwn && pendingDelete?.id !== event.id && (
                            <span className="event-actions">
                              <button
                                type="button"
                                className="link-button"
                                onClick={() => {
                                  setSaveError('')
                                  setFormTarget(event)
                                }}
                              >
                                Edit
                              </button>
                              <button type="button" className="link-button" onClick={() => setPendingDelete(event)}>
                                Delete
                              </button>
                            </span>
                          )}
                          {isOwn && pendingDelete?.id === event.id && (
                            <span className="event-actions">
                              <span>Delete this event?</span>
                              <button type="button" className="link-button" onClick={() => handleDelete(event)}>
                                Yes, delete
                              </button>
                              <button type="button" className="link-button" onClick={() => setPendingDelete(null)}>
                                Cancel
                              </button>
                            </span>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default WeeklySchedule
