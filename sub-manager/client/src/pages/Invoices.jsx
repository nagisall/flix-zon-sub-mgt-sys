import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import { apiFetch } from '../api.js'

export default function Invoices() {
  const [searchParams] = useSearchParams()
  const initialFilter = searchParams.get('filter') === 'overdue' ? 'OVERDUE' : 'ALL'

  const [user, setUser] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [filterStatus, setFilterStatus] = useState(initialFilter)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [runningBilling, setRunningBilling] = useState(false)

  // Payment modal
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [paymentForm, setPaymentForm] = useState({
    payment_method: 'Credit Card',
    amount: '',
    notes: ''
  })

  // Print view modal
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [printData, setPrintData] = useState(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('user')
      if (raw) setUser(JSON.parse(raw))
    } catch {
      setUser(null)
    }
    loadInvoices()
  }, [])

  async function loadInvoices() {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch('/api/invoices')
      setInvoices(res.data || [])
    } catch (err) {
      setError(err.message || 'Failed to load invoices.')
    } finally {
      setLoading(false)
    }
  }

  async function handleRunBilling() {
    setRunningBilling(true)
    setError('')
    setSuccess('')
    try {
      const res = await apiFetch('/api/subscriptions/billing-run', { method: 'POST' })
      setSuccess(res.message)
      loadInvoices()
    } catch (err) {
      setError(err.message || 'Billing day run failed.')
    } finally {
      setRunningBilling(false)
    }
  }

  async function handleConfirm(id) {
    try {
      await apiFetch(`/api/invoices/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'Confirmed' })
      })
      setSuccess('Invoice confirmed.')
      loadInvoices()
    } catch (err) {
      setError(err.message || 'Error confirming invoice.')
    }
  }

  async function handleCancel(id) {
    if (!window.confirm('Cancel this invoice?')) return
    try {
      await apiFetch(`/api/invoices/${id}/cancel`, { method: 'POST' })
      setSuccess('Invoice cancelled.')
      loadInvoices()
    } catch (err) {
      setError(err.message || 'Error cancelling invoice.')
    }
  }

  async function handleSend(id) {
    try {
      const res = await apiFetch(`/api/invoices/${id}/send`, { method: 'POST' })
      setSuccess(res.message)
      loadInvoices()
    } catch (err) {
      setError(err.message || 'Error sending invoice.')
    }
  }

  async function handleOpenPrint(id) {
    try {
      const res = await apiFetch(`/api/invoices/${id}/print`)
      setPrintData(res)
      setShowPrintModal(true)
    } catch (err) {
      setError('Failed to load printable view.')
    }
  }

  function handleOpenPayment(inv) {
    setSelectedInvoice(inv)
    const remaining = Math.max(0, inv.total_amount - (inv.paid_amount || 0))
    setPaymentForm({
      payment_method: 'Credit Card',
      amount: remaining.toFixed(2),
      notes: ''
    })
    setShowPaymentModal(true)
  }

  async function handleRecordPayment(e) {
    e.preventDefault()
    try {
      await apiFetch('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
          invoice_id: selectedInvoice.id,
          payment_method: paymentForm.payment_method,
          amount: parseFloat(paymentForm.amount),
          notes: paymentForm.notes
        })
      })
      setSuccess('Payment recorded successfully! Invoice status updated.')
      setShowPaymentModal(false)
      loadInvoices()
    } catch (err) {
      setError(err.message || 'Failed to record payment.')
    }
  }

  const isStaffOrAdmin = user && (user.role === 'admin' || user.role === 'staff')

  const filteredInvoices = invoices.filter(inv => {
    if (filterStatus === 'ALL') return true
    if (filterStatus === 'OVERDUE') return inv.is_overdue === 1
    return inv.status.toUpperCase() === filterStatus
  })

  return (
    <div className="app-layout">
      <Navbar />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h2>Invoices & Recurring Billing</h2>
            <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
              Automated invoice generation, tax calculations, discounts, and payment collections
            </p>
          </div>
          {isStaffOrAdmin && (
            <button
              className="btn btn-primary"
              onClick={handleRunBilling}
              disabled={runningBilling}
              style={{ background: '#09090b', color: '#ffffff', border: '1px solid #27272a' }}
            >
              {runningBilling ? '⚡ Running Billing Day…' : '⚡ Run Automated Billing Day'}
            </button>
          )}
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <div className="tabs">
          {['ALL', 'OVERDUE', 'DRAFT', 'CONFIRMED', 'PAID', 'CANCELLED'].map(st => (
            <button
              key={st}
              className={`tab-btn ${filterStatus === st ? 'active' : ''}`}
              onClick={() => setFilterStatus(st)}
            >
              {st} {st === 'OVERDUE' ? `(${invoices.filter(i => i.is_overdue === 1).length})` : st !== 'ALL' ? `(${invoices.filter(i => i.status.toUpperCase() === st).length})` : `(${invoices.length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="loading-text">Loading invoices…</div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Customer</th>
                  <th>Due Date</th>
                  <th>Subtotal</th>
                  <th>Taxes</th>
                  <th>Discount</th>
                  <th>Total</th>
                  <th>Paid</th>
                  <th>Balance Due</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.length === 0 ? (
                  <tr><td colSpan="11" className="loading-text">No invoices found in this view.</td></tr>
                ) : (
                  filteredInvoices.map(inv => {
                    const balance = Math.max(0, inv.total_amount - (inv.paid_amount || 0))
                    return (
                      <tr key={inv.id}>
                        <td><strong>{inv.invoice_number || `INV-${inv.id}`}</strong></td>
                        <td>{inv.customer_name}</td>
                        <td style={{ color: inv.is_overdue ? '#dc2626' : 'inherit', fontWeight: inv.is_overdue ? 600 : 'normal' }}>
                          {inv.due_date} {inv.is_overdue ? '⚠️' : ''}
                        </td>
                        <td>${inv.subtotal?.toFixed(2)}</td>
                        <td>${inv.tax_amount?.toFixed(2)}</td>
                        <td>{inv.discount_amount > 0 ? `-$${inv.discount_amount?.toFixed(2)}` : '—'}</td>
                        <td><strong>${inv.total_amount?.toFixed(2)}</strong></td>
                        <td style={{ color: '#10b981' }}>${inv.paid_amount?.toFixed(2) || '0.00'}</td>
                        <td style={{ color: balance > 0 ? '#ea580c' : '#10b981', fontWeight: 700 }}>
                          ${balance.toFixed(2)}
                        </td>
                        <td>
                          <span className={`badge ${inv.is_overdue ? 'badge-overdue' : `badge-${inv.status.toLowerCase()}`}`}>
                            {inv.is_overdue ? 'Overdue' : inv.status}
                          </span>
                        </td>
                        <td>
                          <div className="actions-cell">
                            <button className="btn btn-outline btn-sm" onClick={() => handleOpenPrint(inv.id)}>
                              Print/View
                            </button>

                            {isStaffOrAdmin && inv.status === 'Draft' && (
                              <button className="btn btn-primary btn-sm" onClick={() => handleConfirm(inv.id)}>
                                Confirm
                              </button>
                            )}

                            {isStaffOrAdmin && inv.status !== 'Paid' && inv.status !== 'Cancelled' && (
                              <button className="btn btn-success btn-sm" onClick={() => handleOpenPayment(inv)}>
                                Record $
                              </button>
                            )}

                            {isStaffOrAdmin && (
                              <button className="btn btn-outline btn-sm" onClick={() => handleSend(inv.id)}>
                                {inv.sent_at ? 'Re-send' : 'Send'}
                              </button>
                            )}

                            {isStaffOrAdmin && inv.status !== 'Paid' && inv.status !== 'Cancelled' && (
                              <button className="btn btn-danger btn-sm" onClick={() => handleCancel(inv.id)}>
                                Cancel
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Payment Modal */}
      {showPaymentModal && selectedInvoice && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3>Record Payment for Invoice #{selectedInvoice.invoice_number || selectedInvoice.id}</h3>
              <button className="modal-close" onClick={() => setShowPaymentModal(false)}>×</button>
            </div>
            <form onSubmit={handleRecordPayment}>
              <div className="modal-body">
                <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', marginBottom: '1rem', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ color: '#64748b' }}>Total Invoice:</span>
                    <strong>${selectedInvoice.total_amount?.toFixed(2)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Outstanding Balance:</span>
                    <strong style={{ color: '#dc2626' }}>${(selectedInvoice.total_amount - (selectedInvoice.paid_amount || 0)).toFixed(2)}</strong>
                  </div>
                </div>

                <div className="form-group">
                  <label>Payment Method *</label>
                  <select
                    required
                    value={paymentForm.payment_method}
                    onChange={e => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
                    style={{ width: '100%', padding: '0.6rem', border: '1.5px solid #e2e8f0', borderRadius: '7px' }}
                  >
                    <option value="Credit Card">Credit Card</option>
                    <option value="Bank Transfer">Bank Transfer (Wire)</option>
                    <option value="Direct Debit">Direct Debit</option>
                    <option value="Check">Check</option>
                    <option value="Cash">Cash</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Amount ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={paymentForm.amount}
                    onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Notes (e.g. Transaction Ref / Bank Statement Code)</label>
                  <input
                    type="text"
                    value={paymentForm.notes}
                    onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                    placeholder="Ref #TXN-98421"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowPaymentModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-success">Save Payment</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Invoice Modal */}
      {showPrintModal && printData && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: '750px', background: '#fff' }}>
            <div className="modal-header" style={{ borderBottom: '2px solid #1e293b' }}>
              <div>
                <h2>{printData.company.name}</h2>
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{printData.company.contact}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className={`badge badge-${printData.invoice.status.toLowerCase()}`} style={{ fontSize: '1rem', padding: '0.35rem 1rem' }}>
                  {printData.invoice.status}
                </span>
                <div style={{ fontSize: '0.9rem', marginTop: '0.25rem', fontWeight: 700 }}>
                  Invoice #{printData.invoice.invoice_number || printData.invoice.id}
                </div>
              </div>
            </div>

            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '1.5rem' }}>
                <div>
                  <h4 style={{ color: '#64748b', fontSize: '0.8rem', textTransform: 'uppercase' }}>Billed To:</h4>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{printData.invoice.customer_name}</div>
                  <div style={{ color: '#475569' }}>{printData.invoice.customer_email}</div>
                  <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.25rem' }}>
                    Payment Terms: {printData.invoice.payment_terms}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div><strong>Invoice Date:</strong> {new Date(printData.invoice.created_at).toLocaleDateString()}</div>
                  <div style={{ color: '#dc2626' }}><strong>Due Date:</strong> {printData.invoice.due_date}</div>
                  {printData.invoice.sent_at && (
                    <div style={{ fontSize: '0.82rem', color: '#10b981' }}>Sent on: {new Date(printData.invoice.sent_at).toLocaleDateString()}</div>
                  )}
                </div>
              </div>

              <table style={{ marginBottom: '1.5rem' }}>
                <thead>
                  <tr>
                    <th>Description</th>
                    <th style={{ textAlign: 'center' }}>Qty</th>
                    <th style={{ textAlign: 'right' }}>Unit Price</th>
                    <th style={{ textAlign: 'right' }}>Tax</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {printData.invoice.lines.map((l, i) => (
                    <tr key={i}>
                      <td>{l.description}</td>
                      <td style={{ textAlign: 'center' }}>{l.quantity}</td>
                      <td style={{ textAlign: 'right' }}>${l.unit_price?.toFixed(2)}</td>
                      <td style={{ textAlign: 'right' }}>{l.tax_rate}%</td>
                      <td style={{ textAlign: 'right' }}><strong>${l.line_total?.toFixed(2)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ width: '280px', marginLeft: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem', borderTop: '2px solid #e2e8f0', paddingTop: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Subtotal:</span>
                  <span>${printData.invoice.subtotal?.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Taxes:</span>
                  <span>+${printData.invoice.tax_amount?.toFixed(2)}</span>
                </div>
                {printData.invoice.discount_amount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#10b981' }}>
                    <span>Discount:</span>
                    <span>-${printData.invoice.discount_amount?.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.15rem', fontWeight: 800, borderTop: '1px solid #1e293b', paddingTop: '0.5rem' }}>
                  <span>Total Due:</span>
                  <span>${printData.invoice.total_amount?.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#10b981' }}>
                  <span>Paid to Date:</span>
                  <span>${printData.invoice.paid_amount?.toFixed(2) || '0.00'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: printData.invoice.outstanding_amount > 0 ? '#dc2626' : '#10b981' }}>
                  <span>Balance Remaining:</span>
                  <span>${printData.invoice.outstanding_amount?.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => window.print()}>🖨️ Print to PDF</button>
              <button className="btn btn-secondary" onClick={() => setShowPrintModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
