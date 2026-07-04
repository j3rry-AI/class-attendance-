import React, { useState } from 'react'
import '../styles/forgotpassword.css'

export default function ForgotPasswordPage({ onNavigate }) {
  const [step, setStep] = useState(1)
  const [reg, setReg] = useState('')
  const [otp, setOtp] = useState('')
  const [newPass, setNewPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState({})

  const verifyUser = (e) => {
    e.preventDefault()
    setErrors({})
    if (!reg.trim()) return setErrors({ reg: 'Registration number is required' })
    // Simulate
    setMessage('Verification code sent to your account')
    setStep(2)
  }

  const verifyOtp = (e) => {
    e.preventDefault()
    if (!otp || otp.length !== 6) return setErrors({ otp: 'Enter 6-digit code' })
    setMessage('Code verified')
    setStep(3)
  }

  const resetPassword = (e) => {
    e.preventDefault()
    if (newPass.length < 8) return setErrors({ newPass: 'Password too short' })
    if (newPass !== confirm) return setErrors({ confirm: 'Passwords do not match' })
    setMessage('Password reset successful')
    alert('Password reset (demo)')
    onNavigate('login')
  }

  return (
    <div className="page-wrap">
      <div className="auth-card">
        <div className="card-left">
          <div className="brand">
            <div className="logo">🔐</div>
            <h1>Reset Your Password</h1>
            <div className="subtitle-small">Enter your registration number to receive a verification code</div>
          </div>
        </div>
        <div className="card-right">
          {message && <div className="message success">{message}</div>}

          {step === 1 && (
            <form onSubmit={verifyUser} id="step1Form" className="auth-form">
              <label className="field-label">UTME / Matriculation Number</label>
              <input className="field-input" value={reg} onChange={e => setReg(e.target.value)} placeholder="e.g., 2024CS001" />
              <div className="error-message">{errors.reg}</div>

              <div className="subtitle-small">Enter your registration number to recover access</div>

              <div className="button-group">
                <button type="button" className="back-btn" onClick={() => onNavigate('login')}>← Back to Login</button>
                <button type="submit" className="send-btn">Send Verification Code →</button>
              </div>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={verifyOtp} id="step2Form" className="auth-form">
              <label className="field-label">Verification Code</label>
              <input className="field-input" value={otp} onChange={e => setOtp(e.target.value)} placeholder="Enter 6-digit code" maxLength={6} />
              <div className="error-message">{errors.otp}</div>

              <div className="button-group">
                <button type="button" className="back-btn" onClick={() => setStep(1)}>← Back</button>
                <button type="submit" className="send-btn">Verify Code →</button>
              </div>
            </form>
          )}

          {step === 3 && (
            <form onSubmit={resetPassword} id="step3Form" className="auth-form">
              <label className="field-label">New Password</label>
              <input className="field-input" type={"password"} value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="Minimum 8 characters" />
              <div className="error-message">{errors.newPass}</div>

              <label className="field-label">Confirm New Password</label>
              <input className="field-input" type={"password"} value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Re-enter your new password" />
              <div className="error-message">{errors.confirm}</div>

              <div className="button-group">
                <button type="button" className="back-btn" onClick={() => setStep(2)}>← Back</button>
                <button type="submit" className="send-btn">Reset Password →</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
