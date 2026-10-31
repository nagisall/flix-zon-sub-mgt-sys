import { useState, useEffect } from 'react'
import Navbar from '../components/Navbar.jsx'
import { apiFetch } from '../api.js'

export default function TaxesDiscounts() {
  const [activeTab, setActiveTab] = useState('taxes') // 'taxes' | 'discounts'
  const [taxes, setTaxes] = useState([])
  const [discounts, setDiscounts] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Tax modal
  const [showTaxModal, setShowTaxModal] = useState(false)
  const [taxForm, setTaxForm] = useState({
    name: '',
    rate: '',
    is_default: false
  })

  // Discount modal
  const [showDiscountModal, setShowDiscountModal] = useState(false)
  const [discountForm, setDiscountForm] = useState({
    code: '',
    type: 'percentage',
    value: '',
    min_purchase_amount: '',
    min_quantity: 1,
    usage_limit: '',
    valid_from: new Date().toISOString().split('T')[0],
    valid_until: '',
    product_id: '',
    applies_to: 'subscription'
  })

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const [tRes, dRes, pRes] = await Promise.all([
        apiFetch('/api/taxes'),
        apiFetch('/api/products/discounts'),
        apiFetch('/api/products')
      ])
      setTaxes(tRes.data || [])
      setDiscounts(dRes || [])
      setProducts(pRes || [])
    } catch (err) {
      setError(err.message || 'Failed to load tax and discount rules.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateTax(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    try {
      await apiFetch('/api/taxes', {
        method: 'POST',
        body: JSON.stringify({
          name: taxForm.name,
          rate: parseFloat(taxForm.rate),
          is_default: taxForm.is_default
        })
      })
      setSuccess('Tax rule created successfully!')
      setShowTaxModal(false)
      setTaxForm({ name: '', rate: '', is_default: false })
      loadData()
    } catch (err) {
      setError(err.message || 'Failed to create tax rule.')
    }
  }

  async function handleCreateDiscount(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    try {
      await apiFetch('/api/products/discounts', {
        method: 'POST',
        body: JSON.stringify({
          code: discountForm.code || undefined,
          type: discountForm.type,
          value: parseFloat(discountForm.value),
          min_purchase_amount: parseFloat(discountForm.min_purchase_amount) || 0,
          min_quantity: parseInt(discountForm.min_quantity) || 1,
          usage_limit: discountForm.usage_limit ? parseInt(discountForm.usage_limit) : undefined,
          valid_from: discountForm.valid_from,
          valid_until: discountForm.valid_until || undefined,
          product_id: discountForm.product_id ? parseInt(discountForm.product_id) : undefined,
          applies_to: discountForm.product_id ? 'product' : 'subscription'
        })
      })
      setSuccess('Discount rule created successfully!')
      setShowDiscountModal(false)
      loadData()
    } catch (err) {
      setError(err.message || 'Failed to create discount rule.')
    }
  }

  return (
    <div className="app-layout">
      <Navbar />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h2>Taxes & Automated Discounts</h2>
            <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
              Configure tax calculation rules and automatic volume or seat discounts
            </p>
          </div>
          <div>
            {activeTab === 'taxes' ? (
              <button className="btn btn-primary" onClick={() => setShowTaxModal(true)}>
                + New Tax Rule
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => setShowDiscountModal(true)}>
                + New Discount Rule
              </button>
            )}
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <div className="tabs">
          <button
            className={`tab-btn ${activeTab === 'taxes' ? 'active' : ''}`}
            onClick={() => setActiveTab('taxes')}
          >
            🏛️ Tax Rules ({taxes.length})
          </button>
          <button
            className={`tab-btn ${activeTab === 'discounts' ? 'active' : ''}`}
            onClick={() => setActiveTab('discounts')}
          >
            🏷️ Discount Rules ({discounts.length})
          </button>
        </div>

        {loading ? (
          <div className="loading-text">Loading rules…</div>
        ) : activeTab === 'taxes' ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Rule Name</th>
                  <th>Tax Rate (%)</th>
                  <th>Default Rule</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {taxes.map(t => (
                  <tr key={t.id}>
                    <td><strong>{t.name}</strong></td>
                    <td>{t.rate}%</td>
                    <td>
                      {t.is_default ? (
                        <span className="badge badge-active">Default Rule</span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${t.is_active ? 'badge-confirmed' : 'badge-draft'}`}>
                        {t.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Code / Name</th>
                  <th>Type & Value</th>
                  <th>Applies To</th>
                  <th>Min Spend / Seats</th>
                  <th>Usage (Used / Limit)</th>
                  <th>Valid Window</th>
                </tr>
              </thead>
              <tbody>
                {discounts.length === 0 ? (
                  <tr><td colSpan="6" className="loading-text">No discounts created yet.</td></tr>
                ) : (
                  discounts.map(d => (
                    <tr key={d.id}>
                      <td><strong>{d.code || `DISC-${d.id}`}</strong></td>
                      <td>
                        <span className="badge badge-active">
                          {d.type === 'percentage' ? `${d.value}% Off` : `$${d.value?.toFixed(2)} Off`}
                        </span>
                      </td>
                      <td>
                        {d.product_name ? `Product: ${d.product_name}` : 'Entire Subscription'}
                      </td>
                      <td>
                        ${d.min_purchase_amount} min / {d.min_quantity} seat(s)
                      </td>
                      <td>
                        {d.times_used} / {d.usage_limit || 'Unlimited'}
                      </td>
                      <td>
                        {d.valid_from} {d.valid_until ? `to ${d.valid_until}` : '(Ongoing)'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tax Modal */}
      {showTaxModal && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h3>Create Tax Rule</h3>
              <button className="modal-close" onClick={() => setShowTaxModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreateTax}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Rule Name *</label>
                  <input
                    type="text"
                    required
                    value={taxForm.name}
                    onChange={e => setTaxForm({ ...taxForm, name: e.target.value })}
                    placeholder="e.g. Standard VAT / GST"
                  />
                </div>
                <div className="form-group">
                  <label>Tax Rate (%) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={taxForm.rate}
                    onChange={e => setTaxForm({ ...taxForm, rate: e.target.value })}
                    placeholder="e.g. 15.0"
                  />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={taxForm.is_default}
                    onChange={e => setTaxForm({ ...taxForm, is_default: e.target.checked })}
                  />
                  Set as system default tax rule
                </label>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowTaxModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Tax Rule</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Discount Modal */}
      {showDiscountModal && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <div className="modal-header">
              <h3>Create Automated Discount Rule</h3>
              <button className="modal-close" onClick={() => setShowDiscountModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreateDiscount}>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label>Discount Code (Optional)</label>
                    <input
                      type="text"
                      value={discountForm.code}
                      onChange={e => setDiscountForm({ ...discountForm, code: e.target.value.toUpperCase() })}
                      placeholder="e.g. SEATS15"
                    />
                  </div>
                  <div className="form-group">
                    <label>Discount Type *</label>
                    <select
                      value={discountForm.type}
                      onChange={e => setDiscountForm({ ...discountForm, type: e.target.value })}
                      style={{ width: '100%', padding: '0.6rem', border: '1.5px solid #e2e8f0', borderRadius: '7px' }}
                    >
                      <option value="percentage">Percentage (%)</option>
                      <option value="fixed">Fixed Amount ($)</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label>Discount Value *</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={discountForm.value}
                      onChange={e => setDiscountForm({ ...discountForm, value: e.target.value })}
                      placeholder={discountForm.type === 'percentage' ? '15 (for 15%)' : '100 (for $100)'}
                    />
                  </div>
                  <div className="form-group">
                    <label>Applies To Product (Optional)</label>
                    <select
                      value={discountForm.product_id}
                      onChange={e => setDiscountForm({ ...discountForm, product_id: e.target.value })}
                      style={{ width: '100%', padding: '0.6rem', border: '1.5px solid #e2e8f0', borderRadius: '7px' }}
                    >
                      <option value="">Whole Subscription</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label>Min Purchase ($)</label>
                    <input
                      type="number"
                      value={discountForm.min_purchase_amount}
                      onChange={e => setDiscountForm({ ...discountForm, min_purchase_amount: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div className="form-group">
                    <label>Min Seats / Qty</label>
                    <input
                      type="number"
                      min="1"
                      value={discountForm.min_quantity}
                      onChange={e => setDiscountForm({ ...discountForm, min_quantity: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Usage Limit (Max Uses)</label>
                    <input
                      type="number"
                      min="1"
                      value={discountForm.usage_limit}
                      onChange={e => setDiscountForm({ ...discountForm, usage_limit: e.target.value })}
                      placeholder="Unlimited"
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label>Valid From *</label>
                    <input
                      type="date"
                      required
                      value={discountForm.valid_from}
                      onChange={e => setDiscountForm({ ...discountForm, valid_from: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Valid Until</label>
                    <input
                      type="date"
                      value={discountForm.valid_until}
                      onChange={e => setDiscountForm({ ...discountForm, valid_until: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowDiscountModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Discount</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
