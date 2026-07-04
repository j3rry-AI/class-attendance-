import React, { useState } from 'react'
import '../styles/activstudentloginstyle.css'
import { apiFetch } from '../utils/api'

export default function LoginPage({ onNavigate }) {
  const [regNumber, setRegNumber] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [role, setRole] = useState('student')
  const [loginTitle, setLoginTitle] = useState('Dr')
  const [loginName, setLoginName] = useState('')
  const [loginDept, setLoginDept] = useState('Computer-Science')
  const [loginStudentDept, setLoginStudentDept] = useState('ifs')
  const [loginMatric, setLoginMatric] = useState('')
  const [errors, setErrors] = useState({})

  const handleSubmit = (e) => {
    e.preventDefault()
    const errs = {}
    if (role === 'student') {
      if (!loginStudentDept.trim()) errs.reg = 'Department required'
      if (!/^[0-9]{6}$/.test(loginMatric.trim())) errs.reg = 'Matric must be 6 digits'
    } else if (role === 'lecturer') {
      if (!loginName.trim()) errs.reg = 'Name required'
      if (!loginDept.trim()) errs.reg = 'Department required'
    } else {
      if (!regNumber.trim()) errs.reg = 'Registration number is required'
    }
    if (!password) errs.pass = 'Password is required'
    setErrors(errs)
    if (Object.keys(errs).length) return

    // compose reg_number for lecturers/students
    let user = regNumber.trim()
    if (role === 'student') user = `${loginStudentDept}${loginMatric}`
    if (role === 'lecturer') user = `FUTA/STAFF/${loginTitle}/${loginName.trim().replace(/\s+/g,'-')}/${loginDept.trim().replace(/\s+/g,'-')}`

    // validate composed user id before sending
    const studentPattern = /^[A-Za-z]{3}\d{6}$/
    const lecturerPattern = /^FUTA\/STAFF\/(Dr|Professor|Prof|Mr|Mrs|Ms)\/[A-Za-z\-]+\/[A-Za-z\-\s]+$/i
    if (role === 'student' && !studentPattern.test(user)) {
      setErrors({ reg: 'Invalid student format. Use e.g., ifs204981' })
      return
    }
    if (role === 'lecturer' && !lecturerPattern.test(user)) {
      setErrors({ reg: 'Invalid lecturer ID. Use FUTA/STAFF/Dr/John-Doe/Department' })
      return
    }

    apiFetch('/api/login', {
      method: 'POST',
      body: { reg_number: user, password, role }
    })
      .then(({ ok, data, error }) => {
        if (ok && data?.success) {
          if (data.token) {
            window.localStorage.setItem('token', data.token);
            window.localStorage.setItem('authToken', data.token);
          }
          const loggedInUser = {
            reg_number: data.reg_number,
            name: data.name,
            role: data.role,
            has_face: data.has_face || false
          };
          onNavigate('dashboard', { role: data.role || role, user: loggedInUser });
        } else {
          const msg = error?.message || error?.error || data?.message || data?.error || 'Invalid credentials';
          setErrors({ form: msg });
        }
      })
      .catch(err => {
        console.error('Login error', err);
        setErrors({ form: 'Network error. Please try again.' });
      })
  }

  return (
    <div className="page-wrap">
      <div className="auth-card">
        <div className="card-left">
          <div className="brand">
            <div className="logo">🎓</div>
            <h1>Multifactor University<br/>Attendance</h1>
            <div className="subtitle-small">Webcam • Geolocation</div>
          </div>
        </div>

        <div className="card-right">
          <form onSubmit={handleSubmit} className="auth-form">
            <label className="field-label">MATRIC NUMBER / ID</label>
            {role === 'student' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="field-input" value={loginStudentDept} onChange={e => setLoginStudentDept(e.target.value)} style={{flex:1}} placeholder="ifs" />
                <input className="field-input" value={loginMatric} onChange={e => setLoginMatric(e.target.value)} style={{flex:2}} placeholder="204871" />
              </div>
            )}
            {role === 'lecturer' && (
              <>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select className="field-input" value={loginTitle} onChange={e => setLoginTitle(e.target.value)} style={{width:160}}>
                    <option>Dr</option>
                    <option>Professor</option>
                    <option>Prof</option>
                    <option>Mr</option>
                    <option>Mrs</option>
                    <option>Ms</option>
                  </select>
                  <input className="field-input" value={loginName} onChange={e => setLoginName(e.target.value)} style={{flex:2}} placeholder="John Doe" />
                </div>
                <input className="field-input" value={loginDept} onChange={e => setLoginDept(e.target.value)} placeholder="Computer-Science" style={{marginTop:8}} />
              </>
            )}
            {role === 'admin' && (
              <>
                <input className="field-input" value={regNumber} onChange={e => setRegNumber(e.target.value)} placeholder="admin-id" />
              </>
            )}
            <div className="error-message">{errors.reg}</div>

            <div className="role-wrap">
              <select value={role} onChange={e => setRole(e.target.value)}>
                <option value="student">Student</option>
                <option value="lecturer">Lecturer</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <label className="field-label">PASSWORD</label>
            <input className="field-input" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" />
            <div className="error-message">{errors.pass}</div>

            <div className="form-row">
              <label className="show-password"><input type="checkbox" checked={showPassword} onChange={e => setShowPassword(e.target.checked)} /> Show password</label>
              <button type="button" className="link" onClick={() => onNavigate('forgot')}>Forgot Password?</button>
            </div>

            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:16}}>
              <button type="submit" className="btn">Login</button>
              <button type="button" className="link" onClick={() => onNavigate('activate')}>Create account</button>
            </div>
            {errors.form && <div className="error-message" style={{marginTop:12}}>{errors.form}</div>}
          </form>
        </div>
      </div>
    </div>
  )
}
