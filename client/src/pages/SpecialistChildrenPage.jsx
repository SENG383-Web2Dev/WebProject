import { useAuth } from '../auth/useAuth.js'

/**
 * Specialist home workspace displaying the children actively linked to this specialist (M2).
 */
function SpecialistChildrenPage() {
  const { user } = useAuth()

  return (
    <section className="page-container">
      <div className="page-header">
        <div>
          <h1>My Children</h1>
          <p className="page-subtitle">Signed in as {user?.name}.</p>
        </div>
      </div>

      <div className="page-card">
        <h2>Linked Children</h2>
        <p className="card-text">Children linked to your specialist account will appear here.</p>
      </div>
    </section>
  )
}

export default SpecialistChildrenPage
