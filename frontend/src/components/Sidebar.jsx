// src/components/Sidebar.jsx
import React from 'react'

export default function Sidebar({ role, activeMenu, onMenuChange, onSignOut }) {
  // Menu items for each role
  const menuItems = {
    student: [
      { id: 'dashboard', label: ' Dashboard', icon: '📊' },
      { id: 'attendance', label: ' Check In', icon: '📍' },
      { id: 'register-face', label: ' Register Face', icon: '📸' },
      { id: 'history', label: ' History', icon: '📅' },
      { id: 'my-courses', label: ' My Courses', icon: '📚' },
      { id: 'report', label: ' Full Report', icon: '📈' },
      { id: 'profile', label: ' Profile', icon: '👤' },
    ],
    lecturer: [
      { id: 'dashboard', label: ' Dashboard', icon: '📊' },
      { id: 'my-courses', label: ' My Courses', icon: '📚' },
      { id: 'students', label: ' Student List', icon: '👥' },
      { id: 'take-attendance', label: ' Take Attendance', icon: '📝' },
      { id: 'geo-locations', label: ' Manage Locations', icon: '📍' },
      { id: 'reports', label: ' Reports', icon: '📈' },
      { id: 'profile', label: ' Profile', icon: '👤' },
    ],
    admin: [
      { id: 'dashboard', label: ' Dashboard', icon: '📊' },
      { id: 'manage-users', label: ' Manage Users', icon: '👥' },
      { id: 'manage-courses', label: ' Manage Courses', icon: '📚' },
      { id: 'bulk-import', label: ' Bulk Import', icon: '📤' },
      { id: 'activity-logs', label: ' Activity Logs', icon: '📜' },
      { id: 'settings', label: ' Settings', icon: '⚙️' },
      { id: 'profile', label: ' Profile', icon: '👤' },
    ],
  }

  const currentMenu = menuItems[role] || menuItems.student

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">🎓</div>
        <h3>Attendance System</h3>
        <p className="sidebar-role">{role?.toUpperCase()}</p>
      </div>
      
      <nav className="sidebar-nav">
        {currentMenu.map((item) => (
          <button
            key={item.id}
            className={`sidebar-item ${activeMenu === item.id ? 'active' : ''}`}
            onClick={() => onMenuChange(item.id)}
          >
            <span className="sidebar-icon">{item.icon}</span>
            <span className="sidebar-label">{item.label}</span>
          </button>
        ))}
      </nav>
      
      <div className="sidebar-footer">
        <button className="signout-btn-sidebar" onClick={onSignOut}>
          🚪 Sign Out
        </button>
      </div>
    </div>
  );
}