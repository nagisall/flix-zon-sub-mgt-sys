/**
 * Central API fetch wrapper.
 * - In development, empty BASE_URL uses current origin + Vite proxy (/api -> :5000)
 *   or falls back to localhost if accessed directly.
 * - Adds Authorization: Bearer <token> if token exists in localStorage
 * - Adds Content-Type: application/json
 * - Returns parsed JSON; throws error if response is not ok
 */
const BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? `http://${window.location.hostname}:5000`
  : `http://${window.location.hostname}:5000`

export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('token')

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  }

  // Use relative path if proxied, or point to host IP on port 5000
  const url = path.startsWith('/api') ? path : `${BASE_URL}${path}`

  const response = await fetch(url, {
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
