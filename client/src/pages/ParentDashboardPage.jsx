import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'

/**
 * Parent home workspace showing child schedule, tasks, observations, and specialist link shortcut.
 */
function ParentDashboardPage() {
  const { user } = useAuth()

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

      <div className="card-grid">
        <div className="page-card">
          <h2>Weekly Schedule</h2>
          <p className="card-text">View and manage your child&apos;s weekly calendar events.</p>
        </div>
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
