// src/components/LecturerReports.jsx
import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import apiFetch from '../../utils/api';

export default function LecturerReports({ user, regNumber }) {
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [reportData, setReportData] = useState(null);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetchCourses();
  }, [regNumber]);

  const displayName = (typeof user === 'string') ? user : (user && (user.name || user.reg_number));

  const fetchCourses = async () => {
    try {
      const response = await apiFetch(`/api/lecturer/${encodeURIComponent(regNumber)}/courses`);
      if (response.ok) {
        setCourses(response.data);
        if (response.data.length > 0) {
          setSelectedCourse(response.data[0].id);
          fetchReport(response.data[0].id);
        }
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error fetching courses:', error);
      setMessage({ type: 'error', text: 'Failed to load courses' });
    } finally {
      setLoading(false);
    }
  };

  const fetchReport = async (courseId) => {
    setLoading(true);
    try {
      const response = await apiFetch(`/api/lecturer/${encodeURIComponent(regNumber)}/attendance-report?course_id=${courseId}`);
      if (response.ok) {
        setReportData(response.data.summary);
        setAttendanceRecords(response.data.records || []);
      } else {
        setMessage({ type: 'error', text: response.error?.error || response.error || 'Failed to load report' });
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error fetching report:', error);
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setLoading(false);
    }
  };

  const handleCourseChange = (e) => {
    const courseId = e.target.value;
    setSelectedCourse(courseId);
    fetchReport(courseId);
  };

  const exportPDF = () => {
    const course = courses.find(c => c.id === selectedCourse);
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Attendance Report', 14, 20);
    doc.setFontSize(12);
    doc.text(`Course: ${course?.code} - ${course?.title}`, 14, 35);
    doc.text(`Lecturer: ${displayName} (${regNumber})`, 14, 45);
    doc.text(`Total Students: ${reportData?.totalStudents || 0}`, 14, 55);
    doc.text(`Average Attendance: ${reportData?.averageAttendance || 0}%`, 14, 65);
    
    const tableData = attendanceRecords.map(record => [
      record.student_name,
      record.reg_number,
      record.total_classes,
      record.present_count,
      `${record.attendance_percentage}%`
    ]);
    
    doc.autoTable({
      startY: 75,
      head: [['Student Name', 'Reg Number', 'Total Classes', 'Present', 'Percentage']],
      body: tableData,
    });
    
    doc.save(`attendance_report_${course?.code}.pdf`);
  };

  const exportCSV = () => {
    const course = courses.find(c => c.id === selectedCourse);
    const headers = ['Student Name', 'Registration Number', 'Total Classes', 'Present Count', 'Attendance Percentage'];
    const rows = attendanceRecords.map(record => [
      record.student_name,
      record.reg_number,
      record.total_classes,
      record.present_count,
      `${record.attendance_percentage}%`
    ]);
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_report_${course?.code}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && courses.length === 0) {
    return <div className="loading-container"><div className="loading-spinner"></div><p>Loading reports...</p><style>{`.loading-container { text-align: center; padding: 60px; } .loading-spinner { width: 40px; height: 40px; border: 3px solid #e5e7eb; border-top-color: #4F46E5; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px; } @keyframes spin { to { transform: rotate(360deg); } }`}</style></div>;
  }

  return (
    <div className="reports-container">
      <div className="reports-header">
        <h2>📊 Attendance Reports</h2>
        <p>View attendance statistics for your courses</p>
      </div>

      {message && <div className={`message ${message.type}`}>{message.text}</div>}

      <div className="filter-section">
        <label>Select Course:</label>
        <select value={selectedCourse} onChange={handleCourseChange} className="course-select">
          {courses.map(course => (
            <option key={course.id} value={course.id}>{course.code} - {course.title}</option>
          ))}
        </select>
      </div>

      {reportData && (
        <div className="summary-cards">
          <div className="summary-card"><div className="summary-icon">👥</div><div className="summary-value">{reportData.totalStudents}</div><div className="summary-label">Total Students</div></div>
          <div className="summary-card"><div className="summary-icon">📊</div><div className="summary-value">{reportData.averageAttendance}%</div><div className="summary-label">Avg Attendance</div></div>
          <div className="summary-card"><div className="summary-icon">✅</div><div className="summary-value">{reportData.totalPresent}</div><div className="summary-label">Total Present</div></div>
          <div className="summary-card"><div className="summary-icon">📅</div><div className="summary-value">{reportData.totalClasses}</div><div className="summary-label">Total Classes</div></div>
        </div>
      )}

      <div className="table-container">
        <h3>Student Attendance Details</h3>
        {attendanceRecords.length === 0 ? (
          <p className="no-data">No attendance records found for this course.</p>
        ) : (
          <table className="data-table">
            <thead><tr><th>Student Name</th><th>Registration Number</th><th>Total Classes</th><th>Present</th><th>Percentage</th></tr></thead>
            <tbody>
              {attendanceRecords.map(record => (
                <tr key={record.reg_number}>
                  <td>{record.student_name}</td>
                  <td>{record.reg_number}</td>
                  <td>{record.total_classes}</td>
                  <td>{record.present_count}</td>
                  <td className={record.attendance_percentage >= 75 ? 'high-attendance' : 'low-attendance'}>{record.attendance_percentage}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="export-buttons">
        <button onClick={exportPDF} className="btn-pdf">📄 Download PDF</button>
        <button onClick={exportCSV} className="btn-csv">📊 Export CSV</button>
      </div>

      <style>{`
        .reports-container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .reports-header { margin-bottom: 24px; }
        .reports-header h2 { margin: 0 0 8px 0; color: #1a1a2e; font-size: 1.8rem; }
        .reports-header p { margin: 0; color: #6b7280; }
        .message { padding: 12px; border-radius: 8px; margin-bottom: 20px; }
        .message.success { background: #d4edda; color: #155724; }
        .message.error { background: #f8d7da; color: #721c24; }
        .filter-section { background: #f9fafb; padding: 20px; border-radius: 12px; margin-bottom: 24px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
        .filter-section label { font-weight: 500; }
        .course-select { padding: 10px 16px; border: 1px solid #e5e7eb; border-radius: 8px; min-width: 250px; }
        .summary-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .summary-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 16px; text-align: center; }
        .summary-icon { font-size: 32px; margin-bottom: 10px; }
        .summary-value { font-size: 32px; font-weight: bold; }
        .summary-label { font-size: 14px; opacity: 0.9; margin-top: 5px; }
        .table-container { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); margin-bottom: 24px; overflow-x: auto; }
        .table-container h3 { margin: 0 0 16px 0; }
        .data-table { width: 100%; border-collapse: collapse; }
        .data-table th, .data-table td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
        .data-table th { background: #f9fafb; font-weight: 600; }
        .high-attendance { color: #10b981; font-weight: bold; }
        .low-attendance { color: #ef4444; font-weight: bold; }
        .no-data { text-align: center; padding: 40px; color: #6b7280; }
        .export-buttons { display: flex; gap: 16px; }
        .btn-pdf { background: #ef4444; color: white; padding: 12px 24px; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; }
        .btn-csv { background: #10b981; color: white; padding: 12px 24px; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; }
        @media (max-width: 768px) { .summary-cards { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}