// src/components/MyCourses.jsx
import React, { useState, useEffect } from 'react';
import apiFetch from '../utils/api';

export default function MyCourses({ user, regNumber }) {
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState([]);
  const [summary, setSummary] = useState({ total_courses: 0, total_units: 0 });  // Changed: total_credits → total_units
  const [error, setError] = useState(null);
  const [apiMessage, setApiMessage] = useState(null);
  const [availableCourses, setAvailableCourses] = useState([]);
  const [viewMode, setViewMode] = useState('my');
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedSemester, setSelectedSemester] = useState('all');

  useEffect(() => {
    fetchMyCourses();
    fetchAvailableCourses();
  }, [regNumber]);

  const fetchMyCourses = async () => {
    setLoading(true);
    setError(null);
    setApiMessage(null);
    
    if (!regNumber) {
      setError('Registration number missing. Please login again.');
      setLoading(false);
      return;
    }

    try {
        const res = await apiFetch(`/api/users/${encodeURIComponent(regNumber)}/my-courses`);
        if (res.ok) {
          setCourses(res.data.courses || []);
          setSummary({
            total_courses: res.data.total_courses || 0,
            total_units: res.data.total_credits || 0
          });
        } else {
          const message = res.error?.message || res.error || 'Failed to load courses';
          setError(message);
        }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error fetching courses:', error);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableCourses = async () => {
    if (!regNumber) return;
    try {
      const res = await apiFetch(`/api/users/${encodeURIComponent(regNumber)}/available-courses`);
      if (res.ok) {
        setAvailableCourses(res.data.courses || []);
      } else {
        const message = res.error?.message || res.error || 'Failed to load available courses';
        setApiMessage({ type: 'error', text: message });
      }
    } catch (fetchError) {
      if (import.meta.env.DEV) console.error('Error fetching available courses:', fetchError);
      setApiMessage({ type: 'error', text: 'Network error while loading available courses.' });
    }
  };

  const refreshAllCourses = async () => {
    await Promise.all([fetchMyCourses(), fetchAvailableCourses()]);
  };

  const handleEnroll = async (courseId) => {
    if (!regNumber || !courseId) return;
    setActionLoading(true);
    setApiMessage(null);

    try {
      const res = await apiFetch(`/api/users/${encodeURIComponent(regNumber)}/enroll`, {
        method: 'POST',
        body: { course_id: courseId }
      });

      if (res.ok) {
        setApiMessage({ type: 'success', text: 'Enrollment successful!' });
        await refreshAllCourses();
      } else {
        const message = res.error?.message || res.error || 'Failed to enroll';
        setApiMessage({ type: 'error', text: message });
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('Enroll error:', err);
      setApiMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDrop = async (courseId) => {
    if (!regNumber || !courseId) return;
    setActionLoading(true);
    setApiMessage(null);

    try {
      const res = await apiFetch(`/api/users/${encodeURIComponent(regNumber)}/enroll/${encodeURIComponent(courseId)}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        setApiMessage({ type: 'success', text: 'Dropped from course successfully.' });
        await refreshAllCourses();
      } else {
        const message = res.error?.message || res.error || 'Failed to drop course';
        setApiMessage({ type: 'error', text: message });
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('Drop error:', err);
      setApiMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Filter courses by semester
  const currentCourses = viewMode === 'my' ? courses : availableCourses;
  const filteredCourses = selectedSemester === 'all' 
    ? currentCourses 
    : currentCourses.filter(c => c.semester === selectedSemester);

  // Get unique semesters for filter
  const semesters = ['all', ...new Set(currentCourses.map(c => c.semester).filter(Boolean))];

  if (loading) {
    return (
      <div className="my-courses-loading">
        <div className="loading-spinner"></div>
        <p>Loading your courses...</p>
        <style>{`
          .my-courses-loading {
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

  if (error) {
    return (
      <div className="my-courses-error">
        <div className="error-icon">⚠️</div>
        <h3>Unable to Load Courses</h3>
        <p>{error}</p>
        <button onClick={fetchMyCourses} className="retry-btn">Try Again</button>
        <style>{`
          .my-courses-error {
            text-align: center;
            padding: 60px 20px;
            background: #fef2f2;
            border-radius: 16px;
            margin: 40px;
          }
          .error-icon {
            font-size: 48px;
            margin-bottom: 16px;
          }
          .retry-btn {
            margin-top: 16px;
            padding: 10px 24px;
            background: #4F46E5;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="my-courses-container">
      <div className="my-courses-header">
        <h2>📚 {viewMode === 'my' ? 'My Courses' : 'Available Courses'}</h2>
        <p>{viewMode === 'my' ? 'View all the courses you are enrolled in for the current semester' : 'Browse courses you can enroll in'}</p>
        <div className="view-toggle">
          <button className={viewMode === 'my' ? 'active' : ''} onClick={() => setViewMode('my')} type="button">My Courses</button>
          <button className={viewMode === 'available' ? 'active' : ''} onClick={() => setViewMode('available')} type="button">Available Courses</button>
        </div>
      </div>

      {apiMessage && (
        <div className={`message ${apiMessage.type}`}>
          {apiMessage.text}
        </div>
      )}

      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card">
          <div className="summary-icon">📖</div>
          <div className="summary-value">{summary.total_courses}</div>
          <div className="summary-label">Total Courses</div>
        </div>
        <div className="summary-card">
          <div className="summary-icon">🎓</div>
          <div className="summary-value">{summary.total_units}</div>  {/* Changed: total_credits → total_units */}
          <div className="summary-label">Total Units</div>  {/* Changed: Credits → Units */}
        </div>
        <div className="summary-card">
          <div className="summary-icon">📅</div>
          <div className="summary-value">{courses.length > 0 ? courses[0]?.semester || 'First' : 'First'}</div>
          <div className="summary-label">Current Semester</div>
        </div>
      </div>

      {/* Filter Bar */}
      {semesters.length > 1 && (
        <div className="filter-bar">
          <label>Filter by Semester:</label>
          <select 
            value={selectedSemester} 
            onChange={(e) => setSelectedSemester(e.target.value)}
            className="semester-filter"
          >
            {semesters.map(sem => (
              <option key={sem} value={sem}>
                {sem === 'all' ? 'All Semesters' : sem}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Courses Grid */}
      {filteredCourses.length === 0 ? (
        <div className="no-courses">
          <div className="no-courses-icon">📭</div>
          <h3>{viewMode === 'my' ? 'No Courses Found' : 'No Available Courses'}</h3>
          <p>{viewMode === 'my' ? 'You are not enrolled in any courses for the selected semester.' : 'You are enrolled in all available courses for the selected semester.'}</p>
          <p className="text-sm text-gray-500">Please contact your registration officer for assistance.</p>
        </div>
      ) : (
        <div className="courses-grid">
          {filteredCourses.map((course) => (
            <div key={course.id} className="course-card">
              <div className="course-header">
                <div className="course-code">{course.code}</div>
                <div className="course-units">{course.credits} Units</div>  {/* Changed: course-credits → course-units, Credits → Units */}
              </div>
              <div className="course-title">{course.title}</div>
              <div className="course-details">
                <div className="detail-item">
                  <span className="detail-label">Lecturer:</span>
                  <span className="detail-value">{course.lecturer_name || course.lecturer_id || 'Not Assigned'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Semester:</span>
                  <span className="detail-value">{course.semester || 'First'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Academic Year:</span>
                  <span className="detail-value">{course.academic_year || '2025/2026'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Enrolled Date:</span>
                  <span className="detail-value">
                    {course.enrolled_date ? new Date(course.enrolled_date).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              </div>
              <div className="course-footer">
                {viewMode === 'my' ? (
                  <>
                    <button className="view-details-btn" onClick={() => alert(`Course details for ${course.code}\n\nTitle: ${course.title}\nUnits: ${course.credits}\nLecturer: ${course.lecturer_name || course.lecturer_id || 'Not Assigned'}`)}>
                      View Details
                    </button>
                    <button className="drop-course-btn" onClick={() => handleDrop(course.id)} disabled={actionLoading}>
                      Drop Course
                    </button>
                  </>
                ) : (
                  <button className="enroll-btn" onClick={() => handleEnroll(course.id)} disabled={actionLoading}>
                    Enroll
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .my-courses-container {
          max-width: 100% !important;
          width: 100% !important;
          margin: 0 auto;
          padding: 20px;
          box-sizing: border-box;
        }
        .my-courses-header {
          margin-bottom: 24px;
        }
        .view-toggle {
          display: flex;
          gap: 12px;
          margin-top: 16px;
          flex-wrap: wrap;
        }
        .view-toggle button {
          border: 1px solid #e5e7eb;
          background: #fff;
          color: #374151;
          padding: 10px 18px;
          border-radius: 999px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .view-toggle button.active {
          border-color: #4F46E5;
          background: #4F46E5;
          color: #fff;
        }
        .view-toggle button:hover {
          background: #eef2ff;
        }
        .course-footer {
          display: flex;
          gap: 12px;
          padding: 16px 20px;
          border-top: 1px solid #f0f0f0;
          flex-wrap: wrap;
        }
        .drop-course-btn,
        .enroll-btn {
          padding: 10px 16px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
          transition: background 0.2s ease;
        }
        .drop-course-btn {
          background: #ef4444;
          color: white;
        }
        .drop-course-btn:hover {
          background: #dc2626;
        }
        .enroll-btn {
          background: #10b981;
          color: white;
        }
        .enroll-btn:hover {
          background: #059669;
        }
        .message {
          padding: 14px 18px;
          border-radius: 12px;
          margin-bottom: 20px;
          font-weight: 500;
        }
        .message.success {
          background: #ecfdf5;
          color: #065f46;
          border: 1px solid #a7f3d0;
        }
        .message.error {
          background: #fef2f2;
          color: #991b1b;
          border: 1px solid #fecaca;
        }
        .view-details-btn {
          width: auto;
        }
        .my-courses-header h2 {
          margin: 0 0 8px 0;
          color: #1a1a2e;
          font-size: 1.8rem;
        }
        .my-courses-header p {
          margin: 0;
          color: #6b7280;
        }
        .summary-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }
        .summary-card {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 20px;
          border-radius: 16px;
          text-align: center;
        }
        .summary-icon {
          font-size: 32px;
          margin-bottom: 10px;
        }
        .summary-value {
          font-size: 32px;
          font-weight: bold;
        }
        .summary-label {
          font-size: 14px;
          opacity: 0.9;
          margin-top: 5px;
        }
        .filter-bar {
          display: flex;
          align-items: center;
          gap: 15px;
          margin-bottom: 24px;
          padding: 15px;
          background: #f9fafb;
          border-radius: 12px;
          flex-wrap: wrap;
        }
        .filter-bar label {
          font-weight: 500;
          color: #374151;
        }
        .semester-filter {
          padding: 8px 16px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          background: white;
          cursor: pointer;
        }
        .courses-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
          gap: 24px;
        }
        .course-card {
          background: white;
          border-radius: 16px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.05);
          overflow: hidden;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .course-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(0,0,0,0.1);
        }
        .course-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          background: linear-gradient(135deg, #4F46E5, #4338CA);
          color: white;
        }
        .course-code {
          font-size: 1.2rem;
          font-weight: bold;
          letter-spacing: 1px;
        }
        .course-units {
          background: rgba(255,255,255,0.2);
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 0.75rem;
        }
        .course-title {
          padding: 16px 20px;
          font-size: 1rem;
          font-weight: 500;
          color: #1a1a2e;
          border-bottom: 1px solid #f0f0f0;
        }
        .course-details {
          padding: 16px 20px;
        }
        .detail-item {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #f5f5f5;
        }
        .detail-label {
          color: #6b7280;
          font-size: 0.8rem;
        }
        .detail-value {
          color: #374151;
          font-size: 0.8rem;
          font-weight: 500;
        }
        .course-footer {
          padding: 16px 20px;
          border-top: 1px solid #f0f0f0;
        }
        .view-details-btn {
          width: 100%;
          padding: 10px;
          background: transparent;
          border: 1px solid #4F46E5;
          color: #4F46E5;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s;
        }
        .view-details-btn:hover {
          background: #4F46E5;
          color: white;
        }
        .no-courses {
          text-align: center;
          padding: 60px 20px;
          background: #f9fafb;
          border-radius: 16px;
        }
        .no-courses-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }
        @media (max-width: 768px) {
          .my-courses-container {
            padding: 15px;
          }
          .courses-grid {
            grid-template-columns: 1fr;
          }
          .summary-cards {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}