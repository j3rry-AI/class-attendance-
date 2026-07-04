// src/components/StudentList.jsx
import React, { useState, useEffect } from 'react';
import apiFetch from '../../utils/api';

export default function StudentList({ user, regNumber }) {
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [students, setStudents] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetchCourses();
  }, [regNumber]);

  const fetchCourses = async () => {
    try {
      const response = await apiFetch(`/api/lecturer/${encodeURIComponent(regNumber)}/courses`);
      if (response.ok) {
        setCourses(response.data);
        if (response.data.length > 0) {
          setSelectedCourse(response.data[0].id);
          fetchStudents(response.data[0].id);
        }
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error fetching courses:', error);
      setMessage({ type: 'error', text: 'Failed to load courses' });
    } finally {
      setLoading(false);
    }
  };

  const fetchStudents = async (courseId) => {
    setLoading(true);
    try {
      const response = await apiFetch(`/api/lecturer/${encodeURIComponent(regNumber)}/course/${courseId}/students`);
      if (response.ok) {
        setStudents(response.data);
      } else {
        setMessage({ type: 'error', text: response.error?.error || response.error || 'Failed to load students' });
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error fetching students:', error);
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setLoading(false);
    }
  };

  const handleCourseChange = (e) => {
    const courseId = e.target.value;
    setSelectedCourse(courseId);
    fetchStudents(courseId);
    setSearchTerm('');
  };

  const filteredStudents = students.filter(student =>
    student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.reg_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading && courses.length === 0) {
    return <div className="loading-container"><div className="loading-spinner"></div><p>Loading students...</p><style>{`.loading-container { text-align: center; padding: 60px; } .loading-spinner { width: 40px; height: 40px; border: 3px solid #e5e7eb; border-top-color: #4F46E5; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px; } @keyframes spin { to { transform: rotate(360deg); } }`}</style></div>;
  }

  const currentCourse = courses.find(c => c.id === selectedCourse);

  return (
    <div className="student-list-container">
      <div className="student-list-header">
        <h2>👥 Student List</h2>
        <p>View students enrolled in your courses</p>
      </div>

      {message && <div className={`message ${message.type}`}>{message.text}</div>}

      <div className="filter-section">
        <div className="course-filter">
          <label>Select Course:</label>
          <select value={selectedCourse} onChange={handleCourseChange} className="course-select">
            {courses.map(course => (
              <option key={course.id} value={course.id}>{course.code} - {course.title}</option>
            ))}
          </select>
        </div>
        <div className="search-filter">
          <input type="text" placeholder="🔍 Search by name or registration number..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="search-input" />
        </div>
      </div>

      <div className="stats-banner">
        <div className="stat-item"><span className="stat-label">Course:</span><span className="stat-value">{currentCourse?.code} - {currentCourse?.title}</span></div>
        <div className="stat-item"><span className="stat-label">Total Students:</span><span className="stat-value">{students.length}</span></div>
        <div className="stat-item"><span className="stat-label">Showing:</span><span className="stat-value">{filteredStudents.length} students</span></div>
      </div>

      {filteredStudents.length === 0 ? (
        <div className="no-students"><div className="no-icon">👥</div><h3>No Students Found</h3><p>{searchTerm ? `No students matching "${searchTerm}"` : 'No students enrolled in this course'}</p></div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead><tr><th>S/N</th><th>Student Name</th><th>Registration Number</th><th>Total Classes</th><th>Present</th><th>Attendance %</th></tr></thead>
            <tbody>
              {filteredStudents.map((student, index) => (
                <tr key={student.id}>
                  <td>{index + 1}</td>
                  <td><div className="student-name"><span className="avatar">👨‍🎓</span>{student.name}</div></td>
                  <td>{student.reg_number}</td>
                  <td>{student.total_classes}</td>
                  <td>{student.present_count}</td>
                  <td className={student.attendance_percentage >= 75 ? 'high-attendance' : 'low-attendance'}>{student.attendance_percentage}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        .student-list-container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .student-list-header { margin-bottom: 24px; }
        .student-list-header h2 { margin: 0 0 8px 0; color: #1a1a2e; font-size: 1.8rem; }
        .student-list-header p { margin: 0; color: #6b7280; }
        .message { padding: 12px; border-radius: 8px; margin-bottom: 20px; }
        .message.success { background: #d4edda; color: #155724; }
        .message.error { background: #f8d7da; color: #721c24; }
        .filter-section { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 20px; }
        .course-filter { display: flex; align-items: center; gap: 12px; }
        .course-select { padding: 10px 16px; border: 1px solid #e5e7eb; border-radius: 8px; min-width: 250px; }
        .search-filter { flex: 1; min-width: 250px; }
        .search-input { width: 100%; padding: 10px 16px; border: 1px solid #e5e7eb; border-radius: 8px; }
        .stats-banner { background: #f0fdf4; border: 1px solid #d1fae5; border-radius: 12px; padding: 16px 20px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 24px; }
        .stat-item { display: flex; gap: 8px; }
        .stat-label { font-weight: 500; color: #065f46; }
        .stat-value { color: #047857; font-weight: 500; }
        .table-container { background: white; border-radius: 12px; overflow-x: auto; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
        .data-table { width: 100%; border-collapse: collapse; }
        .data-table th, .data-table td { padding: 14px 16px; text-align: left; border-bottom: 1px solid #e5e7eb; }
        .data-table th { background: #f9fafb; font-weight: 600; }
        .data-table tr:hover { background: #f9fafb; }
        .student-name { display: flex; align-items: center; gap: 10px; }
        .avatar { font-size: 20px; }
        .high-attendance { color: #10b981; font-weight: bold; }
        .low-attendance { color: #ef4444; font-weight: bold; }
        .no-students { text-align: center; padding: 60px 20px; background: #f9fafb; border-radius: 12px; }
        .no-icon { font-size: 48px; margin-bottom: 16px; }
        @media (max-width: 768px) { .filter-section { flex-direction: column; } .stats-banner { flex-direction: column; } }
      `}</style>
    </div>
  );
}