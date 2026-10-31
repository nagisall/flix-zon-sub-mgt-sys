import { useState, useEffect } from 'react'
import Navbar from '../components/Navbar.jsx'
import { apiFetch } from '../api.js'

export default function QuotationTemplates() {
  const [templates, setTemplates] = useState([])
  const [plans, setPlans] = useState([])
  const [products, setProducts] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Create Template modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [templateForm, setTemplateForm] = useState({
    name: '',
    plan_id: '',
    validity_days: 30,
    payment_terms: 'Net 30',
    notes: '',
    lines: [{ product_id: '', variant_id: '', quantity: 1, unit_price: '', tax_rate: 10.0 }]
  })

  // Create Quote modal
  const [showQuoteModal, setShowQuoteModal] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [quoteForm, setQuoteForm] = useState({
    customer_id: '',
    start_date: new Date().toISOString().split('T')[0]
  })

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const [tRes, pRes, prRes, cRes] = await Promise.all([
        apiFetch('/api/quotation-templates'),
        apiFetch('/api/products/plans'),
        apiFetch('/api/products'),
        apiFetch('/api/users/customers')
      ])
      setTemplates(tRes.data || [])
      setPlans(pRes || [])
      setProducts(prRes || [])
      setCustomers(cRes.data || [])
    } catch (err) {
      setError(err.message || 'Failed to load templates.')
    } finally {
      setLoading(false)
    }
  }

  function handleAddLine() {
    setTemplateForm(prev => ({
      ...prev,
      lines: [...prev.lines, { product_id: '', variant_id: '', quantity: 1, unit_price: '', tax_rate: 10.0 }]
    }))
  }

  function handleLineChange(idx, field, value) {
    const updated = [...templateForm.lines]
    updated[idx][field] = value

    // If product changed, auto-fill unit_price from product sales price
    if (field === 'product_id') {
      const prod = products.find(p => String(p.id) === String(value))
      if (prod) {
        updated[idx].unit_price = prod.sales_price
      }
    }
    setTemplateForm(prev => ({ ...prev, lines: updated }))
  }

  async function handleCreateTemplate(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    try {
      await apiFetch('/api/quotation-templates', {
        method: 'POST',
        body: JSON.stringify(templateForm)
      })
      setSuccess('Quotation template created successfully!')
      setShowCreateModal(false)
      loadData()
    } catch (err) {
      setError(err.message || 'Failed to create template.')
    }
  }

  async function handleGenerateQuote(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    try {
      const res = await apiFetch(`/api/quotation-templates/${selectedTemplate.id}/create-quote`, {
        method: 'POST',
        body: JSON.stringify(quoteForm)
      })
      setSuccess(`Quotation #${res.data.subscription_number} generated successfully for customer!`)
      setShowQuoteModal(false)
    } catch (err) {
      setError(err.message || 'Failed to generate quotation.')
    }
  }

  return (
    <div className="app-layout">
      <Navbar />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h2>Quotation Templates & Sales Offers</h2>
            <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
              Standardize offers for large enterprise prospects with pre-configured plans and product lines
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            + New Quotation Template
          </button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        {loading ? (
          <div className="loading-text">Loading quotation templates…</div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Template Name</th>
                  <th>Plan</th>
                  <th>Validity</th>
                  <th>Payment Terms</th>
                  <th>Product Lines</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.length === 0 ? (
                  <tr><td colSpan="6" className="loading-text">No templates created yet.</td></tr>
                ) : (
                  templates.map(t => (
                    <tr key={t.id}>
                      <td>
                        <strong>{t.name}</strong>
                        {t.notes && <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{t.notes}</div>}
                      </td>
                      <td>{t.plan_name} ({t.frequency})</td>
                      <td>{t.validity_days} days</td>
                      <td>{t.payment_terms}</td>
                      <td>
                        {t.lines && t.lines.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            {t.lines.map((l, i) => (
                              <span key={i} style={{ fontSize: '0.82rem' }}>
                                • {l.quantity}x {l.product_name} {l.variant_name ? `(${l.variant_name})` : ''} @ ${l.unit_price}
                              </span>
                            ))}
                          </div>
                        ) : '—'}
                      </td>
                      <td>
                        <button
                          className="btn btn-success btn-sm"
                          onClick={() => {
                            setSelectedTemplate(t)
                            setShowQuoteModal(true)
                          }}
                        >
                          📄 Create Offer for Customer
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Template Modal */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: '720px' }}>
            <div className="modal-header">
              <h3>Create Quotation Template</h3>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreateTemplate}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Template Name *</label>
                  <input
                    type="text"
                    required
                    value={templateForm.name}
                    onChange={e => setTemplateForm({ ...templateForm, name: e.target.value })}
                    placeholder="e.g. Enterprise 50-Seat Bundle"
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label>Plan *</label>
                    <select
                      required
                      value={templateForm.plan_id}
                      onChange={e => setTemplateForm({ ...templateForm, plan_id: e.target.value })}
                      style={{ width: '100%', padding: '0.6rem', border: '1.5px solid #e2e8f0', borderRadius: '7px' }}
                    >
                      <option value="">Select a plan…</option>
                      {plans.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.frequency})</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Validity (Days) *</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={templateForm.validity_days}
                      onChange={e => setTemplateForm({ ...templateForm, validity_days: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Payment Terms</label>
                    <input
                      type="text"
                      value={templateForm.payment_terms}
                      onChange={e => setTemplateForm({ ...templateForm, payment_terms: e.target.value })}
                      placeholder="Net 30, immediate"
                    />
                  </div>
                </div>

                <div style={{ marginTop: '1rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <h4 style={{ fontSize: '0.95rem', color: '#1e293b' }}>Included Product Lines</h4>
                    <button type="button" className="btn btn-outline btn-sm" onClick={handleAddLine}>
                      + Add Line
                    </button>
                  </div>

                  {templateForm.lines.map((line, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                      <select
                        required
                        value={line.product_id}
                        onChange={e => handleLineChange(idx, 'product_id', e.target.value)}
                        style={{ padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                      >
                        <option value="">Select product…</option>
                        {products.map(pr => (
                          <option key={pr.id} value={pr.id}>{pr.name} (${pr.sales_price})</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="1"
                        placeholder="Qty"
                        required
                        value={line.quantity}
                        onChange={e => handleLineChange(idx, 'quantity', e.target.value)}
                        style={{ padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                      />
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Unit $"
                        required
                        value={line.unit_price}
                        onChange={e => handleLineChange(idx, 'unit_price', e.target.value)}
                        style={{ padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                      />
                      <input
                        type="number"
                        step="0.1"
                        placeholder="Tax %"
                        value={line.tax_rate}
                        onChange={e => handleLineChange(idx, 'tax_rate', e.target.value)}
                        style={{ padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Template</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Generate Quote for Customer Modal */}
      {showQuoteModal && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3>Create Offer: {selectedTemplate?.name}</h3>
              <button className="modal-close" onClick={() => setShowQuoteModal(false)}>×</button>
            </div>
            <form onSubmit={handleGenerateQuote}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Select Customer *</label>
                  <select
                    required
                    value={quoteForm.customer_id}
                    onChange={e => setQuoteForm({ ...quoteForm, customer_id: e.target.value })}
                    style={{ width: '100%', padding: '0.6rem', border: '1.5px solid #e2e8f0', borderRadius: '7px' }}
                  >
                    <option value="">Choose customer…</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Offer Start Date *</label>
                  <input
                    type="date"
                    required
                    value={quoteForm.start_date}
                    onChange={e => setQuoteForm({ ...quoteForm, start_date: e.target.value })}
                  />
                  <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '0.35rem' }}>
                    Will automatically expire after {selectedTemplate?.validity_days} days unless confirmed.
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowQuoteModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-success">Generate Quotation</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
