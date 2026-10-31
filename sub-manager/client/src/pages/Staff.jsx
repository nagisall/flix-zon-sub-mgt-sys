import { useState, useEffect } from 'react'
import Navbar from '../components/Navbar.jsx'
import { apiFetch } from '../api.js'

export default function Staff() {
  const [staffList, setStaffList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [showAddModal, setShowAddModal] = useState(false)
  const [staffForm, setStaffForm] = useState({
    name: '',
    email: '',
    password: ''
  })

  useEffect(() => {
    loadStaff()
  }, [])

  async function loadStaff() {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch('/api/users/staff')
      setStaffList(res.data || [])
    } catch (err) {
      setError(err.message || 'Failed to load staff list.')
    } finally {
      setLoading(false)
    }
  }

  async function handleAddStaff(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    try {
      await apiFetch('/api/users/staff', {
        method: 'POST',
        body: JSON.stringify(staffForm)
      })
      setSuccess('Staff account created successfully!')
      setShowAddModal(false)
      setStaffForm({ name: '', email: '', password: '' })
      loadStaff()
    } catch (err) {
      setError(err.message || 'Failed to create staff account.')
    }
  }

  return (
    <div className="app-layout">
      <Navbar />
      <div className="page-content">
        <div className="page-header">
          <div>
            <h2>Internal Staff Team</h2>
            <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
              Only Administrators can add and manage internal staff members
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            + Add Staff Member
          </button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        {loading ? (
          <div className="loading-text">Loading staff members…</div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Staff Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Account Status</th>
                  <th>Date Added</th>
                </tr>
              </thead>
              <tbody>
                {staffList.length === 0 ? (
                  <tr><td colSpan="5" className="loading-text">No staff accounts found.</td></tr>
                ) : (
                  staffList.map(s => (
                    <tr key={s.id}>
                      <td><strong>{s.name}</strong></td>
                      <td>{s.email}</td>
                      <td><span className="badge badge-active">{s.role}</span></td>
                      <td>
                        <span className={`badge ${s.is_active ? 'badge-confirmed' : 'badge-draft'}`}>
                          {s.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>{new Date(s.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h3>Add New Staff Member</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>×</button>
            </div>
            <form onSubmit={handleAddStaff}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Staff Name *</label>
                  <input
                    type="text"
                    required
                    value={staffForm.name}
                    onChange={e => setStaffForm({ ...staffForm, name: e.target.value })}
                    placeholder="e.g. Sarah Sales"
                  />
                </div>
                <div className="form-group">
                  <label>Email Address *</label>
                  <input
                    type="email"
                    required
                    value={staffForm.email}
                    onChange={e => setStaffForm({ ...staffForm, email: e.target.value })}
                    placeholder="sarah@brightloop.io"
                  />
                </div>
                <div className="form-group">
                  <label>Temporary Password *</label>
                  <input
                    type="password"
                    required
                    value={staffForm.password}
                    onChange={e => setStaffForm({ ...staffForm, password: e.target.value })}
                    placeholder="Must have >8 chars, Upper, Lower, Special"
                  />
                  <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.35rem' }}>
                    Password policy: &gt;8 chars, at least 1 uppercase, 1 lowercase, 1 special character.
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Staff Account</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
