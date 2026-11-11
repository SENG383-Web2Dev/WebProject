export const TOKEN_STORAGE_KEY = 'auth_token'

/**
 * Custom error carrying an HTTP status code from API responses.
 */
export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function getStoredToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY)
}

export function setStoredToken(token) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_STORAGE_KEY)
}

/**
 * Fetch wrapper that attaches the stored JWT and parses JSON responses.
 * Throws ApiError for non-2xx responses.
 */
export async function apiFetch(path, options = {}) {
  const { skipAuth = false, headers: customHeaders = {}, body, ...rest } = options
  const headers = { ...customHeaders }

  if (!skipAuth) {
    const token = getStoredToken()
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
  }

  let preparedBody = body
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
  if (body !== undefined && !isFormData && typeof body !== 'string') {
    preparedBody = JSON.stringify(body)
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json'
    }
  } else if (typeof body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(path, {
    ...rest,
    headers,
    body: preparedBody,
  })

  if (response.status === 204) {
    return null
  }

  let data = null
  const contentType = response.headers?.get?.('content-type') || ''
  if (typeof response.json === 'function' && (!contentType || contentType.includes('application/json'))) {
    try {
      data = await response.json()
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    const message = data?.error || `Request failed with status ${response.status}`
    throw new ApiError(response.status, message)
  }

  return data
}

export function loginRequest(email, password) {
  return apiFetch('/api/auth/login', {
    method: 'POST',
    body: { email, password },
    skipAuth: true,
  })
}

export function fetchMeRequest() {
  return apiFetch('/api/auth/me')
}

export function logoutRequest() {
  return apiFetch('/api/auth/logout', { method: 'POST' })
}
