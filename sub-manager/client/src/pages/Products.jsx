import { useEffect, useState } from 'react'
import Navbar from '../components/Navbar.jsx'
import { apiFetch } from '../api.js'

export default function Products() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')
      try {
        const data = await apiFetch('/api/products')
        setProducts(Array.isArray(data) ? data : [])
      } catch (err) {
        setError(err.message || 'Failed to load products.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  function formatCurrency(value) {
    if (value === undefined || value === null) return '—'
    return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return (
    <div className="app-layout">
      <Navbar />
      <div className="page-content">
        <div className="page-header">
          <h2>Products</h2>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {loading ? (
          <p className="loading-text">Loading products…</p>
        ) : products.length === 0 ? (
          <p className="loading-text">No products found.</p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Sales Price</th>
                  <th>Cost Price</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product, idx) => (
                  <tr key={product._id || product.id || idx}>
                    <td>{idx + 1}</td>
                    <td>{product.name || '—'}</td>
                    <td>{product.type || product.productType || '—'}</td>
                    <td>{formatCurrency(product.sales_price ?? product.salesPrice)}</td>
                    <td>{formatCurrency(product.cost_price ?? product.costPrice)}</td>
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
