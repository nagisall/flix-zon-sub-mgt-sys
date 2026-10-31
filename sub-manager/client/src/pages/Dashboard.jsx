import { useEffect, useState } from 'react'
import Navbar from '../components/Navbar.jsx'
import { apiFetch } from '../api.js'

export default function Dashboard() {
  let user = null
  try {
    const raw = localStorage.getItem('user')
    if (raw) user = JSON.parse(raw)
  } catch {
    user = null
  }

  const isAdminOrStaff = user && (user.role === 'admin' || user.role === 'staff')

  const [summary, setSummary] = useState({ products: 0, subscriptions: 0, invoices: 0 })
  const [subscriptions, setSubscriptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')
      try {
        if (isAdminOrStaff) {
          const [products, subs, invoices] = await Promise.all([
            apiFetch('/api/products'),
            apiFetch('/api/subscriptions'),
            apiFetch('/api/invoices'),
          ])
          setSummary({
            products: Array.isArray(products) ? products.length : (products?.count ?? 0),
            subscriptions: Array.isArray(subs) ? subs.length : (subs?.count ?? 0),
            invoices: Array.isArray(invoices) ? invoices.length : (invoices?.count ?? 0),
          })
        } else {
          const subs = await apiFetch('/api/subscriptions')
          setSubscriptions(Array.isArray(subs) ? subs : [])
        }
      } catch (err) {
        setError(err.message || 'Failed to load dashboard data.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [isAdminOrStaff])

  function statusBadge(status) {
    const map = {
      draft: 'badge-draft',
      quotation: 'badge-quotation',
      confirmed: 'badge-confirmed',
      active: 'badge-active',
      closed: 'badge-closed',
    }
    const cls = map[(status || '').toLowerCase()] || 'badge-draft'
    return <span className={`badge ${cls}`}>{status}</span>
  }

  return (
    <div className="app-layout">
      <Navbar />
      <div className="page-content">
        <div className="welcome-banner">
          <h2>Hello, {user?.name}! 👋</h2>
          <p>
            You are signed in as <strong>{user?.role}</strong>. Here&apos;s your overview.
          </p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {loading ? (
          <p className="loading-text">Loading…</p>
        ) : isAdminOrStaff ? (
          <>
            <div className="page-header">
              <h2>Summary</h2>
            </div>
            <div className="summary-grid">
              <div className="card">
                <div className="card-title">Products</div>
                <div className="card-value">{summary.products}</div>
              </div>
              <div className="card">
                <div className="card-title">Subscriptions</div>
                <div className="card-value">{summary.subscriptions}</div>
              </div>
              <div className="card">
                <div className="card-title">Invoices</div>
                <div className="card-value">{summary.invoices}</div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="page-header">
              <h2>My Subscriptions</h2>
            </div>
            {subscriptions.length === 0 ? (
              <p className="loading-text">No subscriptions found.</p>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
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
                        <td>{sub.product?.name || sub.productName || '—'}</td>
                        <td>{sub.startDate ? new Date(sub.startDate).toLocaleDateString() : '—'}</td>
                        <td>{sub.endDate ? new Date(sub.endDate).toLocaleDateString() : '—'}</td>
                        <td>{statusBadge(sub.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
