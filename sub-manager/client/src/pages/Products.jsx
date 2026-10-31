import { useState, useEffect } from 'react'
import Navbar from '../components/Navbar.jsx'
import { apiFetch } from '../api.js'

export default function Products() {
  const [activeTab, setActiveTab] = useState('products') // 'products' | 'plans'
  const [products, setProducts] = useState([])
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Product modal
  const [showProductModal, setShowProductModal] = useState(false)
  const [productForm, setProductForm] = useState({
    name: '',
    type: 'Software',
    sales_price: '',
    cost_price: '',
    notes: '',
    variant_name: '',
    price_modifier: ''
  })

  // Variant modal
  const [showVariantModal, setShowVariantModal] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [variantForm, setVariantForm] = useState({
    variant_name: '',
    price_modifier: '',
    cost_modifier: ''
  })

  // Plan modal
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [planForm, setPlanForm] = useState({
    name: '',
    frequency: 'monthly',
    price: '',
    minimum_quantity: 1,
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    auto_close: false,
    allow_pause: true,
    allow_renew: true,
    allow_close_early: true
  })

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const [prodRes, planRes] = await Promise.all([
        apiFetch('/api/products'),
        apiFetch('/api/products/plans')
      ])
      setProducts(prodRes || [])
      setPlans(planRes || [])
    } catch (err) {
      setError(err.message || 'Failed to load catalog.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateProduct(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    try {
      await apiFetch('/api/products', {
        method: 'POST',
        body: JSON.stringify({
          name: productForm.name,
          type: productForm.type,
          sales_price: parseFloat(productForm.sales_price),
          cost_price: parseFloat(productForm.cost_price),
          notes: productForm.notes,
          variant_name: productForm.variant_name || undefined,
          price_modifier: productForm.price_modifier ? parseFloat(productForm.price_modifier) : undefined
        })
      })
      setSuccess('Product and variant created successfully!')
      setShowProductModal(false)
      setProductForm({ name: '', type: 'Software', sales_price: '', cost_price: '', notes: '', variant_name: '', price_modifier: '' })
      loadData()
    } catch (err) {
      setError(err.message || 'Failed to create product.')
    }
  }

  async function handleAddVariant(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    try {
      await apiFetch(`/api/products/${selectedProduct.id}/variants`, {
        method: 'POST',
        body: JSON.stringify({
          variant_name: variantForm.variant_name,
          price_modifier: parseFloat(variantForm.price_modifier) || 0,
          cost_modifier: parseFloat(variantForm.cost_modifier) || 0
        })
      })
      setSuccess('Variant added successfully!')
      setShowVariantModal(false)
      setVariantForm({ variant_name: '', price_modifier: '', cost_modifier: '' })
      loadData()
    } catch (err) {
      setError(err.message || 'Failed to add variant.')
    }
  }

  async function handleCreatePlan(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    try {
      await apiFetch('/api/products/plans', {
        method: 'POST',
        body: JSON.stringify({
          name: planForm.name,
          frequency: planForm.frequency,
          price: parseFloat(planForm.price) || 0,
          minimum_quantity: parseInt(planForm.minimum_quantity) || 1,
          start_date: planForm.start_date,
          end_date: planForm.end_date || undefined,
          auto_close: planForm.auto_close,
          allow_pause: planForm.allow_pause,
          allow_renew: planForm.allow_renew,
          allow_close_early: planForm.allow_close_early
        })
      })
      setSuccess('Recurring billing plan created successfully!')
      setShowPlanModal(false)
      loadData()
    } catch (err) {
      setError(err.message || 'Failed to create billing plan.')
    }
  }

  return (
    <div className="app-layout">
      <Navbar />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h2>Products & Billing Plans</h2>
            <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
              Define products, add-ons, price-modifying variants, and recurring billing plans
            </p>
          </div>
          <div>
            {activeTab === 'products' ? (
              <button className="btn btn-primary" onClick={() => setShowProductModal(true)}>
                + New Product
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => setShowPlanModal(true)}>
                + New Billing Plan
              </button>
            )}
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <div className="tabs">
          <button
            className={`tab-btn ${activeTab === 'products' ? 'active' : ''}`}
            onClick={() => setActiveTab('products')}
          >
            📦 Products & Variants ({products.length})
          </button>
          <button
            className={`tab-btn ${activeTab === 'plans' ? 'active' : ''}`}
            onClick={() => setActiveTab('plans')}
          >
            🗓️ Recurring Plans ({plans.length})
          </button>
        </div>

        {loading ? (
          <div className="loading-text">Loading catalog data…</div>
        ) : activeTab === 'products' ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Product Name</th>
                  <th>Type</th>
                  <th>Base Sales Price</th>
                  <th>Cost Price</th>
                  <th>Variants & Modifiers</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr><td colSpan="6" className="loading-text">No products added yet.</td></tr>
                ) : (
                  products.map(p => (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.name}</strong>
                        {p.notes && <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{p.notes}</div>}
                      </td>
                      <td><span className="badge" style={{ background: '#e0f2fe', color: '#0369a1' }}>{p.type}</span></td>
                      <td>${p.sales_price?.toFixed(2)}</td>
                      <td>${p.cost_price?.toFixed(2)}</td>
                      <td>
                        {p.variants && p.variants.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            {p.variants.map(v => (
                              <span key={v.id} style={{ fontSize: '0.82rem' }}>
                                🏷️ <strong>{v.variant_name}</strong>: +${v.price_modifier?.toFixed(2)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '0.82rem' }}>No variants</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => {
                            setSelectedProduct(p)
                            setShowVariantModal(true)
                          }}
                        >
                          + Add Variant
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Plan Name</th>
                  <th>Frequency</th>
                  <th>Base Price</th>
                  <th>Min Qty</th>
                  <th>Dates Available</th>
                  <th>Lifecycle Rules</th>
                </tr>
              </thead>
              <tbody>
                {plans.length === 0 ? (
                  <tr><td colSpan="6" className="loading-text">No plans created yet.</td></tr>
                ) : (
                  plans.map(pl => (
                    <tr key={pl.id}>
                      <td><strong>{pl.name}</strong></td>
                      <td>
                        <span className="badge" style={{ background: '#f3e8ff', color: '#6b21a8', textTransform: 'capitalize' }}>
                          {pl.frequency}
                        </span>
                      </td>
                      <td>${pl.price?.toFixed(2) || '0.00'}</td>
                      <td>{pl.minimum_quantity} seat(s)</td>
                      <td>
                        {pl.start_date} {pl.end_date ? `to ${pl.end_date}` : '(Ongoing)'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          {pl.auto_close ? <span className="badge badge-draft">Auto-Close</span> : null}
                          {pl.allow_pause !== 0 && <span className="badge badge-quotation">Pausable</span>}
                          {pl.allow_renew !== 0 && <span className="badge badge-active">Renewable</span>}
                          {pl.allow_close_early !== 0 && <span className="badge badge-confirmed">Early Close</span>}
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

      {/* New Product Modal */}
      {showProductModal && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <div className="modal-header">
              <h3>Create New Product & Variant</h3>
              <button className="modal-close" onClick={() => setShowProductModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreateProduct}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Product Name *</label>
                  <input
                    type="text"
                    required
                    value={productForm.name}
                    onChange={e => setProductForm({ ...productForm, name: e.target.value })}
                    placeholder="e.g. Brightloop ERP Core"
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label>Type *</label>
                    <input
                      type="text"
                      required
                      value={productForm.type}
                      onChange={e => setProductForm({ ...productForm, type: e.target.value })}
                      placeholder="e.g. Software, Add-on, Service"
                    />
                  </div>
                  <div className="form-group">
                    <label>Base Sales Price ($) *</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={productForm.sales_price}
                      onChange={e => setProductForm({ ...productForm, sales_price: e.target.value })}
                      placeholder="1200.00"
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label>Cost Price ($) *</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={productForm.cost_price}
                      onChange={e => setProductForm({ ...productForm, cost_price: e.target.value })}
                      placeholder="400.00"
                    />
                  </div>
                  <div className="form-group">
                    <label>Notes</label>
                    <input
                      type="text"
                      value={productForm.notes}
                      onChange={e => setProductForm({ ...productForm, notes: e.target.value })}
                      placeholder="Internal description"
                    />
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '0.5rem' }}>
                  <h4 style={{ fontSize: '0.9rem', color: '#334155', marginBottom: '0.5rem' }}>
                    Optional Variant (e.g. Odoo Brand Variant)
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Variant Name</label>
                      <input
                        type="text"
                        value={productForm.variant_name}
                        onChange={e => setProductForm({ ...productForm, variant_name: e.target.value })}
                        placeholder="e.g. Odoo Brand"
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Price Modifier ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={productForm.price_modifier}
                        onChange={e => setProductForm({ ...productForm, price_modifier: e.target.value })}
                        placeholder="+560.00"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowProductModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Product</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Variant Modal */}
      {showVariantModal && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3>Add Variant to {selectedProduct?.name}</h3>
              <button className="modal-close" onClick={() => setShowVariantModal(false)}>×</button>
            </div>
            <form onSubmit={handleAddVariant}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Variant Name *</label>
                  <input
                    type="text"
                    required
                    value={variantForm.variant_name}
                    onChange={e => setVariantForm({ ...variantForm, variant_name: e.target.value })}
                    placeholder="e.g. Enterprise Edition, Brand Add-on"
                  />
                </div>
                <div className="form-group">
                  <label>Price Modifier ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={variantForm.price_modifier}
                    onChange={e => setVariantForm({ ...variantForm, price_modifier: e.target.value })}
                    placeholder="e.g. 560.00"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowVariantModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Variant</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Plan Modal */}
      {showPlanModal && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <div className="modal-header">
              <h3>Create Recurring Billing Plan</h3>
              <button className="modal-close" onClick={() => setShowPlanModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreatePlan}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Plan Name *</label>
                  <input
                    type="text"
                    required
                    value={planForm.name}
                    onChange={e => setPlanForm({ ...planForm, name: e.target.value })}
                    placeholder="e.g. Annual Growth Contract"
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label>Billing Frequency *</label>
                    <select
                      value={planForm.frequency}
                      onChange={e => setPlanForm({ ...planForm, frequency: e.target.value })}
                      style={{ width: '100%', padding: '0.6rem', border: '1.5px solid #e2e8f0', borderRadius: '7px' }}
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Base Plan Price ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={planForm.price}
                      onChange={e => setPlanForm({ ...planForm, price: e.target.value })}
                      placeholder="1200.00"
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label>Min Quantity</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={planForm.minimum_quantity}
                      onChange={e => setPlanForm({ ...planForm, minimum_quantity: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Start Date *</label>
                    <input
                      type="date"
                      required
                      value={planForm.start_date}
                      onChange={e => setPlanForm({ ...planForm, start_date: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>End Date</label>
                    <input
                      type="date"
                      value={planForm.end_date}
                      onChange={e => setPlanForm({ ...planForm, end_date: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '0.75rem' }}>Lifecycle Control Rules</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem' }}>
                      <input
                        type="checkbox"
                        checked={planForm.auto_close}
                        onChange={e => setPlanForm({ ...planForm, auto_close: e.target.checked })}
                      />
                      Auto-close when plan ends
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem' }}>
                      <input
                        type="checkbox"
                        checked={planForm.allow_pause}
                        onChange={e => setPlanForm({ ...planForm, allow_pause: e.target.checked })}
                      />
                      Allow pausing
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem' }}>
                      <input
                        type="checkbox"
                        checked={planForm.allow_renew}
                        onChange={e => setPlanForm({ ...planForm, allow_renew: e.target.checked })}
                      />
                      Allow renewal
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem' }}>
                      <input
                        type="checkbox"
                        checked={planForm.allow_close_early}
                        onChange={e => setPlanForm({ ...planForm, allow_close_early: e.target.checked })}
                      />
                      Allow closing early
                    </label>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowPlanModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Plan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
