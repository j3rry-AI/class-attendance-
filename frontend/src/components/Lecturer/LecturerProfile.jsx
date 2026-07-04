// src/components/lecturer/LecturerProfile.jsx
import React, { useState, useEffect } from 'react';
import apiFetch from '../../utils/api';

export default function LecturerProfile({ user, regNumber, onNavigate }) {
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
  const [courses, setCourses] = useState([]);

  const getAuthHeaders = () => {
    const token = window.localStorage.getItem('authToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };
  
  // Password change states
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordData, setPasswordData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: ''
  });
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      const token = window.localStorage.getItem('token') || window.localStorage.getItem('authToken');
      if (!token) {
        setMessage({ type: 'error', text: 'Authentication required. Please log in again.' });
        setLoading(false);
        return;
      }

      try {
        const profileRes = await apiFetch(`/api/lecturer/${encodeURIComponent(regNumber)}/profile`, {
          headers: getAuthHeaders()
        });
        if (profileRes.ok) {
          setProfile(profileRes.data);
          setFormData({ phone: profileRes.data.phone || '' });
        } else {
          setMessage({ type: 'error', text: profileRes.error?.error || profileRes.error || 'Failed to load profile' });
        }

        const coursesRes = await apiFetch(`/api/lecturer/${encodeURIComponent(regNumber)}/courses`, {
          headers: getAuthHeaders()
        });
        if (coursesRes.ok) {
          setCourses(coursesRes.data);
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
      const response = await apiFetch(`/api/lecturer/${encodeURIComponent(regNumber)}/profile`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: { phone: formData.phone }
      });

      if (response.ok) {
        setProfile(prev => ({ ...prev, phone: formData.phone }));
        setMessage({ type: 'success', text: 'Profile updated successfully!' });
        setEditMode(false);
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: response.error?.error || response.error || 'Failed to update profile' });
      }
    } catch (error) {
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

  // Handle password input changes
  const handlePasswordChange = (e) => {
    setPasswordData({
      ...passwordData,
      [e.target.name]: e.target.value
    });
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
      const response = await apiFetch(`/api/users/${encodeURIComponent(regNumber)}/change-password`, {
        method: 'POST',
        headers: getAuthHeaders(),
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

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px' }}>
        <div style={{ width: '50px', height: '50px', border: '3px solid #e5e7eb', borderTopColor: '#4F46E5', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }}></div>
        <p>Loading profile...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: '0 0 8px 0', color: '#1a1a2e', fontSize: '1.8rem' }}>👨‍🏫 Lecturer Profile</h2>
        <p style={{ margin: '0', color: '#6b7280' }}>View and manage your personal information</p>
      </div>

      {message && (
        <div style={{ padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', backgroundColor: message.type === 'success' ? '#d4edda' : '#f8d7da', color: message.type === 'success' ? '#155724' : '#721c24', border: message.type === 'success' ? '1px solid #c3e6cb' : '1px solid #f5c6cb' }}>
          {message.text}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px' }}>
        <div style={{ flex: '2', minWidth: '300px' }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <h3 style={{ margin: '0 0 16px 0', paddingBottom: '12px', borderBottom: '1px solid #e5e7eb', color: '#1a1a2e' }}>Personal Information</h3>
            
            <div style={{ display: 'flex', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ width: '140px', fontWeight: '500', color: '#6b7280' }}>Full Name:</div>
              <div style={{ flex: 1, color: '#374151' }}>{profile.name || 'N/A'}</div>
            </div>
            <div style={{ display: 'flex', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ width: '140px', fontWeight: '500', color: '#6b7280' }}>Staff ID:</div>
              <div style={{ flex: 1, color: '#374151' }}>{profile.reg_number || 'N/A'}</div>
            </div>
            <div style={{ display: 'flex', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ width: '140px', fontWeight: '500', color: '#6b7280' }}>Role:</div>
              <div style={{ flex: 1, color: '#374151' }}><span style={{ background: '#e0e7ff', color: '#4F46E5', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: '500' }}>LECTURER</span></div>
            </div>
            <div style={{ display: 'flex', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ width: '140px', fontWeight: '500', color: '#6b7280' }}>Phone Number:</div>
              {editMode ? (
                <div style={{ flex: 1 }}>
                  <input type="tel" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} placeholder="e.g., 08012345678" style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }} />
                </div>
              ) : (
                <div style={{ flex: 1, color: '#374151' }}>{profile.phone || 'Not provided'}</div>
              )}
            </div>
            <div style={{ display: 'flex', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ width: '140px', fontWeight: '500', color: '#6b7280' }}>Account Created:</div>
              <div style={{ flex: 1, color: '#374151' }}>{formatDate(profile.account_created)}</div>
            </div>
          </div>

          <div style={{ background: 'white', borderRadius: '16px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <h3 style={{ margin: '0 0 16px 0', paddingBottom: '12px', borderBottom: '1px solid #e5e7eb', color: '#1a1a2e' }}>📚 Courses You Teach</h3>
            {courses.length === 0 ? (
              <p style={{ color: '#6b7280', textAlign: 'center', padding: '20px' }}>No courses assigned yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {courses.map(course => (
                  <div key={course.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f9fafb', borderRadius: '8px' }}>
                    <div style={{ fontWeight: 'bold', color: '#4F46E5' }}>{course.code}</div>
                    <div style={{ flex: 1, marginLeft: '16px' }}>{course.title}</div>
                    <div style={{ background: '#e5e7eb', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>{course.credits} Units</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
            {!editMode ? (
              <button onClick={() => setEditMode(true)} style={{ padding: '10px 24px', background: '#4F46E5', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}>✏️ Edit Profile</button>
            ) : (
              <>
                <button onClick={handleSave} disabled={saving} style={{ padding: '10px 24px', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}>{saving ? '💾 Saving...' : '💾 Save Changes'}</button>
                <button onClick={handleCancel} style={{ padding: '10px 24px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}>Cancel</button>
              </>
            )}
            <button onClick={() => setShowPasswordModal(true)} style={{ padding: '10px 24px', background: 'transparent', color: '#4F46E5', border: '1px solid #4F46E5', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}>🔒 Change Password</button>
          </div>
        </div>
      </div>

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }} onClick={() => setShowPasswordModal(false)}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            width: '90%',
            maxWidth: '450px',
            maxHeight: '90vh',
            overflowY: 'auto'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '20px 24px',
              borderBottom: '1px solid #e5e7eb'
            }}>
              <h3 style={{ margin: 0, color: '#1a1a2e' }}>🔒 Change Password</h3>
              <button onClick={() => setShowPasswordModal(false)} style={{ background: 'none', border: 'none', fontSize: '28px', cursor: 'pointer', color: '#6b7280' }}>×</button>
            </div>
            
            <div style={{ padding: '20px 24px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>Current Password</label>
                <input
                  type="password"
                  name="current_password"
                  value={passwordData.current_password}
                  onChange={handlePasswordChange}
                  placeholder="Enter your current password"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
                />
              </div>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>New Password</label>
                <input
                  type="password"
                  name="new_password"
                  value={passwordData.new_password}
                  onChange={handlePasswordChange}
                  placeholder="Minimum 6 characters"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
                />
              </div>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>Confirm New Password</label>
                <input
                  type="password"
                  name="confirm_password"
                  value={passwordData.confirm_password}
                  onChange={handlePasswordChange}
                  placeholder="Re-enter your new password"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
                />
              </div>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', padding: '16px 24px', borderTop: '1px solid #e5e7eb' }}>
              <button onClick={() => setShowPasswordModal(false)} style={{ padding: '10px 20px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleChangePassword} disabled={changingPassword} style={{ padding: '10px 20px', background: '#4F46E5', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>{changingPassword ? 'Changing...' : 'Change Password'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}