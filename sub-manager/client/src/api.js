/**
 * Central API fetch wrapper.
 * - Prepends http://localhost:5000
 * - Adds Authorization: Bearer <token> if token exists in localStorage
 * - Adds Content-Type: application/json
 * - Returns parsed JSON; throws error if response is not ok
 */
const BASE_URL = 'http://localhost:5000'

export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('token')

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  })

  let data
  try {
    data = await response.json()
  } catch {
    data = null
  }

  if (!response.ok) {
    const message = (data && (data.message || data.error)) || `HTTP error ${response.status}`
    throw new Error(message)
  }

  return data
}
