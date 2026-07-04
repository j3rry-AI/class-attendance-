// src/components/admin/UserActivityReports.jsx
import React, { useState, useEffect } from 'react';

export default function UserActivityReports() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, today, week
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/admin/activity-logs');
      const data = await response.json();
      setLogs(data);
    } catch (error) {
      console.error('Error fetching activity logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = () => {
    let filtered = [...logs];
    
    // Apply date filter
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    if (filter === 'today') {
      filtered = filtered.filter(log => log.timestamp?.split('T')[0] === today);
    } else if (filter === 'week') {
      filtered = filtered.filter(log => new Date(log.timestamp) > weekAgo);
    }
    
    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(log => 
        log.reg_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.action?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    return filtered;
  };

  const getActionBadge = (action) => {
    if (action === 'login') return 'badge-login';
    if (action === 'logout') return 'badge-logout';
    if (action === 'attendance') return 'badge-attendance';
    return 'badge-other';
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading activity logs...</p>
        <style>{`
          .loading-container { text-align: center; padding: 60px; }
          .loading-spinner { width: 40px; height: 40px; border: 3px solid #e5e7eb; border-top-color: #4F46E5; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px; }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  return (
    <div className="activity-reports">
      <div className="reports-header">
        <h2>📊 User Activity Reports</h2>
        <p>Monitor user login activity and system usage</p>
      </div>

      <div className="filters-bar">
        <div className="filter-group">
          <label>Time Period:</label>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">Last 7 Days</option>
          </select>
        </div>
        <div className="search-group">
          <input
            type="text"
            placeholder="Search by user or action..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        <button onClick={fetchLogs} className="refresh-btn">🔄 Refresh</button>
      </div>

      <div className="stats-summary">
        <div className="stat-card">
          <div className="stat-value">{logs.length}</div>
          <div className="stat-label">Total Activities</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{logs.filter(l => l.action === 'login').length}</div>
          <div className="stat-label">Logins</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{logs.filter(l => l.action === 'attendance').length}</div>
          <div className="stat-label">Attendance Marked</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{new Set(logs.map(l => l.reg_number)).size}</div>
          <div className="stat-label">Active Users</div>
        </div>
      </div>

      {filteredLogs().length === 0 ? (
        <div className="no-data">
          <div className="no-data-icon">📭</div>
          <p>No activity logs found</p>
        </div>
      ) : (
        <div className="logs-table-container">
          <table className="logs-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Action</th>
                <th>IP Address</th>
                <th>Device</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs().map(log => (
                <tr key={log.id}>
                  <td><strong>{log.reg_number}</strong></td>
                  <td><span className={`badge ${getActionBadge(log.action)}`}>
                    {log.action === 'login' ? '🔐 Login' : 
                     log.action === 'logout' ? '🚪 Logout' : 
                     log.action === 'attendance' ? '✅ Attendance' : log.action}
                  </span></td>
                  <td>{log.ip || 'N/A'}</td>
                  <td>{log.user_agent?.substring(0, 50)}...</td>
                  <td>{new Date(log.timestamp).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        .activity-reports {
          padding: 20px;
        }
        .reports-header {
          margin-bottom: 24px;
        }
        .reports-header h2 {
          margin: 0 0 8px 0;
          color: #1a1a2e;
          font-size: 1.8rem;
        }
        .reports-header p {
          margin: 0;
          color: #6b7280;
        }
        .filters-bar {
          display: flex;
          gap: 16px;
          margin-bottom: 24px;
          flex-wrap: wrap;
          align-items: center;
        }
        .filter-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .filter-group select {
          padding: 8px 12px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
        }
        .search-group {
          flex: 1;
          min-width: 200px;
        }
        .search-input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
        }
        .refresh-btn {
          padding: 8px 16px;
          background: #4F46E5;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
        }
        .stats-summary {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }
        .stat-card {
          background: white;
          padding: 16px;
          border-radius: 12px;
          text-align: center;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        .stat-value {
          font-size: 28px;
          font-weight: bold;
          color: #4F46E5;
        }
        .stat-label {
          font-size: 12px;
          color: #6b7280;
          margin-top: 4px;
        }
        .logs-table-container {
          overflow-x: auto;
          background: white;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        .logs-table {
          width: 100%;
          border-collapse: collapse;
        }
        .logs-table th,
        .logs-table td {
          padding: 12px 16px;
          text-align: left;
          border-bottom: 1px solid #e5e7eb;
        }
        .logs-table th {
          background: #f9fafb;
          font-weight: 600;
        }
        .badge {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 500;
        }
        .badge-login {
          background: #dbeafe;
          color: #1e40af;
        }
        .badge-logout {
          background: #fee2e2;
          color: #991b1b;
        }
        .badge-attendance {
          background: #dcfce7;
          color: #166534;
        }
        .badge-other {
          background: #fef3c7;
          color: #92400e;
        }
        .no-data {
          text-align: center;
          padding: 60px;
          background: #f9fafb;
          border-radius: 12px;
        }
        .no-data-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }
      `}</style>
    </div>
  );
}