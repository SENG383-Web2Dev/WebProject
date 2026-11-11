import { useAuth } from '../auth/useAuth.js'

/**
 * Child home screen displaying only the child's own tasks and weekly schedule (FR-M1-05).
 */
function ChildHomePage() {
  const { user } = useAuth()

  return (
    <section className="page-container">
      <div className="page-header">
        <div>
          <h1>My Week</h1>
          <p className="page-subtitle">Hi, {user?.name}. Here is your plan for the week.</p>
        </div>
      </div>

      <div className="card-grid">
        <div className="page-card">
          <h2>My Tasks</h2>
          <p className="card-text">Your assigned tasks will appear here.</p>
        </div>
        <div className="page-card">
          <h2>Weekly Schedule</h2>
          <p className="card-text">Your upcoming events will appear here.</p>
        </div>
      </div>
    </section>
  )
}

export default ChildHomePage
