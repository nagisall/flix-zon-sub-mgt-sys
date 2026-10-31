import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import NewSubscriptionModal from '../components/NewSubscriptionModal.jsx'
import { apiFetch } from '../api.js'

export default function Dashboard() {
  const [user, setUser] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [customerSubs, setCustomerSubs] = useState([])
  const [customerInvoices, setCustomerInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [billingMsg, setBillingMsg] = useState('')
  const [runningBilling, setRunningBilling] = useState(false)
  const [showNewSubModal, setShowNewSubModal] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('user')
      if (raw) setUser(JSON.parse(raw))
    } catch {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    if (!user) return
    loadDashboardData()
  }, [user])

  async function loadDashboardData() {
    setLoading(true)
    setError('')
    try {
      if (user.role === 'admin' || user.role === 'staff') {
        const res = await apiFetch('/api/analytics')
        setAnalytics(res.data)
      } else {
        const [subRes, invRes] = await Promise.all([
          apiFetch('/api/subscriptions'),
          apiFetch('/api/invoices')
        ])
        setCustomerSubs(subRes.data || [])
        setCustomerInvoices(invRes.data || [])
      }
    } catch (err) {
      setError(err.message || 'Failed to load dashboard.')
    } finally {
      setLoading(false)
    }
  }

  async function handleRunBilling() {
    setRunningBilling(true)
    setBillingMsg('')
    try {
      const res = await apiFetch('/api/subscriptions/billing-run', { method: 'POST' })
      setBillingMsg(res.message || 'Billing day run finished!')
      loadDashboardData()
    } catch (err) {
      setBillingMsg(err.message || 'Billing run failed.')
    } finally {
      setRunningBilling(false)
    }
  }

  return (
    <div className="app-layout">
      <Navbar />
      <div className="page-content">
        <div className="welcome-banner">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2>{user?.name || 'Brightloop User'}</h2>
              <p>Brightloop Software — Recurring Billing, Plans & Revenue Operations</p>
            </div>
            {(user?.role === 'admin' || user?.role === 'staff') && (
              <button
                className="btn btn-secondary"
                onClick={handleRunBilling}
                disabled={runningBilling}
                style={{ background: '#ffffff', color: '#09090b', fontWeight: 700, border: 'none' }}
              >
                {runningBilling ? '⚡ Executing Billing Run…' : '⚡ Run Automated Billing Day'}
              </button>
            )}
          </div>
        </div>

        {billingMsg && (
          <div className="alert alert-success">
            {billingMsg}
          </div>
        )}

        {error && <div className="alert alert-error">{error}</div>}

        {loading ? (
          <div className="loading-text">Loading metrics & records…</div>
        ) : user?.role === 'admin' || user?.role === 'staff' ? (
          <div>
            {/* Finance Lead KPI Analytics Grid */}
            <div className="page-header" style={{ marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#09090b' }}>
                  Finance Lead Revenue Overview
                </h3>
                <p style={{ fontSize: '0.85rem', color: '#71717a' }}>Real-time reconciliation of recurring billing, collections, and overdue accounts</p>
              </div>
            </div>

            <div className="kpi-grid">
              <div className="kpi-card">
                <div className="kpi-title">Monthly Recurring Revenue (MRR)</div>
                <div className="kpi-value">${analytics?.summary?.mrr?.toLocaleString() || '0'}</div>
                <div className="kpi-sub">Normalized recurring velocity</div>
              </div>

              <div className="kpi-card green">
                <div className="kpi-title">Active Subscriptions</div>
                <div className="kpi-value">{analytics?.summary?.activeSubscriptions || 0}</div>
                <div className="kpi-sub">Total contracts: {analytics?.summary?.totalSubscriptions || 0}</div>
              </div>

              <div className="kpi-card purple">
                <div className="kpi-title">Revenue Collected</div>
                <div className="kpi-value">${analytics?.summary?.revenueCollected?.toLocaleString() || '0'}</div>
                <div className="kpi-sub">{analytics?.summary?.paymentCount || 0} settlements received</div>
              </div>

              <div className="kpi-card orange">
                <div className="kpi-title">Outstanding Balance</div>
                <div className="kpi-value">${analytics?.summary?.outstandingBalance?.toLocaleString() || '0'}</div>
                <div className="kpi-sub">{analytics?.summary?.unpaidInvoiceCount || 0} open confirmed invoices</div>
              </div>

              <div className="kpi-card red">
                <div className="kpi-title">Overdue Invoices</div>
                <div className="kpi-value" style={{ color: analytics?.summary?.overdueInvoicesCount > 0 ? '#dc2626' : 'inherit' }}>
                  {analytics?.summary?.overdueInvoicesCount || 0}
                </div>
                <div className="kpi-sub">${analytics?.summary?.overdueInvoicesAmount?.toLocaleString() || '0'} requiring follow-up</div>
              </div>
            </div>

            {/* Overdue Invoices List */}
            {analytics?.overdueInvoices && analytics.overdueInvoices.length > 0 && (
              <div style={{ marginTop: '2.5rem' }}>
                <div className="page-header" style={{ marginBottom: '1rem' }}>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#dc2626' }}>
                      ⚠️ Overdue Invoices Requiring Follow-Up
                    </h3>
                    <p style={{ fontSize: '0.82rem', color: '#71717a' }}>Unsettled invoices past their due date</p>
                  </div>
                  <Link to="/invoices?filter=overdue" className="btn btn-outline btn-sm">
                    View in Invoices & Billing →
                  </Link>
                </div>
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Invoice #</th>
                        <th>Customer</th>
                        <th>Due Date</th>
                        <th>Days Overdue</th>
                        <th>Total</th>
                        <th>Balance Due</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.overdueInvoices.map(inv => (
                        <tr key={inv.id}>
                          <td><strong>{inv.invoice_number || `INV-${inv.id}`}</strong></td>
                          <td>
                            <strong>{inv.customer_name}</strong>
                            <div style={{ fontSize: '0.8rem', color: '#71717a' }}>{inv.customer_email}</div>
                          </td>
                          <td>{inv.due_date}</td>
                          <td style={{ color: '#dc2626', fontWeight: 700 }}>{inv.days_overdue} days</td>
                          <td>${inv.total_amount?.toFixed(2)}</td>
                          <td style={{ fontWeight: 800, color: '#dc2626' }}>${inv.balance_due?.toFixed(2)}</td>
                          <td><span className="badge badge-overdue">Overdue</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Recent Payments */}
            {analytics?.recentPayments && analytics.recentPayments.length > 0 && (
              <div style={{ marginTop: '2.5rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1rem', color: '#09090b' }}>
                  💳 Recent Payment Collections
                </h3>
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Settlement Date</th>
                        <th>Customer</th>
                        <th>Invoice #</th>
                        <th>Method</th>
                        <th>Amount</th>
                        <th>Reference / Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.recentPayments.map(p => (
                        <tr key={p.id}>
                          <td>{new Date(p.payment_date).toLocaleDateString()}</td>
                          <td><strong>{p.customer_name}</strong></td>
                          <td>{p.invoice_number || `#${p.invoice_id}`}</td>
                          <td><span className="badge badge-draft">{p.payment_method}</span></td>
                          <td style={{ fontWeight: 700, color: '#09090b' }}>+${p.amount?.toFixed(2)}</td>
                          <td style={{ color: '#71717a' }}>{p.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Customer Portal View */
          <div>
            <div className="page-header" style={{ marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#09090b' }}>Your Active Subscriptions</h3>
                <p style={{ fontSize: '0.85rem', color: '#71717a' }}>Manage your cloud services, seats, and recurring renewals</p>
              </div>
              <button
                className="btn btn-primary"
                onClick={() => setShowNewSubModal(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>+</span>
                <span>Subscribe to a Plan</span>
              </button>
            </div>

            <div className="table-container" style={{ marginBottom: '2.5rem' }}>
              {customerSubs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
                  <p style={{ color: '#71717a', marginBottom: '1rem', fontSize: '0.92rem' }}>You do not have any active subscriptions yet.</p>
                  <button className="btn btn-primary" onClick={() => setShowNewSubModal(true)}>
                    ✨ Subscribe to a Plan Now
                  </button>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Subscription #</th>
                      <th>Plan</th>
                      <th>Billing Cycle</th>
                      <th>Start Date</th>
                      <th>Next Renewal / Billing</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerSubs.map(s => (
                      <tr key={s.id}>
                        <td><strong>{s.subscription_number || `SUB-${s.id}`}</strong></td>
                        <td><strong>{s.plan_name}</strong></td>
                        <td style={{ textTransform: 'capitalize' }}>{s.frequency} ({s.payment_terms})</td>
                        <td>{s.start_date}</td>
                        <td>{s.next_billing_date || '—'}</td>
                        <td>
                          <span className={`badge badge-${s.status.toLowerCase()}`}>
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="page-header" style={{ marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#09090b' }}>Invoices & Payment History</h3>
                <p style={{ fontSize: '0.85rem', color: '#71717a' }}>Download receipts and view payment status</p>
              </div>
            </div>

            <div className="table-container">
              {customerInvoices.length === 0 ? (
                <div className="loading-text">No invoices found.</div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Plan</th>
                      <th>Due Date</th>
                      <th>Total</th>
                      <th>Amount Paid</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerInvoices.map(inv => (
                      <tr key={inv.id}>
                        <td><strong>{inv.invoice_number || `INV-${inv.id}`}</strong></td>
                        <td>{inv.plan_name}</td>
                        <td>{inv.due_date}</td>
                        <td><strong>${inv.total_amount?.toFixed(2)}</strong></td>
                        <td>${inv.paid_amount?.toFixed(2) || '0.00'}</td>
                        <td>
                          <span className={`badge badge-${inv.status.toLowerCase()}`}>
                            {inv.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      {/* New Subscription Modal for Customer / Admin / Staff */}
      <NewSubscriptionModal
        isOpen={showNewSubModal}
        onClose={() => setShowNewSubModal(false)}
        onSuccess={() => {
          setBillingMsg('Subscription successfully activated! Your new contract and initial invoice have been generated.')
          loadDashboardData()
        }}
        user={user}
      />
    </div>
  )
}
