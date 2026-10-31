import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../api.js'

export default function Login() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Forgot password modal state
  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotMsg, setForgotMsg] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [resetSuccess, setResetSuccess] = useState('')
  const [resetLoading, setResetLoading] = useState(false)

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: form.email, password: form.password }),
      })
      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleQuickDemoLogin(role) {
    setError('')
    setLoading(true)
    try {
      const data = await apiFetch('/api/auth/demo-login', {
        method: 'POST',
        body: JSON.stringify({ role })
      })
      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Demo login failed.')
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotSubmit(e) {
    e.preventDefault()
    setForgotMsg('')
    setResetSuccess('')
    try {
      const data = await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: forgotEmail })
      })
      setForgotMsg(data.message)
      if (data.resetToken) {
        setResetToken(data.resetToken)
      }
    } catch (err) {
      setForgotMsg(err.message || 'Error generating reset link.')
    }
  }

  async function handleResetSubmit(e) {
    e.preventDefault()
    setResetLoading(true)
    try {
      const data = await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken, password: newPassword })
      })
      setResetSuccess(data.message)
      setTimeout(() => {
        setShowForgot(false)
        setResetSuccess('')
        setResetToken('')
        setNewPassword('')
        setForgotEmail('')
      }, 2000)
    } catch (err) {
      setForgotMsg(err.message || 'Failed to reset password.')
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
          <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: '#09090b' }}></span>
          <span style={{ fontSize: '0.85rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#71717a' }}>Brightloop Software</span>
        </div>
        <h1>Subscription Cloud</h1>
        <p>Unified recurring billing and subscription management</p>

        {/* 1-Click Demo Access Bar */}
        <div style={{ background: '#f4f4f5', border: '1px solid #e4e4e7', borderRadius: '10px', padding: '1.1rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <strong style={{ fontSize: '0.82rem', color: '#09090b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              1-Click Demo Access:
            </strong>
            <span style={{ fontSize: '0.7rem', background: '#09090b', color: '#ffffff', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: 700 }}>
              Live Demo
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-sm"
              style={{ background: '#09090b', color: '#ffffff', border: '1px solid #27272a', fontWeight: 700 }}
              onClick={() => handleQuickDemoLogin('admin')}
              disabled={loading}
            >
              Admin View
            </button>
            <button
              type="button"
              className="btn btn-sm"
              style={{ background: '#27272a', color: '#ffffff', border: '1px solid #3f3f46', fontWeight: 700 }}
              onClick={() => handleQuickDemoLogin('staff')}
              disabled={loading}
            >
              Staff View
            </button>
            <button
              type="button"
              className="btn btn-sm"
              style={{ background: '#ffffff', color: '#09090b', border: '1px solid #d4d4d8', fontWeight: 700 }}
              onClick={() => handleQuickDemoLogin('customer')}
              disabled={loading}
            >
              Customer View
            </button>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '0.6rem', textAlign: 'center' }}>
            Click any role above to instantly inspect what each user tier experiences.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{ flex: 1, height: '1px', background: '#e4e4e7' }}></div>
          <span style={{ fontSize: '0.75rem', color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>or sign in manually</span>
          <div style={{ flex: 1, height: '1px', background: '#e4e4e7' }}></div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Work Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={handleChange}
              placeholder="admin@brightloop.io"
            />
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label htmlFor="password" style={{ marginBottom: 0 }}>Password</label>
              <button
                type="button"
                onClick={() => setShowForgot(true)}
                style={{ background: 'none', border: 'none', color: '#71717a', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Forgot password?
              </button>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              style={{ marginTop: '0.35rem' }}
              value={form.password}
              onChange={handleChange}
              placeholder="••••••••"
            />
          </div>

          <button type="submit" className="btn btn-primary form-submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="auth-link">
          Need a customer portal account? <Link to="/signup">Register company</Link>
        </p>
      </div>

      {showForgot && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h3>Reset Your Password</h3>
              <button className="modal-close" onClick={() => setShowForgot(false)}>×</button>
            </div>
            <div className="modal-body">
              {forgotMsg && <div className="alert alert-info">{forgotMsg}</div>}
              {resetSuccess && <div className="alert alert-success">{resetSuccess}</div>}

              {!resetToken ? (
                <form onSubmit={handleForgotSubmit}>
                  <p style={{ fontSize: '0.88rem', color: '#71717a', marginBottom: '1rem' }}>
                    Enter your registered email and a secure reset link will be dispatched.
                  </p>
                  <div className="form-group">
                    <label>Email address</label>
                    <input
                      type="email"
                      required
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      placeholder="you@company.com"
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                    Generate Reset Link
                  </button>
                </form>
              ) : (
                <form onSubmit={handleResetSubmit}>
                  <p style={{ fontSize: '0.85rem', color: '#09090b', marginBottom: '1rem', fontWeight: 700 }}>
                    Token verified. Set your new password below:
                  </p>
                  <div className="form-group">
                    <label>New Password (min 8 chars, Upper, Lower, Special)</label>
                    <input
                      type="password"
                      required
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="NewStrongPass@2026"
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={resetLoading}>
                    {resetLoading ? 'Updating…' : 'Update Password & Log In'}
                  </button>
                </form>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setShowForgot(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
