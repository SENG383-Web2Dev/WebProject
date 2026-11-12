import { useEffect, useState } from 'react'
import {
  SPECIALIST_TYPES,
  fetchChildSpecialistsRequest,
  fetchParentChildrenRequest,
  linkSpecialistRequest,
  unlinkSpecialistRequest,
} from '../api/client.js'

function UnlinkConfirmDialog({ specialist, childName, unlinking, onCancel, onConfirm }) {
  if (!specialist) {
    return null
  }

  return (
    <div className="modal-backdrop">
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unlink-dialog-title"
      >
        <h2 id="unlink-dialog-title">Unlink {specialist.name}?</h2>
        <p className="card-text">
          This specialist will no longer have access to any of {childName}&apos;s records.
        </p>
        <div className="modal-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
            disabled={unlinking}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={onConfirm}
            disabled={unlinking}
          >
            {unlinking ? 'Unlinking...' : 'Unlink'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Parent screen for linking and unlinking specialists (FR-M2-01..04).
 */
function ParentSpecialistsPage() {
  const [children, setChildren] = useState([])
  const [selectedChildId, setSelectedChildId] = useState(null)
  const [loadingChildren, setLoadingChildren] = useState(true)
  const [childrenError, setChildrenError] = useState('')

  const [specialists, setSpecialists] = useState([])
  const [loadingSpecialists, setLoadingSpecialists] = useState(false)
  const [listError, setListError] = useState('')

  const [email, setEmail] = useState('')
  const [specialistType, setSpecialistType] = useState(SPECIALIST_TYPES[0])
  const [formError, setFormError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [pendingUnlink, setPendingUnlink] = useState(null)
  const [unlinking, setUnlinking] = useState(false)

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

  useEffect(() => {
    if (!selectedChildId) {
      return
    }

    let ignore = false

    async function loadSpecialists() {
      setLoadingSpecialists(true)
      setListError('')
      try {
        const data = await fetchChildSpecialistsRequest(selectedChildId)
        if (!ignore) {
          setSpecialists(data)
        }
      } catch (error) {
        if (!ignore) {
          setListError(error.message || 'Could not load linked specialists.')
        }
      } finally {
        if (!ignore) {
          setLoadingSpecialists(false)
        }
      }
    }

    loadSpecialists()
    return () => {
      ignore = true
    }
  }, [selectedChildId])

  const activeChild = children.find((child) => child.id === selectedChildId) || null

  function handleChildChange(event) {
    setSelectedChildId(Number(event.target.value))
    setFormError('')
    setSuccessMessage('')
    setListError('')
    setPendingUnlink(null)
  }

  async function handleLinkSubmit(event) {
    event.preventDefault()
    if (!selectedChildId) {
      return
    }

    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setFormError('Specialist email is required.')
      setSuccessMessage('')
      return
    }

    setSubmitting(true)
    setFormError('')
    setSuccessMessage('')

    try {
      const linked = await linkSpecialistRequest(selectedChildId, {
        email: trimmedEmail,
        specialistType,
      })
      setSpecialists((prev) => [...prev, linked])
      setEmail('')
      setSuccessMessage(`${linked.name} linked as ${linked.specialistType}.`)
    } catch (error) {
      setFormError(error.message || 'Could not link specialist.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleConfirmUnlink() {
    if (!pendingUnlink || !selectedChildId) {
      return
    }

    setUnlinking(true)
    setListError('')
    setSuccessMessage('')

    try {
      await unlinkSpecialistRequest(selectedChildId, pendingUnlink.specialistId)
      setSpecialists((prev) =>
        prev.filter((item) => item.specialistId !== pendingUnlink.specialistId)
      )
      setPendingUnlink(null)
    } catch (error) {
      setListError(error.message || 'Could not unlink specialist.')
      setPendingUnlink(null)
    } finally {
      setUnlinking(false)
    }
  }

  return (
    <section className="page-container">
      <div className="page-header">
        <div>
          <h1>{activeChild ? `Specialists of ${activeChild.name}` : 'Linked Specialists'}</h1>
          <p className="page-subtitle">
            Manage specialists who have access to your child&apos;s records.
          </p>
        </div>

        {children.length > 1 && (
          <div className="child-switcher">
            <label htmlFor="child-select">Child</label>
            <select id="child-select" value={selectedChildId ?? ''} onChange={handleChildChange}>
              {children.map((child) => (
                <option key={child.id} value={child.id}>
                  {child.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {childrenError && (
        <p className="alert-error" role="alert">
          {childrenError}
        </p>
      )}

      {loadingChildren ? (
        <div className="page-card">
          <p className="card-text">Loading children...</p>
        </div>
      ) : !activeChild ? (
        <div className="page-card">
          <p className="card-text">No child profiles found for your account.</p>
        </div>
      ) : (
        <>
          <div className="page-card">
            <h2>Link a specialist</h2>
            <form className="link-form" onSubmit={handleLinkSubmit} noValidate>
              <div className="link-form-row">
                <div className="form-field">
                  <label htmlFor="specialist-email">Specialist&apos;s email</label>
                  <input
                    id="specialist-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="selin.oz@example.com"
                    disabled={submitting}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="specialist-type">Type</label>
                  <select
                    id="specialist-type"
                    value={specialistType}
                    onChange={(event) => setSpecialistType(event.target.value)}
                    disabled={submitting}
                  >
                    {SPECIALIST_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? 'Linking...' : 'Link'}
                </button>
              </div>

              <p className="field-hint">Types: {SPECIALIST_TYPES.join(', ')}</p>

              {formError && (
                <p className="alert-error" role="alert">
                  {formError}
                </p>
              )}

              {successMessage && (
                <p className="alert-success" role="status">
                  {successMessage}
                </p>
              )}
            </form>
          </div>

          <div className="page-card">
            <h2>Linked specialists</h2>

            {listError && (
              <p className="alert-error" role="alert">
                {listError}
              </p>
            )}

            {loadingSpecialists ? (
              <p className="card-text">Loading linked specialists...</p>
            ) : specialists.length === 0 ? (
              <p className="card-text">No specialists linked yet.</p>
            ) : (
              <div className="table-wrapper">
                <table className="specialists-table">
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Email</th>
                      <th scope="col">Type</th>
                      <th scope="col" className="table-action-cell">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {specialists.map((specialist) => (
                      <tr key={specialist.specialistId}>
                        <td>{specialist.name}</td>
                        <td>{specialist.email}</td>
                        <td>{specialist.specialistType}</td>
                        <td className="table-action-cell">
                          <button
                            type="button"
                            className="btn-danger-outline"
                            aria-label={`Unlink ${specialist.name}`}
                            onClick={() => setPendingUnlink(specialist)}
                          >
                            Unlink
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <UnlinkConfirmDialog
        specialist={pendingUnlink}
        childName={activeChild?.name || 'your child'}
        unlinking={unlinking}
        onCancel={() => setPendingUnlink(null)}
        onConfirm={handleConfirmUnlink}
      />
    </section>
  )
}

export default ParentSpecialistsPage
