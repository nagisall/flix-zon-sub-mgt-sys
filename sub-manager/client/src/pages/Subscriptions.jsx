import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import NewSubscriptionModal from '../components/NewSubscriptionModal.jsx'
import { apiFetch } from '../api.js'

export default function Subscriptions() {
  const [searchParams] = useSearchParams()
  const [user, setUser] = useState(null)
  const [subscriptions, setSubscriptions] = useState([])
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // New Subscription modal
  const [showNewModal, setShowNewModal] = useState(searchParams.get('action') === 'new')

  // View line items modal
  const [selectedSub, setSelectedSub] = useState(null)
  const [subDetails, setSubDetails] = useState(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('user')
      if (raw) setUser(JSON.parse(raw))
    } catch {
      setUser(null)
    }
    loadSubscriptions()
  }, [])

  async function loadSubscriptions() {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch('/api/subscriptions')
      setSubscriptions(res.data || [])
    } catch (err) {
      setError(err.message || 'Failed to load subscriptions.')
    } finally {
      setLoading(false)
    }
  }

  async function handleStatusChange(id, newStatus) {
    setError('')
    setSuccess('')
    try {
      await apiFetch(`/api/subscriptions/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus })
      })
      setSuccess(`Subscription status changed to ${newStatus}`)
      loadSubscriptions()
    } catch (err) {
      setError(err.message || 'Failed to update status.')
    }
  }

  async function handlePause(id) {
    try {
      await apiFetch(`/api/subscriptions/${id}/pause`, { method: 'POST' })
      setSuccess('Subscription paused.')
      loadSubscriptions()
    } catch (err) {
      setError(err.message || 'Cannot pause subscription.')
    }
  }

  async function handleResume(id) {
    try {
      await apiFetch(`/api/subscriptions/${id}/resume`, { method: 'POST' })
      setSuccess('Subscription resumed to Active.')
      loadSubscriptions()
    } catch (err) {
      setError(err.message || 'Cannot resume subscription.')
    }
  }

  async function handleRenew(id) {
    try {
      await apiFetch(`/api/subscriptions/${id}/renew`, { method: 'POST' })
      setSuccess('Subscription renewed.')
      loadSubscriptions()
    } catch (err) {
      setError(err.message || 'Cannot renew subscription.')
    }
  }

  async function handleClose(id) {
    if (!window.confirm('Are you sure you want to close this subscription?')) return
    try {
      await apiFetch(`/api/subscriptions/${id}/close`, { method: 'POST' })
      setSuccess('Subscription closed.')
      loadSubscriptions()
    } catch (err) {
      setError(err.message || 'Cannot close subscription.')
    }
  }

  async function handleViewDetails(sub) {
    setSelectedSub(sub)
    try {
      const res = await apiFetch(`/api/subscriptions/${sub.id}`)
      setSubDetails(res.data)
    } catch (err) {
      setError('Failed to load subscription items.')
    }
  }

  const filteredSubs = subscriptions.filter(s => {
    if (filterStatus === 'ALL') return true
    return s.status.toUpperCase() === filterStatus
  })

  const isStaffOrAdmin = user && (user.role === 'admin' || user.role === 'staff')

  return (
    <div className="app-layout">
      <Navbar />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h2>Subscriptions & Quotations</h2>
            <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
              Track the complete lifecycle: Draft → Quotation → Confirmed → Active → Closed
            </p>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => setShowNewModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>+</span>
            <span>{user?.role === 'customer' ? 'Subscribe to New Plan' : 'New Subscription'}</span>
          </button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <div className="tabs">
          {['ALL', 'ACTIVE', 'QUOTATION', 'CONFIRMED', 'PAUSED', 'CLOSED'].map(st => (
            <button
              key={st}
              className={`tab-btn ${filterStatus === st ? 'active' : ''}`}
              onClick={() => setFilterStatus(st)}
            >
              {st} {st !== 'ALL' ? `(${subscriptions.filter(s => s.status.toUpperCase() === st).length})` : `(${subscriptions.length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="loading-text">Loading subscriptions…</div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Customer</th>
                  <th>Plan & Frequency</th>
                  <th>Dates</th>
                  <th>Next Billing</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubs.length === 0 ? (
                  <tr><td colSpan="7" className="loading-text">No subscriptions in this view.</td></tr>
                ) : (
                  filteredSubs.map(s => (
                    <tr key={s.id}>
                      <td><strong>{s.subscription_number || `SUB-${s.id}`}</strong></td>
                      <td>
                        <div>{s.customer_name}</div>
                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{s.customer_email}</div>
                      </td>
                      <td>
                        <strong>{s.plan_name}</strong>
                        <div style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'capitalize' }}>{s.frequency} ({s.payment_terms})</div>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>
                        <div>Start: {s.start_date}</div>
                        <div>End: {s.end_date || 'Ongoing'}</div>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>
                        {s.next_billing_date || '—'}
                      </td>
                      <td>
                        <span className={`badge badge-${s.status.toLowerCase()}`}>
                          {s.status}
                        </span>
                      </td>
                      <td>
                        <div className="actions-cell">
                          <button className="btn btn-outline btn-sm" onClick={() => handleViewDetails(s)}>
                            View Items
                          </button>

                          {/* Lifecycle state transitions */}
                          {isStaffOrAdmin && s.status === 'Draft' && (
                            <button className="btn btn-primary btn-sm" onClick={() => handleStatusChange(s.id, 'Quotation')}>
                              To Quote
                            </button>
                          )}
                          {isStaffOrAdmin && s.status === 'Quotation' && (
                            <button className="btn btn-success btn-sm" onClick={() => handleStatusChange(s.id, 'Confirmed')}>
                              Confirm Offer
                            </button>
                          )}
                          {isStaffOrAdmin && s.status === 'Confirmed' && (
                            <button className="btn btn-success btn-sm" onClick={() => handleStatusChange(s.id, 'Active')}>
                              Activate
                            </button>
                          )}

                          {/* Pause / Resume / Renew / Close actions */}
                          {s.status === 'Active' && s.allow_pause !== 0 && (
                            <button className="btn btn-warning btn-sm" onClick={() => handlePause(s.id)}>
                              Pause
                            </button>
                          )}
                          {s.status === 'Paused' && (
                            <button className="btn btn-success btn-sm" onClick={() => handleResume(s.id)}>
                              Resume
                            </button>
                          )}
                          {s.allow_renew !== 0 && (s.status === 'Active' || s.status === 'Closed') && (
                            <button className="btn btn-outline btn-sm" onClick={() => handleRenew(s.id)}>
                              Renew
                            </button>
                          )}
                          {s.status === 'Active' && s.allow_close_early !== 0 && (
                            <button className="btn btn-danger btn-sm" onClick={() => handleClose(s.id)}>
                              Close Early
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Line Items Details Modal */}
      {selectedSub && subDetails && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: '680px' }}>
            <div className="modal-header">
              <h3>Subscription #{selectedSub.subscription_number || selectedSub.id} Details</h3>
              <button className="modal-close" onClick={() => { setSelectedSub(null); setSubDetails(null); }}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px' }}>
                <div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Customer</div>
                  <strong>{subDetails.customer_name}</strong> ({subDetails.customer_email})
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Plan & Terms</div>
                  <strong>{subDetails.plan_name}</strong> ({subDetails.frequency}, {subDetails.payment_terms})
                </div>
              </div>

              <h4 style={{ marginBottom: '0.75rem', color: '#1e293b' }}>Line Items</h4>
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Variant</th>
                    <th>Qty</th>
                    <th>Unit Price</th>
                    <th>Tax</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {subDetails.items && subDetails.items.map((item, idx) => (
                    <tr key={idx}>
                      <td><strong>{item.product_name}</strong></td>
                      <td>{item.variant_name || 'Standard'}</td>
                      <td>{item.quantity}</td>
                      <td>${item.unit_price?.toFixed(2)}</td>
                      <td>{item.tax_rate}%</td>
                      <td><strong>${item.line_total?.toFixed(2) || (item.quantity * item.unit_price * (1 + (item.tax_rate||0)/100)).toFixed(2)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setSelectedSub(null); setSubDetails(null); }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* New Subscription Modal */}
      <NewSubscriptionModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        onSuccess={() => {
          setSuccess('Subscription activated successfully! Initial invoice has been generated.')
          loadSubscriptions()
        }}
        user={user}
      />
    </div>
  )
}
