import { useState, useEffect } from 'react'
import { apiFetch } from '../api.js'

export default function NewSubscriptionModal({ isOpen, onClose, onSuccess, user }) {
  const [plans, setPlans] = useState([])
  const [products, setProducts] = useState([])
  const [customers, setCustomers] = useState([])
  const [defaultTaxRate, setDefaultTaxRate] = useState(10)
  const [loadingInitial, setLoadingInitial] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState(user?.role === 'customer' ? user.id : '')
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [paymentTerms, setPaymentTerms] = useState('immediate')
  const [items, setItems] = useState([
    {
      product_id: '',
      variant_id: '',
      quantity: 1,
      unit_price: 0
    }
  ])

  useEffect(() => {
    if (isOpen) {
      loadInitialData()
    }
  }, [isOpen])

  async function loadInitialData() {
    setLoadingInitial(true)
    setError('')
    try {
      const [plansData, prodsData, taxesRes] = await Promise.all([
        apiFetch('/api/products/plans').catch(() => []),
        apiFetch('/api/products').catch(() => []),
        apiFetch('/api/taxes').catch(() => ({ data: [] }))
      ])

      const availablePlans = Array.isArray(plansData) ? plansData : []
      const availableProds = Array.isArray(prodsData) ? prodsData : []
      setPlans(availablePlans)
      setProducts(availableProds)

      if (taxesRes?.data?.length > 0) {
        const defTax = taxesRes.data.find(t => t.is_default && t.is_active) || taxesRes.data[0]
        if (defTax?.rate != null) setDefaultTaxRate(defTax.rate)
      }

      // If user is admin/staff, load customers list
      if (user && user.role !== 'customer') {
        const custRes = await apiFetch('/api/users/customers').catch(() => ({ data: [] }))
        const custList = custRes.data || []
        setCustomers(custList)
        if (custList.length > 0 && !selectedCustomerId) {
          setSelectedCustomerId(custList[0].id)
        }
      } else if (user) {
        setSelectedCustomerId(user.id)
      }

      // Smart defaults: choose first plan & first product
      if (availablePlans.length > 0 && !selectedPlanId) {
        setSelectedPlanId(availablePlans[0].id)
      }

      if (availableProds.length > 0) {
        const firstP = availableProds[0]
        setItems([
          {
            product_id: firstP.id,
            variant_id: firstP.variants && firstP.variants.length > 0 ? firstP.variants[0].id : '',
            quantity: 1,
            unit_price: (firstP.sales_price || 0) + (firstP.variants && firstP.variants.length > 0 ? (firstP.variants[0].price_modifier || 0) : 0)
          }
        ])
      }
    } catch (err) {
      setError(err.message || 'Failed to load plans and products.')
    } finally {
      setLoadingInitial(false)
    }
  }

  function handleProductChange(index, productId) {
    const pId = Number(productId)
    const product = products.find(p => p.id === pId)
    const newItems = [...items]

    if (product) {
      const firstVariant = product.variants && product.variants.length > 0 ? product.variants[0] : null
      const modifier = firstVariant ? (firstVariant.price_modifier || 0) : 0
      newItems[index] = {
        ...newItems[index],
        product_id: pId,
        variant_id: firstVariant ? firstVariant.id : '',
        unit_price: (product.sales_price || 0) + modifier
      }
    } else {
      newItems[index] = {
        ...newItems[index],
        product_id: productId,
        variant_id: '',
        unit_price: 0
      }
    }
    setItems(newItems)
  }

  function handleVariantChange(index, variantId) {
    const vId = variantId ? Number(variantId) : ''
    const currentItem = items[index]
    const product = products.find(p => p.id === Number(currentItem.product_id))
    const newItems = [...items]

    if (product) {
      const variant = product.variants ? product.variants.find(v => v.id === vId) : null
      const modifier = variant ? (variant.price_modifier || 0) : 0
      newItems[index] = {
        ...newItems[index],
        variant_id: vId,
        unit_price: (product.sales_price || 0) + modifier
      }
    } else {
      newItems[index] = {
        ...newItems[index],
        variant_id: vId
      }
    }
    setItems(newItems)
  }

  function handleQuantityChange(index, qty) {
    const q = Math.max(1, parseInt(qty, 10) || 1)
    const newItems = [...items]
    newItems[index] = {
      ...newItems[index],
      quantity: q
    }
    setItems(newItems)
  }

  function handleAddItem() {
    if (products.length === 0) return
    const firstP = products[0]
    const firstVariant = firstP.variants && firstP.variants.length > 0 ? firstP.variants[0] : null
    const modifier = firstVariant ? (firstVariant.price_modifier || 0) : 0
    setItems([
      ...items,
      {
        product_id: firstP.id,
        variant_id: firstVariant ? firstVariant.id : '',
        quantity: 1,
        unit_price: (firstP.sales_price || 0) + modifier
      }
    ])
  }

  function handleRemoveItem(index) {
    if (items.length <= 1) return
    setItems(items.filter((_, i) => i !== index))
  }

  // Calculate pricing breakdown
  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0)
  const taxAmount = subtotal * (defaultTaxRate / 100)
  const totalAmount = subtotal + taxAmount

  const selectedPlan = plans.find(p => p.id === Number(selectedPlanId))

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!selectedPlanId) {
      setError('Please select a billing plan.')
      return
    }

    if (!startDate) {
      setError('Please select a valid start date.')
      return
    }

    if (items.length === 0 || items.some(it => !it.product_id)) {
      setError('Please select at least one valid product.')
      return
    }

    setSubmitting(true)

    try {
      const payload = {
        customer_id: user?.role === 'customer' ? user.id : selectedCustomerId,
        plan_id: Number(selectedPlanId),
        start_date: startDate,
        payment_terms: paymentTerms,
        status: 'Active', // Customer subscribes directly to an Active recurring contract
        items: items.map(it => ({
          product_id: Number(it.product_id),
          variant_id: it.variant_id ? Number(it.variant_id) : null,
          quantity: Number(it.quantity) || 1,
          unit_price: Number(it.unit_price) || 0,
          tax_rate: defaultTaxRate
        }))
      }

      const res = await apiFetch('/api/subscriptions', {
        method: 'POST',
        body: JSON.stringify(payload)
      })

      if (onSuccess) {
        onSuccess(res.data)
      }
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to create subscription.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-box"
        style={{ maxWidth: '640px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
              {user?.role === 'customer' ? '✨ Subscribe to a New Plan' : 'Add New Subscription'}
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#71717a' }}>
              Select your subscription plan, product modules, and seats
            </p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {error && <div className="alert alert-error" style={{ marginBottom: 0 }}>{error}</div>}

            {loadingInitial ? (
              <div className="loading-text" style={{ padding: '2rem 0' }}>Loading available plans and products…</div>
            ) : (
              <>
                {/* Customer Account Indicator */}
                {user?.role === 'customer' ? (
                  <div style={{
                    background: '#18181b',
                    border: '1px solid #27272a',
                    borderRadius: '8px',
                    padding: '0.75rem 1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.85rem'
                  }}>
                    <div>
                      <span style={{ color: '#a1a1aa' }}>Subscriber: </span>
                      <strong style={{ color: '#ffffff' }}>{user.name}</strong>
                      <span style={{ color: '#71717a', marginLeft: '6px' }}>({user.email})</span>
                    </div>
                    <span className="role-badge" style={{ fontSize: '0.7rem' }}>Customer</span>
                  </div>
                ) : (
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#27272a', marginBottom: '4px', display: 'block' }}>
                      Customer Account *
                    </label>
                    <select
                      className="form-control"
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
                      required
                    >
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} — {c.email}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Plan Selection */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#27272a', marginBottom: '4px', display: 'block' }}>
                    Choose Recurring Plan *
                  </label>
                  <select
                    className="form-control"
                    value={selectedPlanId}
                    onChange={(e) => setSelectedPlanId(e.target.value)}
                    required
                  >
                    {plans.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.frequency?.toUpperCase()}) — ${p.price?.toLocaleString()} / {p.frequency}
                      </option>
                    ))}
                  </select>
                  {selectedPlan && (
                    <div style={{ fontSize: '0.78rem', color: '#71717a', marginTop: '4px', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span>Billing cadence: <strong style={{ color: '#09090b', textTransform: 'capitalize' }}>{selectedPlan.frequency}</strong></span>
                      <span>•</span>
                      <span>Terms: Auto-recurring renewal</span>
                    </div>
                  )}
                </div>

                {/* Products & Line Items */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#27272a', margin: 0 }}>
                      Products & Add-on Modules *
                    </label>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={handleAddItem}
                      style={{ fontSize: '0.78rem', padding: '0.2rem 0.6rem' }}
                    >
                      + Add Another Module
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {items.map((item, idx) => {
                      const prod = products.find(p => p.id === Number(item.product_id))
                      const hasVariants = prod && prod.variants && prod.variants.length > 0

                      return (
                        <div
                          key={idx}
                          style={{
                            background: '#fafafa',
                            border: '1px solid #e4e4e7',
                            borderRadius: '8px',
                            padding: '0.75rem',
                            display: 'grid',
                            gridTemplateColumns: hasVariants ? '2fr 1.5fr 1fr 1fr auto' : '2.5fr 1fr 1fr auto',
                            gap: '0.5rem',
                            alignItems: 'end'
                          }}
                        >
                          {/* Product select */}
                          <div>
                            <span style={{ fontSize: '0.72rem', color: '#71717a', display: 'block', marginBottom: '2px' }}>Product</span>
                            <select
                              className="form-control"
                              style={{ fontSize: '0.82rem', padding: '0.35rem 0.5rem' }}
                              value={item.product_id}
                              onChange={(e) => handleProductChange(idx, e.target.value)}
                              required
                            >
                              {products.map(p => (
                                <option key={p.id} value={p.id}>
                                  {p.name} (${p.sales_price})
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Variant select if available */}
                          {hasVariants && (
                            <div>
                              <span style={{ fontSize: '0.72rem', color: '#71717a', display: 'block', marginBottom: '2px' }}>Tier / Edition</span>
                              <select
                                className="form-control"
                                style={{ fontSize: '0.82rem', padding: '0.35rem 0.5rem' }}
                                value={item.variant_id}
                                onChange={(e) => handleVariantChange(idx, e.target.value)}
                              >
                                {prod.variants.map(v => (
                                  <option key={v.id} value={v.id}>
                                    {v.variant_name} (+${v.price_modifier})
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          {/* Quantity / Seats */}
                          <div>
                            <span style={{ fontSize: '0.72rem', color: '#71717a', display: 'block', marginBottom: '2px' }}>Quantity</span>
                            <input
                              type="number"
                              className="form-control"
                              style={{ fontSize: '0.82rem', padding: '0.35rem 0.5rem' }}
                              min="1"
                              value={item.quantity}
                              onChange={(e) => handleQuantityChange(idx, e.target.value)}
                              required
                            />
                          </div>

                          {/* Unit price */}
                          <div>
                            <span style={{ fontSize: '0.72rem', color: '#71717a', display: 'block', marginBottom: '2px' }}>Unit Price</span>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#09090b', padding: '0.4rem 0' }}>
                              ${item.unit_price?.toFixed(2)}
                            </div>
                          </div>

                          {/* Remove button */}
                          {items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="btn btn-outline btn-sm"
                              style={{ padding: '0.35rem 0.5rem', color: '#dc2626', borderColor: '#fca5a5' }}
                              title="Remove item"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Billing Schedule & Terms */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#27272a', marginBottom: '4px', display: 'block' }}>
                      Start Date *
                    </label>
                    <input
                      type="date"
                      className="form-control"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#27272a', marginBottom: '4px', display: 'block' }}>
                      Payment Terms *
                    </label>
                    <select
                      className="form-control"
                      value={paymentTerms}
                      onChange={(e) => setPaymentTerms(e.target.value)}
                    >
                      <option value="immediate">Immediate (Upon Activation)</option>
                      <option value="15 days">Net 15 Days</option>
                      <option value="30 days">Net 30 Days</option>
                    </select>
                  </div>
                </div>

                {/* Real-time Order Summary Card */}
                <div style={{
                  background: '#09090b',
                  color: '#ffffff',
                  borderRadius: '10px',
                  padding: '1.15rem 1.25rem',
                  marginTop: '0.25rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', borderBottom: '1px solid #27272a', paddingBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.82rem', color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
                      Billing Summary
                    </span>
                    <span className="badge badge-active" style={{ fontSize: '0.72rem', textTransform: 'capitalize' }}>
                      {selectedPlan?.frequency || 'Monthly'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#d4d4d8', marginBottom: '0.35rem' }}>
                    <span>Subtotal ({items.reduce((s, it) => s + (it.quantity || 1), 0)} seats / items):</span>
                    <span>${subtotal.toFixed(2)}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#d4d4d8', marginBottom: '0.5rem' }}>
                    <span>Estimated Tax ({defaultTaxRate}% standard):</span>
                    <span>${taxAmount.toFixed(2)}</span>
                  </div>

                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    borderTop: '1px solid #27272a',
                    paddingTop: '0.6rem',
                    marginTop: '0.4rem'
                  }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#ffffff' }}>
                      Total Recurring Amount:
                    </span>
                    <span style={{ fontSize: '1.3rem', fontWeight: 800, color: '#ffffff' }}>
                      ${totalAmount.toFixed(2)}
                      <span style={{ fontSize: '0.78rem', color: '#a1a1aa', fontWeight: 500, marginLeft: '4px' }}>
                        /{selectedPlan?.frequency || 'mo'}
                      </span>
                    </span>
                  </div>

                  <div style={{ fontSize: '0.75rem', color: '#a1a1aa', marginTop: '0.6rem', borderTop: '1px dashed #27272a', paddingTop: '0.5rem' }}>
                    ℹ️ Activating this subscription will immediately create your contract and issue your initial invoice.
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="modal-footer" style={{ padding: '1rem 1.5rem', background: '#fafafa', borderTop: '1px solid #e4e4e7', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || loadingInitial}
              style={{ minWidth: '160px' }}
            >
              {submitting ? 'Activating…' : (user?.role === 'customer' ? 'Confirm & Subscribe' : 'Create Subscription')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
