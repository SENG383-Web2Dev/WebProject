import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'
import { fetchParentChildrenRequest } from '../api/client.js'
import WeeklySchedule from '../components/WeeklySchedule.jsx'

/**
 * Parent home workspace showing child schedule, tasks, observations, and specialist link shortcut.
 */
function ParentDashboardPage() {
  const { user } = useAuth()
  const [children, setChildren] = useState([])
  const [selectedChildId, setSelectedChildId] = useState(null)
  const [loadingChildren, setLoadingChildren] = useState(true)
  const [childrenError, setChildrenError] = useState('')

  useEffect(() => {
    let ignore = false

    async function loadChildren() {
      setLoadingChildren(true)
      setChildrenError('')
      try {
        const data = await fetchParentChildrenRequest()
        if (!ignore) {
          setChildren(data)
          setSelectedChildId(data[0]?.id ?? null)
        }
      } catch (error) {
        if (!ignore) {
          setChildrenError(error.message || 'Could not load children.')
        }
      } finally {
        if (!ignore) {
          setLoadingChildren(false)
        }
      }
    }

    loadChildren()
    return () => {
      ignore = true
    }
  }, [])

  return (
    <section className="page-container">
      <div className="page-header">
        <div>
          <h1>Parent Dashboard</h1>
          <p className="page-subtitle">Welcome back, {user?.name}.</p>
        </div>
        <Link to="/parent/specialists" className="btn-secondary">
          Manage specialists
        </Link>
      </div>

      {childrenError && (
        <p className="alert-error" role="alert">
          {childrenError}
        </p>
      )}

      {children.length > 1 && (
        <div className="child-switcher">
          <label htmlFor="dashboard-child-select">Child</label>
          <select
            id="dashboard-child-select"
            value={selectedChildId ?? ''}
            onChange={(event) => setSelectedChildId(Number(event.target.value))}
          >
            {children.map((child) => (
              <option key={child.id} value={child.id}>
                {child.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="page-card">
        {loadingChildren ? (
          <p className="card-text">Loading...</p>
        ) : selectedChildId ? (
          <WeeklySchedule key={selectedChildId} childId={selectedChildId} currentUserId={user?.id} canEdit />
        ) : (
          <>
            <h2>Weekly Schedule</h2>
            <p className="card-text">No child profile is linked to your account yet.</p>
          </>
        )}
      </div>

      <div className="card-grid">
        <div className="page-card">
          <h2>Tasks</h2>
          <p className="card-text">Assign daily tasks and follow completion status.</p>
        </div>
        <div className="page-card">
          <h2>Linked Specialists</h2>
          <p className="card-text">
            Link registered specialists to collaborate on your child&apos;s progress.
          </p>
        </div>
      </div>
    </section>
  )
}

export default ParentDashboardPage
