// src/components/StudentAttendanceReport.jsx
import React, { useState, useEffect } from 'react';
import apiFetch from '../utils/api';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export default function StudentAttendanceReport({ user, regNumber }) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [records, setRecords] = useState([]);
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('all');
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1));
  const [endDate, setEndDate] = useState(new Date());
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeFile, setDisputeFile] = useState(null);
  const [disputeStatus, setDisputeStatus] = useState('');

  // Fetch data
  const fetchData = async () => {
    setLoading(true);
    try {
      if (!regNumber) {
        setSummary(null);
        setRecords([]);
        setLoading(false);
        return;
      }

      // Fetch user's enrolled courses
      const coursesRes = await apiFetch(`/api/users/${encodeURIComponent(regNumber)}/courses`);
      if (coursesRes.ok) {
        setCourses(coursesRes.data);
      } else {
        setCourses([]);
        if (import.meta.env.DEV) console.error('Error fetching courses:', coursesRes.error || coursesRes);
      }

      // Fetch attendance report with filters
      const params = new URLSearchParams({
        reg_number: regNumber,
        course_id: selectedCourse !== 'all' ? selectedCourse : '',
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0]
      });
      
      const reportRes = await apiFetch(`/api/student/attendance-report?${params}`);
      if (reportRes.ok && reportRes.data) {
        setSummary(reportRes.data.summary);
        setRecords(reportRes.data.records || []);
      } else {
        setSummary(null);
        setRecords([]);
        if (import.meta.env.DEV) console.error('Error fetching report:', reportRes.error || reportRes);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error fetching report:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedCourse, startDate, endDate]);

  const displayName = (typeof user === 'string') ? user : (user && (user.name || user.reg_number));

  // Prepare chart data
  const weeklyData = () => {
    const weekMap = new Map();
    records.forEach(record => {
      const week = new Date(record.date).toLocaleDateString('en-US', { week: 'numeric', year: 'numeric' });
      if (!weekMap.has(week)) weekMap.set(week, { week, present: 0, absent: 0, total: 0 });
      const weekData = weekMap.get(week);
      weekData.total++;
      if (record.status === 'present') weekData.present++;
      else if (record.status === 'absent') weekData.absent++;
    });
    return Array.from(weekMap.values()).map(w => ({
      week: w.week,
      percentage: w.total > 0 ? (w.present / w.total) * 100 : 0
    }));
  };

  const courseData = () => {
    const courseMap = new Map();
    records.forEach(record => {
      if (!courseMap.has(record.courseCode)) {
        courseMap.set(record.courseCode, { course: record.courseCode, present: 0, total: 0 });
      }
      const courseData = courseMap.get(record.courseCode);
      courseData.total++;
      if (record.status === 'present') courseData.present++;
    });
    return Array.from(courseMap.values()).map(c => ({
      course: c.course,
      percentage: c.total > 0 ? (c.present / c.total) * 100 : 0
    }));
  };

  const pieData = () => {
    const present = records.filter(r => r.status === 'present').length;
    const absent = records.filter(r => r.status === 'absent').length;
    const late = records.filter(r => r.status === 'late').length;
    const excused = records.filter(r => r.status === 'excused').length;
    return [
      { name: 'Present', value: present, color: '#10b981' },
      { name: 'Absent', value: absent, color: '#ef4444' },
      { name: 'Late', value: late, color: '#f59e0b' },
      { name: 'Excused', value: excused, color: '#3b82f6' }
    ];
  };

  const getStatusBadge = (status) => {
    const classes = {
      present: 'bg-green-100 text-green-800',
      absent: 'bg-red-100 text-red-800',
      late: 'bg-yellow-100 text-yellow-800',
      excused: 'bg-blue-100 text-blue-800'
    };
    return classes[status] || 'bg-gray-100 text-gray-800';
  };

  const exportPDF = async () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Attendance Report', 14, 20);
    doc.setFontSize(12);
    doc.text(`Student: ${displayName} (${regNumber})`, 14, 35);
    doc.text(`Period: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`, 14, 45);
    
    const tableData = records.map(r => [
      r.date,
      r.courseCode,
      r.time,
      r.status.toUpperCase(),
      r.faceScore || r.mfa?.faceScore || 'N/A'
    ]);

    doc.autoTable({
      startY: 55,
      head: [['Date', 'Course', 'Time', 'Status', 'Face Score']],
      body: tableData,
    });
    
    doc.save(`attendance_report_${regNumber}.pdf`);
  };

  const exportCSV = () => {
    const headers = ['Date', 'Course Code', 'Course Name', 'Time', 'Status', 'Face Score', 'Location'];
    const rows = records.map(r => [
      r.date, r.courseCode, r.courseName, r.time, r.status, r.faceScore || r.mfa?.faceScore || 'N/A', r.location || 'N/A'
    ]);
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_report_${regNumber}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const submitDispute = async () => {
    if (!disputeReason) {
      setDisputeStatus('Please provide a reason for dispute');
      return;
    }
    
    const formData = new FormData();
    formData.append('reg_number', regNumber);
    formData.append('record_id', selectedRecord?.id);
    formData.append('reason', disputeReason);
    if (disputeFile) formData.append('proof', disputeFile);
    
    try {
      const response = await fetch('http://localhost:3000/api/disputes', {
        method: 'POST',
        body: formData
      });
      
      if (response.ok) {
        setDisputeStatus('✅ Dispute submitted successfully!');
        setTimeout(() => {
          setShowModal(false);
          setDisputeReason('');
          setDisputeFile(null);
          setDisputeStatus('');
        }, 2000);
      } else {
        setDisputeStatus('❌ Failed to submit dispute');
      }
    } catch (error) {
      setDisputeStatus('❌ Network error');
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-64 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {[1,2,3,4].map(i => <div key={i} className="h-32 bg-gray-200 rounded"></div>)}
          </div>
          <div className="h-64 bg-gray-200 rounded mb-6"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Full Attendance Report</h1>
        <p className="text-gray-500">{displayName} • {regNumber}</p>
      </div>

      {/* Warning Banner */}
      {summary?.overallPercentage < 75 && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded">
          <p className="font-bold">⚠️ Warning: You are below the 75% attendance required for exams!</p>
          <p className="text-sm">Current attendance: {summary.overallPercentage}%</p>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-gray-500 text-sm">Overall Attendance</div>
          <div className="text-2xl font-bold text-indigo-600">{summary?.overallPercentage || 0}%</div>
          <div className="text-xs text-gray-400">{summary?.attended}/{summary?.total} classes</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-gray-500 text-sm">Exam Eligibility</div>
          <div className={`text-2xl font-bold ${summary?.overallPercentage >= 75 ? 'text-green-600' : 'text-red-600'}`}>
            {summary?.overallPercentage >= 75 ? '✅ Eligible' : '❌ Warning'}
          </div>
          <div className="text-xs text-gray-400">Required: 75%</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-gray-500 text-sm">Face Verification Rate</div>
          <div className="text-2xl font-bold text-green-600">{summary?.faceSuccessRate || 0}%</div>
          <div className="text-xs text-gray-400">Face verification statistics</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-gray-500 text-sm">Absences Left</div>
          <div className="text-2xl font-bold text-orange-600">{summary?.absencesLeft || 0}</div>
          <div className="text-xs text-gray-400">Before falling below 75%</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Course</label>
            <select 
              className="w-full border rounded-lg px-3 py-2"
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
            >
              <option value="all">All Courses</option>
              {courses.map(c => (
                <option key={c.id} value={c.id}>{c.code} - {c.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <DatePicker
              selected={startDate}
              onChange={setStartDate}
              className="w-full border rounded-lg px-3 py-2"
              dateFormat="yyyy-MM-dd"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <DatePicker
              selected={endDate}
              onChange={setEndDate}
              className="w-full border rounded-lg px-3 py-2"
              dateFormat="yyyy-MM-dd"
            />
          </div>
          <div className="flex items-end">
            <button 
              onClick={fetchData}
              className="w-full bg-indigo-600 text-white rounded-lg px-4 py-2 hover:bg-indigo-700"
            >
              Apply Filters
            </button>
          </div>
        </div>
      </div>

      {/* Table and Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Table */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Course</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">MFA</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {records.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                      No attendance records found for selected filters
                    </td>
                  </tr>
                ) : (
                  records.map((record) => (
                    <tr key={record.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm">{record.date}</td>
                      <td className="px-4 py-3 text-sm">{record.courseCode}</td>
                      <td className="px-4 py-3 text-sm">{record.time}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadge(record.status)}`}>
                          {record.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {record.faceScore || record.mfa?.faceScore ? `${(record.faceScore || record.mfa?.faceScore) || 0}%` : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {(record.status === 'present' || record.status === 'late') && (
                          <button 
                            onClick={() => { setSelectedRecord(record); setShowModal(true); }}
                            className="text-indigo-600 hover:text-indigo-800 text-sm"
                          >
                            View Details
                          </button>
                        )}
                        {record.status === 'absent' && record.canDispute && (
                          <button 
                            onClick={() => { setSelectedRecord(record); setShowModal(true); }}
                            className="text-orange-600 hover:text-orange-800 text-sm"
                          >
                            Dispute
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Charts Sidebar */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-semibold text-gray-700 mb-3">Weekly Attendance Trend</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={weeklyData()}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Line type="monotone" dataKey="percentage" stroke="#4F46E5" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-semibold text-gray-700 mb-3">Attendance by Course</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={courseData()}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="course" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Bar dataKey="percentage" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-semibold text-gray-700 mb-3">Attendance Distribution</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData()} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                  {pieData().map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Dispute Form */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h3 className="font-semibold text-gray-800 mb-4">Submit Attendance Dispute</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Select Class</label>
            <select 
              className="w-full border rounded-lg px-3 py-2"
              value={selectedRecord?.id || ''}
              onChange={(e) => {
                const record = records.find(r => r.id === e.target.value);
                setSelectedRecord(record);
              }}
            >
              <option value="">Select an absent class</option>
              {records.filter(r => r.status === 'absent' && r.canDispute).map(r => (
                <option key={r.id} value={r.id}>{r.date} - {r.courseCode}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Dispute</label>
            <textarea 
              className="w-full border rounded-lg px-3 py-2"
              rows="2"
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="Explain why this attendance should be reconsidered..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Upload Proof (Medical report, etc.)</label>
            <input 
              type="file"
              onChange={(e) => setDisputeFile(e.target.files[0])}
              className="w-full border rounded-lg px-3 py-2"
              accept=".pdf,.jpg,.png"
            />
          </div>
          <div className="flex items-end">
            <button 
              onClick={submitDispute}
              className="w-full bg-orange-600 text-white rounded-lg px-4 py-2 hover:bg-orange-700"
              disabled={!selectedRecord}
            >
              Submit Dispute
            </button>
          </div>
        </div>
        {disputeStatus && (
          <div className={`mt-3 p-2 rounded text-sm ${disputeStatus.includes('✅') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {disputeStatus}
          </div>
        )}
      </div>

      {/* Export Buttons */}
      <div className="flex gap-4">
        <button 
          onClick={exportPDF}
          className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700"
        >
          📄 Download PDF
        </button>
        <button 
          onClick={exportCSV}
          className="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700"
        >
          📊 Export CSV
        </button>
      </div>

      {/* MFA Details Modal */}
      {showModal && selectedRecord && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">Attendance Details</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <div className="space-y-3">
              <p><strong>Date & Time:</strong> {selectedRecord.date} at {selectedRecord.time}</p>
              <p><strong>Course:</strong> {selectedRecord.courseCode} - {selectedRecord.courseName}</p>
              <p><strong>Face Match Score:</strong> 
                <span className={`ml-2 font-bold ${(selectedRecord.faceScore || selectedRecord.mfa?.faceScore) >= 85 ? 'text-green-600' : 'text-red-600'}`}>
                  {(selectedRecord.faceScore || selectedRecord.mfa?.faceScore) || 0}% - {(selectedRecord.faceScore || selectedRecord.mfa?.faceScore) >= 85 ? 'PASS' : 'FAIL'}
                </span>
              </p>
              <p><small className="text-gray-500">Required threshold: 85%</small></p>
              <p><strong>Liveness Check:</strong> {selectedRecord.mfa?.livenessPassed || selectedRecord.livenessPassed ? '✅ Passed' : '❌ Failed'}</p>
              <p><strong>Device Used:</strong> {selectedRecord.mfa?.device || selectedRecord.device || 'Unknown'}</p>
              <p><strong>Location (GPS):</strong> {selectedRecord.gps || 'N/A'}</p>
              <p><strong>Server Timestamp:</strong> {selectedRecord.timestamp}</p>
            </div>
            <button 
              onClick={() => setShowModal(false)}
              className="mt-6 w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}