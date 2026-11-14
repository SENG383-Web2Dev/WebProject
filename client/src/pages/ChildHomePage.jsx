import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth.js'
import { fetchMeRequest } from '../api/client.js'
import WeeklySchedule from '../components/WeeklySchedule.jsx'
import TaskList from '../components/TaskList.jsx'

/**
 * Child home screen displaying only the child's own tasks and weekly schedule (FR-M1-05, FR-M3-03).
 */
function ChildHomePage() {
  const { user } = useAuth()
  const [childProfileId, setChildProfileId] = useState(user?.childProfileId ?? null)
  const [loadingProfile, setLoadingProfile] = useState(!user?.childProfileId)
  const [profileError, setProfileError] = useState('')

  // GET /api/auth/me returns the child's own profile id (SDD section 4)
  useEffect(() => {
    if (user?.childProfileId) {
      return
    }
    let ignore = false

    fetchMeRequest()
      .then((profile) => {
        if (!ignore) {
          setChildProfileId(profile?.childProfileId ?? null)
        }
      })
      .catch((error) => {
        if (!ignore) {
          setProfileError(error.message || 'Could not load your profile.')
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoadingProfile(false)
        }
      })

    return () => {
      ignore = true
    }
  }, [user?.childProfileId])

  return (
    <section className="page-container">
      <div className="page-header">
        <div>
          <h1>My Week</h1>
          <p className="page-subtitle">Hi, {user?.name}. Here is your plan for the week.</p>
        </div>
      </div>

      <div className="page-card">
        {loadingProfile ? (
          <p className="card-text">Loading...</p>
        ) : profileError ? (
          <p className="alert-error" role="alert">
            {profileError}
          </p>
        ) : childProfileId ? (
          <WeeklySchedule childId={childProfileId} currentUserId={user?.id} canEdit={false} />
        ) : (
          <>
            <h2>Weekly Schedule</h2>
            <p className="card-text">Your schedule is not available yet.</p>
          </>
        )}
      </div>

      <div className="page-card">
        {loadingProfile ? (
          <p className="card-text">Loading...</p>
        ) : childProfileId ? (
          <TaskList childId={childProfileId} canMarkDone title="My Tasks" />
        ) : (
          <>
            <h2>My Tasks</h2>
            <p className="card-text">Your tasks are not available yet.</p>
          </>
        )}
      </div>
    </section>
  )
}

export default ChildHomePage
