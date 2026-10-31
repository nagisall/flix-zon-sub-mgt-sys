import { useEffect, useState } from 'react'
import Navbar from '../components/Navbar.jsx'
import { apiFetch } from '../api.js'

const STATUS_BADGE_MAP = {
  draft: 'badge-draft',
  quotation: 'badge-quotation',
  confirmed: 'badge-confirmed',
  active: 'badge-active',
  closed: 'badge-closed',
}

function StatusBadge({ status }) {
  const key = (status || '').toLowerCase()
  const cls = STATUS_BADGE_MAP[key] || 'badge-draft'
  return <span className={`badge ${cls}`}>{status || 'Unknown'}</span>
}

export default function Subscriptions() {
  const [subscriptions, setSubscriptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')
      try {
        const data = await apiFetch('/api/subscriptions')
        setSubscriptions(Array.isArray(data) ? data : [])
      } catch (err) {
        setError(err.message || 'Failed to load subscriptions.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  function formatDate(dateStr) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <div className="app-layout">
      <Navbar />
      <div className="page-content">
        <div className="page-header">
          <h2>Subscriptions</h2>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {loading ? (
          <p className="loading-text">Loading subscriptions…</p>
        ) : subscriptions.length === 0 ? (
          <p className="loading-text">No subscriptions found.</p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Customer</th>
                  <th>Product</th>
                  <th>Start Date</th>
                  <th>End Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((sub, idx) => (
                  <tr key={sub._id || sub.id || idx}>
                    <td>{idx + 1}</td>
                    <td>
                      {sub.customer?.name ||
                        sub.customerName ||
                        sub.user?.name ||
                        '—'}
                    </td>
                    <td>
                      {sub.product?.name ||
                        sub.productName ||
                        '—'}
                    </td>
                    <td>{formatDate(sub.startDate || sub.start_date)}</td>
                    <td>{formatDate(sub.endDate || sub.end_date)}</td>
                    <td>
                      <StatusBadge status={sub.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
