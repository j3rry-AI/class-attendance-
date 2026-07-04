// src/components/admin/Settings.jsx
import React, { useState, useEffect } from 'react';

export default function Settings() {
  const [activeTab, setActiveTab] = useState('general');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  
  // General Settings
  const [generalSettings, setGeneralSettings] = useState({
    systemName: 'Multifactor University Attendance System',
    academicSession: '2025/2026',
    semester: 'First',
    attendanceThreshold: 75,
    allowWeekendAttendance: false
  });
  
  // Security Settings
  const [securitySettings, setSecuritySettings] = useState({
    minPasswordLength: 6,
    sessionTimeout: 60,
    maxLoginAttempts: 5,
    lockoutDuration: 30,
    enforceMFA: true
  });
  
  // Face Recognition Settings
  const [faceSettings, setFaceSettings] = useState({
    matchThreshold: 75,
    livenessDetection: true,
    maxRegistrationAttempts: 3
  });
  
  // Geo-fencing Settings
  const [geoFenceSettings, setGeoFenceSettings] = useState({
    defaultRadius: 100,
    allowLocationBypass: false,
    campusLat: 7.2906,
    campusLon: 5.2014
  });

  // Load settings from backend API
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch('http://localhost:3000/api/security-settings');
        if (response.ok) {
          const data = await response.json();
          setSecuritySettings({
            minPasswordLength: data.minPasswordLength || 6,
            sessionTimeout: data.sessionTimeout || 60,
            maxLoginAttempts: data.maxLoginAttempts || 5,
            lockoutDuration: data.lockoutDuration || 30,
            enforceMFA: data.enforceMFA !== undefined ? data.enforceMFA : true
          });
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    };
    loadSettings();
  }, []);

  // Save settings to backend API
  const handleSaveSettings = async () => {
    setSaving(true);
    setMessage(null);
    
    try {
      const response = await fetch('http://localhost:3000/api/security-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(securitySettings)
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setMessage({ type: 'success', text: 'Settings saved successfully!' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save settings' });
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const handleExportData = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/admin/users');
      const users = await response.json();
      
      const coursesResponse = await fetch('http://localhost:3000/api/courses');
      const courses = await coursesResponse.json();
      
      const attendanceResponse = await fetch('http://localhost:3000/api/attendance/all');
      const attendance = await attendanceResponse.json();
      
      const exportData = {
        exportDate: new Date().toISOString(),
        users,
        courses,
        attendance,
        settings: { generalSettings, securitySettings, faceSettings, geoFenceSettings }
      };
      
      const dataStr = JSON.stringify(exportData, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      
      const exportFileDefaultName = `attendance_system_backup_${new Date().toISOString().slice(0,19)}.json`;
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
      
      setMessage({ type: 'success', text: 'Data exported successfully!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error exporting data:', error);
      setMessage({ type: 'error', text: 'Failed to export data' });
    }
  };

  const tabs = [
    { id: 'general', label: '⚙️ General', icon: '⚙️' },
    { id: 'security', label: '🔒 Security', icon: '🔒' },
    { id: 'face', label: '👤 Face Recognition', icon: '👤' },
    { id: 'geo', label: '📍 Geo-fencing', icon: '📍' },
    { id: 'backup', label: '💾 Backup', icon: '💾' }
  ];

  return (
    <div className="settings-container">
      <div className="settings-header">
        <h2>⚙️ System Settings</h2>
        <p>Configure your attendance system preferences</p>
      </div>

      {/* Tabs */}
      <div className="settings-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Message */}
      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      {/* General Settings Tab */}
      {activeTab === 'general' && (
        <div className="settings-section">
          <h3>General Settings</h3>
          <div className="settings-form">
            <div className="form-group">
              <label>System Name</label>
              <input
                type="text"
                value={generalSettings.systemName}
                onChange={(e) => setGeneralSettings({...generalSettings, systemName: e.target.value})}
              />
              <small>Name displayed throughout the system</small>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Academic Session</label>
                <select
                  value={generalSettings.academicSession}
                  onChange={(e) => setGeneralSettings({...generalSettings, academicSession: e.target.value})}
                >
                  <option>2023/2024</option>
                  <option>2024/2025</option>
                  <option>2025/2026</option>
                  <option>2026/2027</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Current Semester</label>
                <select
                  value={generalSettings.semester}
                  onChange={(e) => setGeneralSettings({...generalSettings, semester: e.target.value})}
                >
                  <option>First</option>
                  <option>Second</option>
                </select>
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Attendance Threshold (%)</label>
                <input
                  type="number"
                  value={generalSettings.attendanceThreshold}
                  onChange={(e) => setGeneralSettings({...generalSettings, attendanceThreshold: parseInt(e.target.value)})}
                  min="0"
                  max="100"
                />
                <small>Minimum attendance percentage required for exams</small>
              </div>
              
              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={generalSettings.allowWeekendAttendance}
                    onChange={(e) => setGeneralSettings({...generalSettings, allowWeekendAttendance: e.target.checked})}
                  />
                  Allow Weekend Attendance
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Security Settings Tab */}
      {activeTab === 'security' && (
        <div className="settings-section">
          <h3>Security Settings</h3>
          <div className="settings-form">
            <div className="form-row">
              <div className="form-group">
                <label>Minimum Password Length</label>
                <input
                  type="number"
                  value={securitySettings.minPasswordLength}
                  onChange={(e) => setSecuritySettings({...securitySettings, minPasswordLength: parseInt(e.target.value)})}
                  min="4"
                  max="20"
                />
                <small>Minimum characters required for passwords</small>
              </div>
              
              <div className="form-group">
                <label>Session Timeout (minutes)</label>
                <input
                  type="number"
                  value={securitySettings.sessionTimeout}
                  onChange={(e) => setSecuritySettings({...securitySettings, sessionTimeout: parseInt(e.target.value)})}
                  min="15"
                  max="240"
                />
                <small>User will be logged out after inactivity</small>
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Max Login Attempts</label>
                <input
                  type="number"
                  value={securitySettings.maxLoginAttempts}
                  onChange={(e) => setSecuritySettings({...securitySettings, maxLoginAttempts: parseInt(e.target.value)})}
                  min="3"
                  max="10"
                />
                <small>Number of failed attempts before account lockout</small>
              </div>
              
              <div className="form-group">
                <label>Lockout Duration (minutes)</label>
                <input
                  type="number"
                  value={securitySettings.lockoutDuration}
                  onChange={(e) => setSecuritySettings({...securitySettings, lockoutDuration: parseInt(e.target.value)})}
                  min="15"
                  max="120"
                />
                <small>How long account stays locked after max attempts</small>
              </div>
            </div>
            
            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={securitySettings.enforceMFA}
                  onChange={(e) => setSecuritySettings({...securitySettings, enforceMFA: e.target.checked})}
                />
                Enforce Multi-Factor Authentication (OTP)
              </label>
              <small>Requires OTP code verification for attendance check-in</small>
            </div>
          </div>
        </div>
      )}

      {/* Face Recognition Settings Tab */}
      {activeTab === 'face' && (
        <div className="settings-section">
          <h3>Face Recognition Settings</h3>
          <div className="settings-form">
            <div className="form-row">
              <div className="form-group">
                <label>Face Match Threshold (%)</label>
                <input
                  type="number"
                  value={faceSettings.matchThreshold}
                  onChange={(e) => setFaceSettings({...faceSettings, matchThreshold: parseInt(e.target.value)})}
                  min="50"
                  max="100"
                />
                <small>Minimum similarity score for face match</small>
              </div>
              
              <div className="form-group">
                <label>Max Registration Attempts</label>
                <input
                  type="number"
                  value={faceSettings.maxRegistrationAttempts}
                  onChange={(e) => setFaceSettings({...faceSettings, maxRegistrationAttempts: parseInt(e.target.value)})}
                  min="1"
                  max="5"
                />
                <small>Number of attempts allowed for face registration</small>
              </div>
            </div>
            
            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={faceSettings.livenessDetection}
                  onChange={(e) => setFaceSettings({...faceSettings, livenessDetection: e.target.checked})}
                />
                Enable Liveness Detection (Blink + Head Movement)
              </label>
              <small>Prevents photo attacks by requiring natural movement</small>
            </div>
          </div>
        </div>
      )}

      {/* Geo-fencing Settings Tab */}
      {activeTab === 'geo' && (
        <div className="settings-section">
          <h3>Geo-fencing Settings</h3>
          <div className="settings-form">
            <div className="form-row">
              <div className="form-group">
                <label>Default Radius (meters)</label>
                <input
                  type="number"
                  value={geoFenceSettings.defaultRadius}
                  onChange={(e) => setGeoFenceSettings({...geoFenceSettings, defaultRadius: parseInt(e.target.value)})}
                  min="50"
                  max="500"
                />
                <small>Default geofence radius for attendance</small>
              </div>
              
              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={geoFenceSettings.allowLocationBypass}
                    onChange={(e) => setGeoFenceSettings({...geoFenceSettings, allowLocationBypass: e.target.checked})}
                  />
                  Allow Location Bypass (For Testing)
                </label>
                <small>Skip location verification for testing purposes</small>
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Campus Latitude (FUTA)</label>
                <input
                  type="number"
                  step="0.0001"
                  value={geoFenceSettings.campusLat}
                  onChange={(e) => setGeoFenceSettings({...geoFenceSettings, campusLat: parseFloat(e.target.value)})}
                />
                <small>Main campus latitude coordinate</small>
              </div>
              
              <div className="form-group">
                <label>Campus Longitude (FUTA)</label>
                <input
                  type="number"
                  step="0.0001"
                  value={geoFenceSettings.campusLon}
                  onChange={(e) => setGeoFenceSettings({...geoFenceSettings, campusLon: parseFloat(e.target.value)})}
                />
                <small>Main campus longitude coordinate</small>
              </div>
            </div>
            
            <div className="location-info">
              <p>📍 Current Campus Location: {geoFenceSettings.campusLat}, {geoFenceSettings.campusLon}</p>
              <button className="btn-secondary" onClick={() => {
                if (navigator.geolocation) {
                  navigator.geolocation.getCurrentPosition((pos) => {
                    setGeoFenceSettings({
                      ...geoFenceSettings,
                      campusLat: pos.coords.latitude,
                      campusLon: pos.coords.longitude
                    });
                    setMessage({ type: 'success', text: 'Location updated to current position!' });
                    setTimeout(() => setMessage(null), 3000);
                  });
                }
              }}>
                📍 Use My Current Location
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backup Tab */}
      {activeTab === 'backup' && (
        <div className="settings-section">
          <h3>Backup & Maintenance</h3>
          <div className="settings-form">
            <div className="backup-cards">
              <div className="backup-card">
                <div className="backup-icon">📥</div>
                <h4>Export Data</h4>
                <p>Export all user, course, and attendance data</p>
                <button className="btn-primary" onClick={handleExportData}>
                  Export as JSON
                </button>
              </div>
              
              <div className="backup-card">
                <div className="backup-icon">🔄</div>
                <h4>Reset System</h4>
                <p>Clear all attendance records (keeps users and courses)</p>
                <button className="btn-danger" onClick={() => {
                  if (window.confirm('⚠️ This will delete ALL attendance records. Are you sure?')) {
                    setMessage({ type: 'success', text: 'System reset initiated' });
                  }
                }}>
                  Reset Attendance
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Save Button */}
      <div className="settings-actions">
        <button className="btn-save" onClick={handleSaveSettings} disabled={saving}>
          {saving ? '💾 Saving...' : '💾 Save All Settings'}
        </button>
      </div>

      <style>{`
        .settings-container {
          padding: 20px;
          max-width: 800px;
          margin: 0 auto;
        }
        .settings-header {
          margin-bottom: 24px;
        }
        .settings-header h2 {
          margin: 0 0 8px 0;
          color: #1a1a2e;
        }
        .settings-header p {
          margin: 0;
          color: #6b7280;
        }
        .settings-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 24px;
          border-bottom: 1px solid #e5e7eb;
          padding-bottom: 12px;
        }
        .tab-btn {
          padding: 10px 20px;
          background: none;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          color: #6b7280;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .tab-btn:hover {
          background: #f3f4f6;
          color: #374151;
        }
        .tab-btn.active {
          background: #4F46E5;
          color: white;
        }
        .settings-section {
          background: white;
          border-radius: 12px;
          padding: 24px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
          margin-bottom: 24px;
        }
        .settings-section h3 {
          margin: 0 0 20px 0;
          color: #1a1a2e;
          border-bottom: 1px solid #e5e7eb;
          padding-bottom: 12px;
        }
        .settings-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .form-group label {
          font-weight: 500;
          font-size: 14px;
          color: #374151;
        }
        .form-group input, .form-group select {
          padding: 10px 12px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          font-size: 14px;
        }
        .form-group input:focus, .form-group select:focus {
          outline: none;
          border-color: #4F46E5;
        }
        .checkbox-group {
          flex-direction: row;
          align-items: center;
        }
        .checkbox-group input {
          width: auto;
          margin-right: 10px;
        }
        .form-group small {
          font-size: 11px;
          color: #6b7280;
        }
        .location-info {
          background: #f3f4f6;
          padding: 12px;
          border-radius: 8px;
          margin-top: 10px;
        }
        .backup-cards {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }
        .backup-card {
          text-align: center;
          padding: 24px;
          background: #f9fafb;
          border-radius: 12px;
        }
        .backup-icon {
          font-size: 48px;
          margin-bottom: 12px;
        }
        .backup-card h4 {
          margin: 0 0 8px 0;
        }
        .backup-card p {
          font-size: 12px;
          color: #6b7280;
          margin-bottom: 16px;
        }
        .btn-danger {
          background: #ef4444;
          color: white;
          padding: 10px 20px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
        }
        .settings-actions {
          display: flex;
          justify-content: flex-end;
          margin-top: 20px;
        }
        .btn-save {
          background: linear-gradient(135deg, #10b981, #059669);
          color: white;
          padding: 12px 30px;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
        }
        .message {
          padding: 12px;
          border-radius: 8px;
          margin-bottom: 20px;
        }
        .message.success {
          background: #d4edda;
          color: #155724;
        }
        .message.error {
          background: #f8d7da;
          color: #721c24;
        }
        @media (max-width: 768px) {
          .form-row {
            grid-template-columns: 1fr;
          }
          .backup-cards {
            grid-template-columns: 1fr;
          }
          .settings-tabs {
            overflow-x: auto;
          }
        }
      `}</style>
    </div>
  );
}