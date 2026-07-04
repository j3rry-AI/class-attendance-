// src/components/TakeAttendance.jsx - ENHANCED with Session Management & Notifications
import React, { useState, useEffect } from 'react';
import apiFetch from '../utils/api';

export default function TakeAttendance({ user, regNumber }) {
  const [loading, setLoading] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [students, setStudents] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedTime, setSelectedTime] = useState(new Date().toISOString().slice(11, 16));
  const [selectedLocation, setSelectedLocation] = useState('');
  const [locations, setLocations] = useState([]);
  const [attendanceData, setAttendanceData] = useState({});
  const [message, setMessage] = useState(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeSession, setActiveSession] = useState(null);
  const [sendingNotification, setSendingNotification] = useState(false);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [courses, setCourses] = useState([]);
  const [now, setNow] = useState(new Date());
  const [confirmedCourse, setConfirmedCourse] = useState('');
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState(0);

  const extractErrorText = (error, fallback = 'An error occurred') => {
    if (!error) return fallback;
    if (typeof error === 'string') return error;
    if (typeof error === 'object') return error.message || error.error || JSON.stringify(error);
    return String(error);
  };

  const resolveCourseFromInput = (input) => {
    const normalized = (input || '').toString().trim().toLowerCase();
    if (!normalized) return null;
    return courses.find(c => {
      const code = (c.code || '').toString().toLowerCase();
      const title = (c.title || '').toString().toLowerCase();
      return c.id === input || code === normalized || title === normalized;
    }) || null;
  };

  const getResolvedCourseId = () => {
    const trimmedCourse = (selectedCourse || '').toString().trim();
    if (!trimmedCourse) return '';
    const resolved = resolveCourseFromInput(trimmedCourse);
    return resolved?.id || trimmedCourse;
  };

  useEffect(() => {
    fetchLocations();
    fetchCourses();
    try {
      const savedCourse = window.localStorage.getItem('attendanceSelectedCourse');
      if (savedCourse) {
        setSelectedCourse(savedCourse);
      }
    } catch (e) {
      // ignore localStorage failures
    }
  }, [regNumber]);

  useEffect(() => {
    // Only react when course is confirmed (onBlur or Enter)
    if (!confirmedCourse) {
      setStudents([]);
      setAttendanceData({});
      setActiveSession(null);
      setSessionHistory([]);
      return;
    }
    const resolved = resolveCourseFromInput(confirmedCourse);
    const courseId = resolved?.id || confirmedCourse;
    fetchActiveSession(courseId);
    fetchSessionHistory(courseId);
    fetchStudents(courseId);
  }, [confirmedCourse, courses]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(interval);
  }, []);

  // Dedicated countdown for active session in seconds
  useEffect(() => {
    if (!activeSession) {
      setTimeRemainingSeconds(0);
      return;
    }
    const tick = () => {
      try {
        const end = new Date(activeSession.end_time).getTime();
        const secs = Math.max(0, Math.floor((end - Date.now()) / 1000));
        setTimeRemainingSeconds(secs);
        if (secs <= 0) setActiveSession(null);
      } catch (e) {
        setTimeRemainingSeconds(0);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [activeSession]);

  const fetchLocations = async () => {
    try {
      const response = await apiFetch('/api/geo-locations');
      if (response.ok) {
        setLocations(response.data);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error fetching locations:', error);
    }
  };

  const fetchCourses = async () => {
    if (!regNumber) return;
    try {
      const response = await apiFetch(`/api/lecturer/${encodeURIComponent(regNumber)}/courses`);
      if (response.ok) {
        setCourses(response.data || []);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error fetching courses:', error);
    }
  };

  const fetchActiveSession = async (courseIdArg) => {
    const courseId = courseIdArg || getResolvedCourseId();
    if (!courseId) {
      setActiveSession(null);
      return;
    }
    try {
      const response = await apiFetch(`/api/lecturer/sessions/active?course_id=${encodeURIComponent(courseId)}`);
      if (response.ok && response.data.active) {
        setActiveSession(response.data.session);
      } else {
        setActiveSession(null);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error fetching active session:', error);
    }
  };

  const fetchSessionHistory = async (courseIdArg) => {
    const courseId = courseIdArg || getResolvedCourseId();
    if (!courseId) {
      setSessionHistory([]);
      return;
    }
    try {
      const response = await apiFetch(`/api/lecturer/sessions/history?course_id=${encodeURIComponent(courseId)}`);
      if (response.ok) {
        setSessionHistory(response.data);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error fetching session history:', error);
    }
  };

  const fetchStudents = async (courseId) => {
    if (!courseId) return;
    setLoading(true);
    try {
      const response = await apiFetch(`/api/lecturer/${encodeURIComponent(regNumber)}/course/${encodeURIComponent(courseId)}/students`);
      if (response.ok) {
        setStudents(response.data);
        const initialAttendance = {};
        response.data.forEach(student => {
          initialAttendance[student.id] = false;
        });
        setAttendanceData(initialAttendance);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error fetching students:', error);
      setMessage({ type: 'error', text: 'Failed to load students' });
    } finally {
      setLoading(false);
    }
  };

  const confirmSelectedCourse = () => {
    const trimmed = (selectedCourse || '').toString().trim();
    setConfirmedCourse(trimmed);
    try { window.localStorage.setItem('attendanceSelectedCourse', trimmed); } catch (e) {}
  };

  const toggleStudentAttendance = (studentId) => {
    setAttendanceData(prev => ({ ...prev, [studentId]: !prev[studentId] }));
  };

  const markAllPresent = () => {
    const allPresent = {};
    students.forEach(student => {
      allPresent[student.id] = true;
    });
    setAttendanceData(allPresent);
    setMessage({ type: 'info', text: 'All students marked as present. Click "Save Attendance" to confirm.' });
    setTimeout(() => setMessage(null), 3000);
  };

  const clearAll = () => {
    const allAbsent = {};
    students.forEach(student => {
      allAbsent[student.id] = false;
    });
    setAttendanceData(allAbsent);
    setMessage({ type: 'info', text: 'All attendance cleared.' });
    setTimeout(() => setMessage(null), 3000);
  };

  const getPresentCount = () => {
    return Object.values(attendanceData).filter(v => v === true).length;
  };

  // Start a new class session
  const startClassSession = async () => {
    if (!selectedLocation) {
      setMessage({ type: 'error', text: 'Please select a location before starting the class' });
      return;
    }

    if (!selectedCourse || !selectedCourse.toString().trim()) {
      setMessage({ type: 'error', text: 'Please enter a course code or name before starting the class' });
      return;
    }

    const startTime = new Date(`${selectedDate}T${selectedTime}`);
    const resolvedCourseId = getResolvedCourseId();
    setLoading(true);
    try {
      const response = await apiFetch('/api/lecturer/sessions/start', {
        method: 'POST',
        body: {
          course_id: resolvedCourseId,
          course_code: selectedCourse,
          course_name: selectedCourse,
          lecturer_reg_number: regNumber,
          location_id: selectedLocation,
          start_time: startTime.toISOString(),
          duration_minutes: 30
        }
      });

      if (response.ok) {
        const session = response.data?.session || response.data;
        if (!session || !session.id || !session.start_time || !session.end_time) {
          throw new Error('Backend did not return a persisted session');
        }
        // set the active session from the backend
        setActiveSession(session);
        // initialize countdown
        try {
          const end = new Date(session.end_time).getTime();
          setTimeRemainingSeconds(Math.max(0, Math.floor((end - Date.now()) / 1000)));
        } catch (e) { setTimeRemainingSeconds(0); }
        setMessage({ type: 'success', text: `Class session started! Students can join within 30 minutes.` });
        try {
          window.localStorage.setItem('attendanceSelectedCourse', selectedCourse);
        } catch (e) {
          // ignore localStorage failures
        }
        await sendClassNotification(session);
        await Promise.all([fetchSessionHistory(), fetchStudents(getResolvedCourseId())]);
      } else {
        setMessage({ type: 'error', text: extractErrorText(response.error, 'Failed to start session') });
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error starting session:', error);
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  // End class session
  const endClassSession = async () => {
    if (!activeSession) return;
    
    try {
      const response = await apiFetch(`/api/lecturer/sessions/${activeSession.id}/end`, {
        method: 'PUT'
      });
      
      if (response.ok) {
        setActiveSession(null);
        setMessage({ type: 'success', text: 'Class session ended. Attendance records saved.' });
        fetchSessionHistory();
      } else {
        setMessage({ type: 'error', text: extractErrorText(response.error, 'Failed to end session') });
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error ending session:', error);
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    }
  };

  // Send notification to students
  const sendClassNotification = async (session) => {
    setSendingNotification(true);
    
    try {
      const response = await apiFetch('/api/lecturer/send-notification', {
        method: 'POST',
        body: {
          course_id: selectedCourse,
          session_id: session.id,
          title: 'Class Started!',
          message: `Your ${selectedCourse || 'class'} has started. Please mark your attendance within 30 minutes.`,
          type: 'class_start'
        }
      });
      
      if (response.ok) {
        setMessage({ type: 'success', text: 'Notification sent to all students!' });
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error sending notification:', error);
    } finally {
      setSendingNotification(false);
    }
  };

  // Manually send notification
  const sendManualNotification = async () => {
    if (!activeSession) {
      setMessage({ type: 'error', text: 'No active class session. Please start a class first.' });
      return;
    }
    
    await sendClassNotification(activeSession);
  };

  const saveAttendance = async (e) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    if (!selectedLocation) {
      setMessage({ type: 'error', text: 'Please select a location for this class' });
      return;
    }

    setSaving(true);
    const presentStudents = students.filter(s => attendanceData[s.id]).map(s => s.id);
    const resolvedCourseId = getResolvedCourseId();
    
    try {
      const response = await apiFetch('/api/lecturer/attendance/bulk', {
        method: 'POST',
        body: {
          lecturer_reg_number: regNumber,
          course_id: resolvedCourseId,
          course_code: selectedCourse,
          date: selectedDate,
          location_id: selectedLocation,
          present_students: presentStudents,
          absent_students: students.filter(s => !attendanceData[s.id]).map(s => s.id)
        }
      });
      
      if (response.ok) {
        if (!response.data || response.data.success !== true) {
          throw new Error(response.data?.message || 'Backend did not persist attendance');
        }
        setMessage({ type: 'success', text: `Attendance saved! ${presentStudents.length} students marked present.` });
        await Promise.all([fetchStudents(getResolvedCourseId()), fetchSessionHistory()]);
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: extractErrorText(response.error, 'Failed to save attendance') });
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error saving attendance:', error);
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const presentCount = getPresentCount();
  const absentCount = students.length - presentCount;
  const isSessionActive = activeSession !== null;
  const sessionEndTime = activeSession ? new Date(activeSession.end_time) : null;
  const timeRemaining = Math.max(0, Math.ceil((timeRemainingSeconds || 0) / 60));

  if (loading) {
    return <div className="loading-container"><div className="loading-spinner"></div><p>Loading...</p><style>{`.loading-container { text-align: center; padding: 60px; } .loading-spinner { width: 40px; height: 40px; border: 3px solid #e5e7eb; border-top-color: #4F46E5; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px; } @keyframes spin { to { transform: rotate(360deg); } }`}</style></div>;
  }

  return (
    <div className="take-attendance-container">
      <div className="attendance-header">
        <h2>📝 Take Attendance</h2>
        <p>Start a class session, mark attendance, and notify students</p>
      </div>

      {message && <div className={`message ${message.type}`}>{String(message.text)}</div>}

      {/* Active Session Banner */}
      {isSessionActive && (
        <div className="active-session-banner">
          <div className="session-info">
            <span className="session-icon">🎓</span>
            <div>
              <strong>Class in Progress!</strong>
              <div>Session will close in <span className="timer">{timeRemaining}</span> minutes</div>
              <small>Students can join within this time</small>
            </div>
          </div>
          <div className="session-actions">
            <button onClick={sendManualNotification} disabled={sendingNotification} className="btn-notify">
              {sendingNotification ? 'Sending...' : '🔔 Send Reminder'}
            </button>
            <button onClick={endClassSession} className="btn-end-session">
              End Session
            </button>
          </div>
        </div>
      )}

      <div className="settings-section">
        <div className="form-row">
          <div className="form-group">
            <label>Select Course:</label>
            <input
              type="text"
              placeholder="Enter Course Code or Name (e.g., IFS 205)"
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
              onBlur={confirmSelectedCourse}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmSelectedCourse(); } }}
              className="course-select"
            />
          </div>
          <div className="form-group">
            <label>Class Date:</label>
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="date-input" />
          </div>
          <div className="form-group">
            <label>Class Time:</label>
            <input type="time" value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)} className="time-input" />
          </div>
          <div className="form-group">
            <label>Class Location:</label>
            <select value={selectedLocation} onChange={(e) => setSelectedLocation(e.target.value)} className="location-select">
              <option value="">Select a location</option>
              {locations.map(loc => (<option key={loc.id} value={loc.id}>{loc.name}</option>))}
            </select>
          </div>
        </div>
        
        <div className="session-controls">
          {!isSessionActive ? (
            <button onClick={startClassSession} disabled={!selectedLocation} className="btn-start-session">
              🎯 Start Class Session (30 min window)
            </button>
          ) : (
            <div className="session-status">
              <span className="status-badge active">● Session Active</span>
              <span className="status-note">Students can mark attendance for {timeRemaining} more minutes</span>
            </div>
          )}
        </div>
      </div>

      <div className="stats-bar">
        <div className="stat-box"><span className="stat-label">Total Students:</span><span className="stat-number">{students.length}</span></div>
        <div className="stat-box present"><span className="stat-label">Present:</span><span className="stat-number">{presentCount}</span></div>
        <div className="stat-box absent"><span className="stat-label">Absent:</span><span className="stat-number">{absentCount}</span></div>
        <div className="stat-box percentage"><span className="stat-label">Attendance:</span><span className="stat-number">{students.length ? Math.round((presentCount / students.length) * 100) : 0}%</span></div>
      </div>

      <div className="bulk-actions">
        <button onClick={() => setBulkMode(!bulkMode)} className="btn-bulk">{bulkMode ? 'Exit Bulk Mode' : '📦 Bulk Actions'}</button>
        {bulkMode && (<><button onClick={markAllPresent} className="btn-mark-all">✅ Mark All Present</button><button onClick={clearAll} className="btn-clear-all">🗑️ Clear All</button></>)}
        <button onClick={() => setShowHistory(!showHistory)} className="btn-history">
          📋 {showHistory ? 'Hide History' : 'View Session History'}
        </button>
      </div>

      {/* Session History */}
      {showHistory && sessionHistory.length > 0 && (
        <div className="session-history">
          <h4>Previous Sessions</h4>
          <div className="history-list">
            {sessionHistory.map(session => (
              <div key={session.id} className="history-item">
                <div className="history-date">{new Date(session.start_time).toLocaleDateString()}</div>
                <div className="history-time">{new Date(session.start_time).toLocaleTimeString()} - {new Date(session.end_time).toLocaleTimeString()}</div>
                <div className="history-status">{session.status}</div>
                <div className="history-count">{session.attendance_count || 0} students marked</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="students-list">
        <h3>Student Attendance List{selectedCourse ? ` - ${selectedCourse}` : ''}</h3>
        <div className="table-container">
          <table className="attendance-table">
            <thead><tr><th>S/N</th><th>Student Name</th><th>Registration Number</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {students.map((student, index) => (
                <tr key={student.id} className={attendanceData[student.id] ? 'present-row' : 'absent-row'}>
                  <td>{index + 1}</td>
                  <td><div className="student-info"><span className="avatar">👨‍🎓</span>{student.name}</div></td>
                  <td>{student.reg_number}</td>
                  <td><span className={`status-badge ${attendanceData[student.id] ? 'present' : 'absent'}`}>{attendanceData[student.id] ? '✅ Present' : '❌ Absent'}</span></td>
                  <td><button onClick={() => toggleStudentAttendance(student.id)} className={`action-btn ${attendanceData[student.id] ? 'btn-absent' : 'btn-present'}`}>{attendanceData[student.id] ? 'Mark Absent' : 'Mark Present'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="save-section">
        <button type="button" onClick={saveAttendance} disabled={saving || !selectedLocation} className="btn-save">{saving ? '💾 Saving...' : '💾 Save Attendance'}</button>
        {!selectedLocation && <p className="warning-text">⚠️ Please select a location before saving attendance</p>}
      </div>

      <style>{`
        .take-attendance-container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .attendance-header { margin-bottom: 24px; }
        .attendance-header h2 { margin: 0 0 8px 0; color: #1a1a2e; font-size: 1.8rem; }
        .attendance-header p { margin: 0; color: #6b7280; }
        .message { padding: 12px; border-radius: 8px; margin-bottom: 20px; }
        .message.success { background: #d4edda; color: #155724; }
        .message.error { background: #f8d7da; color: #721c24; }
        .message.info { background: #cce5ff; color: #004085; }
        .active-session-banner { background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 15px 20px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 15px; }
        .session-info { display: flex; align-items: center; gap: 15px; }
        .session-icon { font-size: 32px; }
        .timer { font-size: 24px; font-weight: bold; }
        .session-actions { display: flex; gap: 10px; }
        .btn-notify, .btn-end-session { padding: 8px 16px; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; }
        .btn-notify { background: white; color: #059669; }
        .btn-end-session { background: #ef4444; color: white; }
        .session-controls { margin-top: 20px; }
        .btn-start-session { width: 100%; padding: 12px; background: linear-gradient(135deg, #4F46E5, #4338CA); color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; }
        .session-status { text-align: center; padding: 12px; background: #d4edda; border-radius: 8px; color: #155724; }
        .status-badge.active { display: inline-block; padding: 4px 12px; background: #10b981; color: white; border-radius: 20px; font-size: 12px; margin-right: 12px; }
        .btn-history { padding: 10px 20px; background: #6b7280; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; }
        .session-history { background: white; border-radius: 12px; padding: 16px; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
        .history-list { display: flex; flex-direction: column; gap: 12px; margin-top: 12px; }
        .history-item { display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #f9fafb; border-radius: 8px; flex-wrap: wrap; gap: 10px; }
        .settings-section { background: #f9fafb; padding: 20px; border-radius: 12px; margin-bottom: 24px; }
        .form-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; }
        .form-group { display: flex; flex-direction: column; gap: 8px; }
        .form-group label { font-weight: 500; }
        .course-select, .date-input, .time-input, .location-select { padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 8px; }
        .stats-bar { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; margin-bottom: 24px; }
        .stat-box { background: white; padding: 16px; border-radius: 12px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
        .stat-label { display: block; font-size: 12px; color: #6b7280; margin-bottom: 8px; }
        .stat-number { font-size: 28px; font-weight: bold; color: #1a1a2e; }
        .stat-box.present .stat-number { color: #10b981; }
        .stat-box.absent .stat-number { color: #ef4444; }
        .stat-box.percentage .stat-number { color: #4F46E5; }
        .bulk-actions { display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
        .btn-bulk, .btn-mark-all, .btn-clear-all { padding: 10px 20px; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; }
        .btn-bulk { background: #6b7280; color: white; }
        .btn-mark-all { background: #10b981; color: white; }
        .btn-clear-all { background: #f59e0b; color: white; }
        .students-list h3 { margin: 0 0 16px 0; }
        .table-container { overflow-x: auto; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); margin-bottom: 24px; }
        .attendance-table { width: 100%; border-collapse: collapse; }
        .attendance-table th, .attendance-table td { padding: 14px 16px; text-align: left; border-bottom: 1px solid #e5e7eb; }
        .attendance-table th { background: #f9fafb; font-weight: 600; }
        .present-row { background: #f0fdf4; }
        .absent-row { background: white; }
        .student-info { display: flex; align-items: center; gap: 10px; }
        .avatar { font-size: 20px; }
        .status-badge { padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 500; }
        .status-badge.present { background: #d1fae5; color: #065f46; }
        .status-badge.absent { background: #fee2e2; color: #991b1b; }
        .action-btn { padding: 6px 12px; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500; }
        .btn-present { background: #10b981; color: white; }
        .btn-absent { background: #ef4444; color: white; }
        .save-section { text-align: center; padding: 20px; background: #f9fafb; border-radius: 12px; }
        .btn-save { padding: 14px 32px; background: linear-gradient(135deg, #4F46E5, #4338CA); color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; }
        .btn-save:disabled { background: #9ca3af; cursor: not-allowed; }
        .warning-text { margin-top: 12px; color: #f59e0b; font-size: 14px; }
        @media (max-width: 768px) { .form-row { grid-template-columns: 1fr; } .stats-bar { grid-template-columns: 1fr 1fr; } .active-session-banner { flex-direction: column; text-align: center; } .session-info { flex-direction: column; } }
      `}</style>
    </div>
  );
}