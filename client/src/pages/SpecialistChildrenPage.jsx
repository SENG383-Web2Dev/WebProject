import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth.js'
import { fetchChildProfileRequest, fetchSpecialistChildrenRequest } from '../api/client.js'

/**
 * Specialist home workspace displaying the children actively linked to this specialist (FR-M2-05, FR-M2-06).
 */
function SpecialistChildrenPage() {
  const { user } = useAuth()
  const [children, setChildren] = useState([])
  const [selectedChildId, setSelectedChildId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')

  const [childProfile, setChildProfile] = useState(null)
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [accessError, setAccessError] = useState('')

  useEffect(() => {
    let ignore = false

    async function loadLinkedChildren() {
      setLoading(true)
      setListError('')
      try {
        const data = await fetchSpecialistChildrenRequest()
        if (!ignore) {
          setChildren(data)
          setSelectedChildId(data[0]?.id ?? null)
        }
      } catch (error) {
        if (!ignore) {
          setListError(error.message || 'Could not load linked children.')
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    loadLinkedChildren()
    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    if (!selectedChildId) {
      return
    }

    let ignore = false

    async function loadChildProfile() {
      setLoadingProfile(true)
      setAccessError('')
      try {
        const profile = await fetchChildProfileRequest(selectedChildId)
        if (!ignore) {
          setChildProfile(profile)
        }
      } catch (error) {
        if (!ignore) {
          setChildProfile(null)
          if (error.status === 403) {
            setAccessError('You no longer have access to this child.')
          } else {
            setAccessError(error.message || 'Could not load child profile.')
          }
        }
      } finally {
        if (!ignore) {
          setLoadingProfile(false)
        }
      }
    }

    loadChildProfile()
    return () => {
      ignore = true
    }
  }, [selectedChildId])

  const selectedSummary = children.find((child) => child.id === selectedChildId) || null

  return (
    <section className="page-container">
      <div className="page-header">
        <div>
          <h1>My Children</h1>
          <p className="page-subtitle">Signed in as {user?.name}.</p>
        </div>
      </div>

      {listError && (
        <p className="alert-error" role="alert">
          {listError}
        </p>
      )}

      {loading ? (
        <div className="page-card">
          <p className="card-text">Loading linked children...</p>
        </div>
      ) : children.length === 0 ? (
        <div className="page-card">
          <h2>Linked Children</h2>
          <p className="card-text">No children are currently linked to your account.</p>
        </div>
      ) : (
        <div className="specialist-layout">
          <aside className="page-card child-sidebar" aria-label="Linked children">
            <h2>Linked Children</h2>
            <ul className="child-list">
              {children.map((child) => {
                const isSelected = child.id === selectedChildId
                return (
                  <li key={child.id}>
                    <button
                      type="button"
                      className={
                        isSelected
                          ? 'child-select-btn child-select-btn-active'
                          : 'child-select-btn'
                      }
                      aria-pressed={isSelected}
                      onClick={() => {
                        setAccessError('')
                        setSelectedChildId(child.id)
                      }}
                    >
                      <span className="child-select-name">{child.name}</span>
                      <span className="child-select-meta">
                        {child.specialistType} · Parent: {child.parentName}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </aside>

          <div className="page-card">
            {accessError ? (
              <p className="alert-error" role="alert">
                {accessError}
              </p>
            ) : loadingProfile ? (
              <p className="card-text">Loading child workspace...</p>
            ) : selectedSummary ? (
              <>
                <div className="page-header">
                  <h2>{childProfile?.name || selectedSummary.name}</h2>
                  <span className="role-pill">{selectedSummary.specialistType}</span>
                </div>
                <div className="child-detail-meta">
                  <span>Parent: {selectedSummary.parentName}</span>
                  {(childProfile?.birthDate || selectedSummary.birthDate) && (
                    <span>Birth date: {childProfile?.birthDate || selectedSummary.birthDate}</span>
                  )}
                </div>
                <p className="card-text">
                  Schedule, tasks, observations, and documents for this child will appear here.
                </p>
              </>
            ) : null}
          </div>
        </div>
      )}
    </section>
  )
}

export default SpecialistChildrenPage
