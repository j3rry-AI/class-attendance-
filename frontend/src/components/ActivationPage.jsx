import React, { useState } from 'react'
import '../styles/activationpagestyle.css'

export default function ActivationPage({ onNavigate }) {
  const [name, setName] = useState('')
  const [studentDept, setStudentDept] = useState('ifs')
  const [matric, setMatric] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState({})

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = {}
    if (!name.trim()) errs.name = 'Full name is required'
    if (!studentDept.trim()) errs.reg = 'Department required'
    if (!/^[0-9]{6}$/.test(matric.trim())) errs.reg = 'Matric number must be 6 digits'
    if (password.length < 6) errs.password = 'Password must be at least 6 chars'
    if (password !== confirm) errs.confirm = 'Passwords do not match'
    setErrors(errs)
    if (Object.keys(errs).length) return

    try {
      const reg_number = `${studentDept}${matric}`
      const studentPattern = /^[A-Za-z]{3}\d{6}$/
      if (!studentPattern.test(reg_number)) {
        setErrors({ reg: 'Invalid student format. Use e.g., ifs204981' })
        return
      }

      const payload = { name, reg_number, password }
      const res = await fetch('http://127.0.0.1:3000/api/users/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        alert('Account created. You can now login.')
        onNavigate('login')
      } else {
        setErrors({ form: data.error || data.detail || 'Registration failed' })
      }
    } catch (err) {
      console.error('Registration error', err)
      setErrors({ form: 'Network error. Please try again.' })
    }
  }

  return (
    <div className="page-wrap">
      <div className="auth-card">
        <div className="card-left">
          <div className="brand">
            <div className="logo">🔍</div>
            <h1>Multifactor University<br/>Attendance System</h1>
            <div className="subtitle-small">Activate your account</div>
          </div>
        </div>
        <div className="card-right">
          <form onSubmit={handleSubmit} className="auth-form">
            <label className="field-label">FULL NAME</label>
            <input className="field-input" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Doe" />
            <div className="error-message">{errors.name}</div>

            <label className="field-label">MATRIC NUMBER / ID</label>
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="field-input" value={studentDept} onChange={e => setStudentDept(e.target.value)} style={{flex:1}} placeholder="ifs" />
                <input className="field-input" value={matric} onChange={e => setMatric(e.target.value)} style={{flex:2}} placeholder="204871" />
              </div>
              <div className="error-message">{errors.reg}</div>
            </>

            <label className="field-label">PASSWORD</label>
            <input className="field-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter Password" />
            <div className="error-message">{errors.password}</div>

            <label className="field-label">CONFIRM PASSWORD</label>
            <input className="field-input" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Confirm Password" />
            <div className="error-message">{errors.confirm}</div>

            {errors.form && <div className="error-message" style={{ marginTop: 12 }}>{errors.form}</div>}

            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:16}}>
              <button type="submit" className="btn">Create account</button>
              <button type="button" className="link" onClick={() => onNavigate('login')}>Already have an account? Login</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
