// src/components/Profile.jsx
import React, { useState, useEffect } from 'react';
import apiFetch from '../utils/api';

export default function Profile({ user, regNumber, onNavigate }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [profile, setProfile] = useState({
    name: '',
    phone: '',
    reg_number: '',
    role: '',
    face_registered: false,
    face_descriptor_version: 0,
    last_face_update: null,
    account_created: '',
    login_attempts: 0
  });
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    phone: ''
  });
  
  // Password change states
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordData, setPasswordData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: ''
  });
  const [changingPassword, setChangingPassword] = useState(false);

  // Fetch profile data
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await apiFetch(`/api/users/${encodeURIComponent(regNumber)}/profile`);
        if (res.ok) {
          setProfile(res.data);
          setFormData({
            phone: res.data.phone || ''
          });
        } else {
          setMessage({ type: 'error', text: res.error || 'Failed to load profile' });
        }
      } catch (error) {
        if (import.meta.env.DEV) console.error('Error fetching profile:', error);
        setMessage({ type: 'error', text: 'Network error. Please try again.' });
      } finally {
        setLoading(false);
      }
    };
    
    if (regNumber) {
      fetchProfile();
    }
  }, [regNumber]);

  // Handle form input changes
  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  // Handle password input changes
  const handlePasswordChange = (e) => {
    setPasswordData({
      ...passwordData,
      [e.target.name]: e.target.value
    });
  };

  // Validate phone format
  const isValidPhone = (phone) => {
    const phoneRegex = /^(0|234)?[789][01]\d{8}$/;
    return phoneRegex.test(phone);
  };

  // Save profile changes
  const handleSave = async () => {
    if (formData.phone && !isValidPhone(formData.phone)) {
      setMessage({ type: 'error', text: 'Please enter a valid Nigerian phone number (e.g., 08012345678 or 2348012345678)' });
      return;
    }
    
    setSaving(true);
    setMessage(null);
    
    try {
      const response = await apiFetch(`/api/users/${regNumber}/profile`, {
        method: 'PUT',
        body: {
          phone: formData.phone
        }
      });
      
      if (response.ok) {
        setProfile(prev => ({ ...prev, phone: formData.phone }));
        setMessage({ type: 'success', text: 'Profile updated successfully!' });
        setEditMode(false);
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: response.error || 'Failed to update profile' });
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error updating profile:', error);
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  // Cancel edit mode
  const handleCancel = () => {
    setFormData({
      phone: profile.phone || ''
    });
    setEditMode(false);
    setMessage(null);
  };

  // Change password
  const handleChangePassword = async () => {
    // Validate passwords
    if (!passwordData.current_password) {
      setMessage({ type: 'error', text: 'Please enter your current password' });
      return;
    }
    
    if (passwordData.new_password.length < 6) {
      setMessage({ type: 'error', text: 'New password must be at least 6 characters' });
      return;
    }
    
    if (passwordData.new_password !== passwordData.confirm_password) {
      setMessage({ type: 'error', text: 'New passwords do not match' });
      return;
    }
    
    setChangingPassword(true);
    setMessage(null);
    
    try {
      const response = await apiFetch(`/api/users/${regNumber}/change-password`, {
        method: 'POST',
        body: {
          current_password: passwordData.current_password,
          new_password: passwordData.new_password
        }
      });
      
      if (response.ok) {
        setMessage({ type: 'success', text: 'Password changed successfully!' });
        setShowPasswordModal(false);
        setPasswordData({ current_password: '', new_password: '', confirm_password: '' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: response.error || 'Failed to change password' });
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error changing password:', error);
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setChangingPassword(false);
    }
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="profile-loading">
        <div className="loading-spinner"></div>
        <p>Loading profile...</p>
        <style>{`
          .profile-loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 400px;
          }
          .loading-spinner {
            width: 50px;
            height: 50px;
            border: 3px solid #e5e7eb;
            border-top-color: #4F46E5;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-bottom: 16px;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="profile-container">
      <div className="profile-header">
        <h2>👤 My Profile</h2>
        <p>View and manage your personal information</p>
      </div>

      {/* Message Display */}
      {message && (
        <div className={`profile-message ${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="profile-content">
        {/* Profile Picture Section */}
        <div className="profile-picture-section">
          <div className="avatar-large">
            {profile.name ? profile.name.charAt(0).toUpperCase() : '👤'}
          </div>
          <div className="face-status-badge">
            {profile.face_registered ? (
              <span className="badge success">✅ Face Registered</span>
            ) : (
              <span className="badge warning">⚠️ Face Not Registered</span>
            )}
          </div>
          {!profile.face_registered && (
            <button 
              className="register-face-link"
              onClick={() => onNavigate('register-face')}
            >
              Register Face Now →
            </button>
          )}
        </div>

        {/* Profile Information */}
        <div className="profile-info-section">
          <div className="info-card">
            <h3>Personal Information</h3>
            
            <div className="info-row">
              <div className="info-label">Full Name:</div>
              <div className="info-value">{profile.name || 'N/A'}</div>
            </div>
            
            <div className="info-row">
              <div className="info-label">Registration Number:</div>
              <div className="info-value">{profile.reg_number || 'N/A'}</div>
            </div>
            
            <div className="info-row">
              <div className="info-label">Role:</div>
              <div className="info-value">
                <span className="role-badge">{profile.role?.toUpperCase() || 'STUDENT'}</span>
              </div>
            </div>
            
            <div className="info-row">
              <div className="info-label">Phone Number:</div>
              {editMode ? (
                <div className="info-edit">
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="e.g., 08012345678"
                    className="edit-input"
                  />
                </div>
              ) : (
                <div className="info-value">{profile.phone || 'Not provided'}</div>
              )}
            </div>
            
            <div className="info-row">
              <div className="info-label">Account Created:</div>
              <div className="info-value">{formatDate(profile.account_created)}</div>
            </div>
          </div>

          {/* Face Recognition Info */}
          <div className="info-card">
            <h3>Face Recognition Status</h3>
            
            <div className="info-row">
              <div className="info-label">Face Status:</div>
              <div className="info-value">
                {profile.face_registered ? (
                  <span className="status-text success">✅ Registered</span>
                ) : (
                  <span className="status-text warning">⚠️ Not Registered</span>
                )}
              </div>
            </div>
            
            {profile.face_registered && (
              <>
                <div className="info-row">
                  <div className="info-label">Descriptor Version:</div>
                  <div className="info-value">{profile.face_descriptor_version || 1}</div>
                </div>
                <div className="info-row">
                  <div className="info-label">Last Face Update:</div>
                  <div className="info-value">{formatDate(profile.last_face_update)}</div>
                </div>
                <div className="info-row">
                  <div className="info-label">Recommendation:</div>
                  <div className="info-value">
                    <small>Re-register your face if appearance changes significantly</small>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Security Info */}
          <div className="info-card">
            <h3>Security Information</h3>
            
            <div className="info-row">
              <div className="info-label">MFA Status:</div>
              <div className="info-value">
                <span className="status-text muted">⚠️ OTP disabled for check-in</span>
              </div>
            </div>
            
            <div className="info-row">
              <div className="info-label">Login Attempts:</div>
              <div className="info-value">{profile.login_attempts || 0}</div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="profile-actions">
            {!editMode ? (
              <button className="btn-edit" onClick={() => setEditMode(true)}>
                ✏️ Edit Profile
              </button>
            ) : (
              <div className="edit-buttons">
                <button className="btn-save" onClick={handleSave} disabled={saving}>
                  {saving ? '💾 Saving...' : '💾 Save Changes'}
                </button>
                <button className="btn-cancel" onClick={handleCancel}>
                  Cancel
                </button>
              </div>
            )}
            
            <button className="btn-change-password" onClick={() => setShowPasswordModal(true)}>
              🔒 Change Password
            </button>
          </div>
        </div>
      </div>

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <div className="password-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🔒 Change Password</h3>
              <button className="modal-close" onClick={() => setShowPasswordModal(false)}>×</button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>Current Password</label>
                <input
                  type="password"
                  name="current_password"
                  value={passwordData.current_password}
                  onChange={handlePasswordChange}
                  placeholder="Enter your current password"
                />
              </div>
              
              <div className="form-group">
                <label>New Password</label>
                <input
                  type="password"
                  name="new_password"
                  value={passwordData.new_password}
                  onChange={handlePasswordChange}
                  placeholder="Minimum 6 characters"
                />
              </div>
              
              <div className="form-group">
                <label>Confirm New Password</label>
                <input
                  type="password"
                  name="confirm_password"
                  value={passwordData.confirm_password}
                  onChange={handlePasswordChange}
                  placeholder="Re-enter your new password"
                />
              </div>
            </div>
            
            <div className="modal-footer">
              <button className="btn-cancel-modal" onClick={() => setShowPasswordModal(false)}>
                Cancel
              </button>
              <button className="btn-save-modal" onClick={handleChangePassword} disabled={changingPassword}>
                {changingPassword ? 'Changing...' : 'Change Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .profile-container {
          max-width: 1000px;
          margin: 0 auto;
          padding: 20px;
        }
        .profile-header {
          margin-bottom: 24px;
        }
        .profile-header h2 {
          margin: 0 0 8px 0;
          color: #1a1a2e;
          font-size: 1.8rem;
        }
        .profile-header p {
          margin: 0;
          color: #6b7280;
        }
        .profile-message {
          padding: 12px 16px;
          border-radius: 8px;
          margin-bottom: 20px;
        }
        .profile-message.success {
          background: #d4edda;
          color: #155724;
          border: 1px solid #c3e6cb;
        }
        .profile-message.error {
          background: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
        }
        .profile-content {
          display: flex;
          flex-wrap: wrap;
          gap: 30px;
        }
        .profile-picture-section {
          flex: 1;
          min-width: 250px;
          text-align: center;
          background: #f9fafb;
          padding: 30px 20px;
          border-radius: 16px;
        }
        .avatar-large {
          width: 120px;
          height: 120px;
          background: linear-gradient(135deg, #667eea, #764ba2);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
          font-size: 48px;
          color: white;
          font-weight: bold;
        }
        .face-status-badge {
          margin-bottom: 12px;
        }
        .badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 500;
        }
        .badge.success {
          background: #d4edda;
          color: #155724;
        }
        .badge.warning {
          background: #fff3cd;
          color: #856404;
        }
        .register-face-link {
          background: none;
          border: none;
          color: #4F46E5;
          cursor: pointer;
          font-size: 14px;
          margin-top: 10px;
        }
        .register-face-link:hover {
          text-decoration: underline;
        }
        .profile-info-section {
          flex: 2;
          min-width: 300px;
        }
        .info-card {
          background: white;
          border-radius: 16px;
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        .info-card h3 {
          margin: 0 0 16px 0;
          padding-bottom: 12px;
          border-bottom: 1px solid #e5e7eb;
          color: #1a1a2e;
        }
        .info-row {
          display: flex;
          padding: 10px 0;
          border-bottom: 1px solid #f3f4f6;
        }
        .info-label {
          width: 140px;
          font-weight: 500;
          color: #6b7280;
        }
        .info-value {
          flex: 1;
          color: #374151;
        }
        .info-edit {
          flex: 1;
        }
        .edit-input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          font-size: 14px;
        }
        .edit-input:focus {
          outline: none;
          border-color: #4F46E5;
        }
        .role-badge {
          background: #e0e7ff;
          color: #4F46E5;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 500;
        }
        .status-text.success {
          color: #10b981;
        }
        .status-text.warning {
          color: #f59e0b;
        }
        .profile-actions {
          display: flex;
          gap: 12px;
          margin-top: 20px;
          flex-wrap: wrap;
        }
        .btn-edit {
          padding: 10px 24px;
          background: #4F46E5;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
        }
        .btn-save {
          padding: 10px 24px;
          background: #10b981;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
        }
        .btn-cancel {
          padding: 10px 24px;
          background: #6b7280;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
        }
        .btn-change-password {
          padding: 10px 24px;
          background: transparent;
          color: #4F46E5;
          border: 1px solid #4F46E5;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
        }
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .password-modal {
          background: white;
          border-radius: 16px;
          width: 90%;
          max-width: 450px;
          max-height: 90vh;
          overflow-y: auto;
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 24px;
          border-bottom: 1px solid #e5e7eb;
        }
        .modal-header h3 {
          margin: 0;
          color: #1a1a2e;
        }
        .modal-close {
          background: none;
          border: none;
          font-size: 28px;
          cursor: pointer;
          color: #6b7280;
        }
        .modal-body {
          padding: 20px 24px;
        }
        .modal-body .form-group {
          margin-bottom: 16px;
        }
        .modal-body .form-group label {
          display: block;
          margin-bottom: 6px;
          font-weight: 500;
        }
        .modal-body .form-group input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          font-size: 14px;
        }
        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          padding: 16px 24px;
          border-top: 1px solid #e5e7eb;
        }
        .btn-cancel-modal {
          padding: 10px 20px;
          background: #6b7280;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
        }
        .btn-save-modal {
          padding: 10px 20px;
          background: #4F46E5;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
        }
        @media (max-width: 768px) {
          .info-row {
            flex-direction: column;
          }
          .info-label {
            width: auto;
            margin-bottom: 5px;
          }
        }
      `}</style>
    </div>
  );
}