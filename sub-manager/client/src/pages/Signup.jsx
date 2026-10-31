import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../api.js'

export default function Signup() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      await apiFetch('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ name: form.name, email: form.email, password: form.password }),
      })
      setSuccess('Account created successfully! Redirecting to sign in…')
      setTimeout(() => navigate('/login', { replace: true }), 1500)
    } catch (err) {
      setError(err.message || 'Signup failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
          <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: '#09090b' }}></span>
          <span style={{ fontSize: '0.85rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#71717a' }}>Brightloop Software</span>
        </div>
        <h1>Create Account</h1>
        <p>Register your company for the customer billing portal</p>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">Company / Contact Name</label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              value={form.name}
              onChange={handleChange}
              placeholder="e.g. Apex Global Logistics"
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Work Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={handleChange}
              placeholder="billing@company.com"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              value={form.password}
              onChange={handleChange}
              placeholder="Must have >8 chars, Upper, Lower, Special"
            />
            <div style={{ fontSize: '0.78rem', color: '#71717a', marginTop: '0.35rem' }}>
              Policy: &gt;8 chars, at least 1 uppercase, 1 lowercase, 1 special character.
            </div>
          </div>

          <button type="submit" className="btn btn-primary form-submit" disabled={loading}>
            {loading ? 'Creating account…' : 'Create Customer Account'}
          </button>
        </form>

        <p className="auth-link">
          Already registered? <Link to="/login">Sign in to portal</Link>
        </p>
      </div>
    </div>
  )
}
