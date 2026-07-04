// src/components/admin/AdminProfile.jsx
import React, { useState, useEffect } from 'react';

export default function AdminProfile({ user, regNumber, onNavigate }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [profile, setProfile] = useState({
    name: '',
    phone: '',
    reg_number: '',
    role: '',
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
  const [systemStats, setSystemStats] = useState({
    totalUsers: 0,
    totalCourses: 0,
    totalAttendance: 0
  });

  // Fetch profile data
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        // Fetch admin profile
        const response = await fetch(`http://localhost:3000/api/users/${encodeURIComponent(regNumber)}/profile`);
        const data = await response.json();
        
        if (response.ok) {
          setProfile(data);
          setFormData({
            phone: data.phone || ''
          });
        } else {
          setMessage({ type: 'error', text: data.error || 'Failed to load profile' });
        }
        
        // Fetch system stats
        const statsRes = await fetch('http://localhost:3000/api/admin/stats');
        const statsData = await statsRes.json();
        if (statsRes.ok) {
          setSystemStats({
            totalUsers: (statsData.totalStudents || 0) + (statsData.totalLecturers || 0) + 1,
            totalCourses: statsData.totalCourses || 0,
            totalAttendance: statsData.totalAttendance || 0
          });
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
        setMessage({ type: 'error', text: 'Network error. Please try again.' });
      } finally {
        setLoading(false);
      }
    };
    
    if (regNumber) {
      fetchProfile();
    }
  }, [regNumber]);

  const isValidPhone = (phone) => {
    const phoneRegex = /^(0|234)?[789][01]\d{8}$/;
    return phoneRegex.test(phone);
  };

  const handleSave = async () => {
    if (formData.phone && !isValidPhone(formData.phone)) {
      setMessage({ type: 'error', text: 'Please enter a valid Nigerian phone number' });
      return;
    }
    
    setSaving(true);
    setMessage(null);
    
    try {
      const response = await fetch(`http://localhost:3000/api/users/${encodeURIComponent(regNumber)}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: formData.phone
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setProfile(prev => ({ ...prev, phone: formData.phone }));
        setMessage({ type: 'success', text: 'Profile updated successfully!' });
        setEditMode(false);
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update profile' });
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      phone: profile.phone || ''
    });
    setEditMode(false);
    setMessage(null);
  };

  const handlePasswordChange = (e) => {
    setPasswordData({
      ...passwordData,
      [e.target.name]: e.target.value
    });
  };

  const handleChangePassword = async () => {
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
      const response = await fetch(`http://localhost:3000/api/users/${encodeURIComponent(regNumber)}/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: passwordData.current_password,
          new_password: passwordData.new_password
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setMessage({ type: 'success', text: 'Password changed successfully!' });
        setShowPasswordModal(false);
        setPasswordData({ current_password: '', new_password: '', confirm_password: '' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to change password' });
      }
    } catch (error) {
      console.error('Error changing password:', error);
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setChangingPassword(false);
    }
  };

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
      <div className="admin-profile-loading">
        <div className="loading-spinner"></div>
        <p>Loading profile...</p>
        <style>{`
          .admin-profile-loading {
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
    <div className="admin-profile-container">
      <div className="profile-header">
        <h2>👑 Admin Profile</h2>
        <p>Manage your administrator account</p>
      </div>

      {message && (
        <div className={`profile-message ${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="profile-content">
        <div className="profile-picture-section">
          <div className="avatar-large">
            {profile.name ? profile.name.charAt(0).toUpperCase() : '👑'}
          </div>
          <div className="admin-badge">Administrator</div>
        </div>

        <div className="profile-info-section">
          <div className="info-card">
            <h3>Personal Information</h3>
            
            <div className="info-row">
              <div className="info-label">Full Name:</div>
              <div className="info-value">{profile.name || 'N/A'}</div>
            </div>
            
            <div className="info-row">
              <div className="info-label">Admin ID:</div>
              <div className="info-value">{profile.reg_number || 'N/A'}</div>
            </div>
            
            <div className="info-row">
              <div className="info-label">Role:</div>
              <div className="info-value">
                <span className="role-badge admin">ADMINISTRATOR</span>
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
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
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

          <div className="info-card">
            <h3>📊 System Overview</h3>
            <div className="stats-row">
              <div className="stat-item">
                <div className="stat-number">{systemStats.totalUsers}</div>
                <div className="stat-desc">Total Users</div>
              </div>
              <div className="stat-item">
                <div className="stat-number">{systemStats.totalCourses}</div>
                <div className="stat-desc">Courses</div>
              </div>
              <div className="stat-item">
                <div className="stat-number">{systemStats.totalAttendance}</div>
                <div className="stat-desc">Attendance Records</div>
              </div>
            </div>
          </div>

          <div className="info-card">
            <h3>Security Information</h3>
            
            <div className="info-row">
              <div className="info-label">MFA Status:</div>
              <div className="info-value">
                <span className="status-text success">✅ OTP Enabled</span>
              </div>
            </div>

            <div className="info-row">
              <div className="info-label">Login Attempts:</div>
              <div className="info-value">{profile.login_attempts || 0}</div>
            </div>
          </div>

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
        .admin-profile-container {
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
        }
        .profile-message.error {
          background: #f8d7da;
          color: #721c24;
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
          background: linear-gradient(135deg, #667eea, #764ba2);
          padding: 40px 20px;
          border-radius: 16px;
        }
        .avatar-large {
          width: 120px;
          height: 120px;
          background: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
          font-size: 48px;
          color: #4F46E5;
          font-weight: bold;
        }
        .admin-badge {
          background: rgba(255,255,255,0.2);
          color: white;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 12px;
          display: inline-block;
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
        .role-badge.admin {
          background: #e0e7ff;
          color: #4F46E5;
          padding: 2px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 500;
        }
        .stats-row {
          display: flex;
          justify-content: space-around;
          text-align: center;
        }
        .stat-item {
          flex: 1;
        }
        .stat-number {
          font-size: 28px;
          font-weight: bold;
          color: #4F46E5;
        }
        .stat-desc {
          font-size: 12px;
          color: #6b7280;
        }
        .status-text.success {
          color: #10b981;
        }
        .profile-actions {
          display: flex;
          gap: 12px;
          margin-top: 20px;
          flex-wrap: wrap;
        }
        .btn-edit, .btn-save, .btn-cancel, .btn-change-password {
          padding: 10px 24px;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
        }
        .btn-edit {
          background: #4F46E5;
          color: white;
          border: none;
        }
        .btn-save {
          background: #10b981;
          color: white;
          border: none;
        }
        .btn-cancel {
          background: #6b7280;
          color: white;
          border: none;
        }
        .btn-change-password {
          background: transparent;
          color: #4F46E5;
          border: 1px solid #4F46E5;
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
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 24px;
          border-bottom: 1px solid #e5e7eb;
        }
        .modal-close {
          background: none;
          border: none;
          font-size: 28px;
          cursor: pointer;
        }
        .modal-body {
          padding: 20px 24px;
        }
        .modal-body .form-group {
          margin-bottom: 16px;
        }
        .modal-body .form-group input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
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
          .stats-row {
            flex-direction: column;
            gap: 15px;
          }
        }
      `}</style>
    </div>
  );
}