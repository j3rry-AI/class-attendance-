// src/components/admin/ManageCourses.jsx
import React, { useState, useEffect } from 'react';

export default function ManageCourses() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [message, setMessage] = useState(null);
  const [formData, setFormData] = useState({
    code: '',
    title: '',
    units: 3,
    semester: 'First'
  });
  
  // Academic Settings State
  const [academicSettings, setAcademicSettings] = useState({
    current_session: '2025/2026',
    current_semester: 'First',
    exam_period_start: null,
    exam_period_end: null
  });
  const [showAcademicModal, setShowAcademicModal] = useState(false);

  // Fetch all courses
  const fetchCourses = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/courses');
      const data = await response.json();
      setCourses(data);
    } catch (error) {
        if (import.meta.env.DEV) console.error('Error fetching courses:', error);
      setMessage({ type: 'error', text: 'Failed to load courses' });
    } finally {
      setLoading(false);
    }
  };

  // Fetch academic settings
  const fetchAcademicSettings = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/admin/academic-settings');
      const data = await response.json();
      if (response.ok) {
        setAcademicSettings(data);
      }
    } catch (error) {
      console.error('Error fetching academic settings:', error);
    }
  };

  useEffect(() => {
    fetchCourses();
    fetchAcademicSettings();
  }, []);

  // Reset form
  const resetForm = () => {
    setFormData({
      code: '',
      title: '',
      units: 3,
      semester: 'First'
    });
    setEditingCourse(null);
    setMessage(null);
  };

  // Open modal for create
  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  // Open modal for edit
  const openEditModal = (course) => {
    setEditingCourse(course);
    setFormData({
      code: course.code,
      title: course.title,
      units: course.credits || 3,
      semester: course.semester || 'First'
    });
    setShowModal(true);
    setMessage(null);
  };

  // CREATE new course
  const handleCreate = async (e) => {
    e.preventDefault();
    
    if (!formData.code || !formData.title) {
      setMessage({ type: 'error', text: 'Course code and title are required' });
      return;
    }
    
    try {
      const response = await fetch('http://localhost:3000/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: formData.code.toUpperCase(),
          title: formData.title,
          credits: parseInt(formData.units),
          semester: formData.semester
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setMessage({ type: 'success', text: `✅ Course "${formData.code}" created successfully!` });
        resetForm();
        fetchCourses();
        setTimeout(() => {
          setShowModal(false);
          setMessage(null);
        }, 1500);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to create course' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    }
  };

  // UPDATE course
  const handleUpdate = async (e) => {
    e.preventDefault();
    
    try {
      const response = await fetch(`http://localhost:3000/api/courses/${editingCourse.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: formData.code.toUpperCase(),
          title: formData.title,
          credits: parseInt(formData.units),
          semester: formData.semester
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setMessage({ type: 'success', text: `✅ Course "${formData.code}" updated successfully!` });
        fetchCourses();
        setTimeout(() => {
          setShowModal(false);
          setMessage(null);
        }, 1500);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update course' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    }
  };

  // DELETE course
  const handleDelete = async (course) => {
    if (window.confirm(`⚠️ Delete course "${course.code} - ${course.title}"?\n\nThis action cannot be undone.`)) {
      try {
        const response = await fetch(`http://localhost:3000/api/courses/${course.id}`, {
          method: 'DELETE'
        });
        
        if (response.ok) {
          setMessage({ type: 'success', text: `✅ Course "${course.code}" deleted successfully!` });
          fetchCourses();
          setTimeout(() => setMessage(null), 3000);
        } else {
          const data = await response.json();
          setMessage({ type: 'error', text: data.error || 'Failed to delete course' });
        }
      } catch (error) {
        setMessage({ type: 'error', text: 'Network error. Please try again.' });
      }
    }
  };

  // Save academic settings
  const saveAcademicSettings = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/admin/academic-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(academicSettings)
      });
      if (response.ok) {
        setMessage({ type: 'success', text: 'Academic settings updated!' });
        setShowAcademicModal(false);
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save settings' });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingCourse) {
      handleUpdate(e);
    } else {
      handleCreate(e);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading courses...</p>
      </div>
    );
  }

  return (
    <div className="manage-courses">
      <div className="section-header">
        <h2>📚 Manage Courses</h2>
        <div className="header-buttons">
          <button className="btn-academic" onClick={() => setShowAcademicModal(true)}>
            📅 Academic Session
          </button>
          <button className="btn-primary" onClick={openCreateModal}>
            + Add New Course
          </button>
        </div>
      </div>

      {/* Message Display */}
      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      {/* Courses Table */}
      {courses.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📚</div>
          <h3>No Courses Yet</h3>
          <p>Click "Add New Course" to create your first course.</p>
        </div>
      ) : (
        <div className="courses-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Course Code</th>
                <th>Course Title</th>
                <th>Units</th>
                <th>Semester</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {courses.map(course => (
                <tr key={course.id}>
                  <td><strong>{course.code}</strong></td>
                  <td>{course.title}</td>
                  <td>{course.credits || 3} Units</td>
                  <td>{course.semester || 'First'}</td>
                  <td>
                    <button className="btn-edit" onClick={() => openEditModal(course)}>
                      ✏️ Edit
                    </button>
                    <button className="btn-delete" onClick={() => handleDelete(course)}>
                      🗑️ Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal for Create/Edit */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingCourse ? '✏️ Edit Course' : '➕ Add New Course'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Course Code *</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({...formData, code: e.target.value.toUpperCase()})}
                  placeholder="e.g., CSC401"
                  required
                />
                <small>Example: CSC401, MAT201, ENG101</small>
              </div>
              
              <div className="form-group">
                <label>Course Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  placeholder="e.g., Advanced Programming"
                  required
                />
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label>Units</label>
                  <select
                    value={formData.units}
                    onChange={(e) => setFormData({...formData, units: parseInt(e.target.value)})}
                  >
                    <option value="1">1 Unit</option>
                    <option value="2">2 Units</option>
                    <option value="3">3 Units</option>
                    <option value="4">4 Units</option>
                    <option value="5">5 Units</option>
                  </select>
                </div>
                
                <div className="form-group">
                  <label>Semester</label>
                  <select
                    value={formData.semester}
                    onChange={(e) => setFormData({...formData, semester: e.target.value})}
                  >
                    <option value="First">First Semester</option>
                    <option value="Second">Second Semester</option>
                  </select>
                </div>
              </div>
              
              <div className="modal-buttons">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editingCourse ? 'Update Course' : 'Create Course'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Academic Session Modal */}
      {showAcademicModal && (
        <div className="modal-overlay" onClick={() => setShowAcademicModal(false)}>
          <div className="modal academic-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📅 Academic Session Settings</h3>
              <button className="modal-close" onClick={() => setShowAcademicModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Current Academic Session</label>
                <select
                  value={academicSettings.current_session}
                  onChange={(e) => setAcademicSettings({...academicSettings, current_session: e.target.value})}
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
                  value={academicSettings.current_semester}
                  onChange={(e) => setAcademicSettings({...academicSettings, current_semester: e.target.value})}
                >
                  <option>First</option>
                  <option>Second</option>
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Exam Period Start</label>
                  <input
                    type="date"
                    value={academicSettings.exam_period_start?.split('T')[0] || ''}
                    onChange={(e) => setAcademicSettings({...academicSettings, exam_period_start: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>Exam Period End</label>
                  <input
                    type="date"
                    value={academicSettings.exam_period_end?.split('T')[0] || ''}
                    onChange={(e) => setAcademicSettings({...academicSettings, exam_period_end: e.target.value})}
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowAcademicModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={saveAcademicSettings}>Save Settings</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .manage-courses {
          padding: 20px;
        }
        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
          flex-wrap: wrap;
          gap: 15px;
        }
        .section-header h2 {
          margin: 0;
          color: #1a1a2e;
        }
        .header-buttons {
          display: flex;
          gap: 12px;
        }
        .btn-primary {
          background: linear-gradient(135deg, #4F46E5, #4338CA);
          color: white;
          padding: 10px 20px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.3s;
        }
        .btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
        }
        .btn-academic {
          background: #f59e0b;
          color: white;
          padding: 10px 20px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.3s;
        }
        .btn-academic:hover {
          background: #d97706;
          transform: translateY(-1px);
        }
        .btn-edit {
          background: #3b82f6;
          color: white;
          padding: 6px 12px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          margin-right: 8px;
          transition: all 0.2s;
        }
        .btn-edit:hover {
          background: #2563eb;
        }
        .btn-delete {
          background: #ef4444;
          color: white;
          padding: 6px 12px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-delete:hover {
          background: #dc2626;
        }
        .message {
          padding: 12px 16px;
          border-radius: 8px;
          margin-bottom: 20px;
          animation: fadeIn 0.3s ease;
        }
        .message.success {
          background: #d4edda;
          color: #155724;
          border: 1px solid #c3e6cb;
        }
        .message.error {
          background: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .courses-table-container {
          overflow-x: auto;
        }
        .data-table {
          width: 100%;
          border-collapse: collapse;
          background: white;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        .data-table th,
        .data-table td {
          padding: 12px 16px;
          text-align: left;
          border-bottom: 1px solid #e5e7eb;
        }
        .data-table th {
          background: #f9fafb;
          font-weight: 600;
        }
        .data-table tr:hover {
          background: #f9fafb;
        }
        .empty-state {
          text-align: center;
          padding: 60px 20px;
          background: #f9fafb;
          border-radius: 12px;
        }
        .empty-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }
        .empty-state h3 {
          margin: 0 0 8px 0;
          color: #374151;
        }
        .empty-state p {
          margin: 0;
          color: #6b7280;
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
          animation: fadeIn 0.2s ease;
        }
        .modal {
          background: white;
          border-radius: 16px;
          width: 90%;
          max-width: 500px;
          max-height: 90vh;
          overflow-y: auto;
          animation: slideIn 0.3s ease;
        }
        @keyframes slideIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 24px;
          border-bottom: 1px solid #e5e7eb;
        }
        .modal-header h3 {
          margin: 0;
          color: #1a1a2e;
        }
        .modal-close {
          background: none;
          border: none;
          font-size: 28px;
          cursor: pointer;
          color: #6b7280;
          transition: color 0.2s;
        }
        .modal-close:hover {
          color: #ef4444;
        }
        .modal form {
          padding: 20px 24px;
        }
        .form-group {
          margin-bottom: 16px;
        }
        .form-group label {
          display: block;
          margin-bottom: 6px;
          font-weight: 500;
          color: #374151;
        }
        .form-group input,
        .form-group select {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          font-size: 14px;
          transition: border-color 0.2s;
        }
        .form-group input:focus,
        .form-group select:focus {
          outline: none;
          border-color: #4F46E5;
          box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.1);
        }
        .form-group small {
          display: block;
          margin-top: 4px;
          font-size: 11px;
          color: #6b7280;
        }
        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .modal-buttons {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 24px;
        }
        .btn-secondary {
          background: #6b7280;
          color: white;
          padding: 10px 20px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .btn-secondary:hover {
          background: #4b5563;
        }
        .loading-container {
          text-align: center;
          padding: 60px;
        }
        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid #e5e7eb;
          border-top-color: #4F46E5;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 16px;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .academic-modal {
          max-width: 500px;
        }
        @media (max-width: 768px) {
          .manage-courses {
            padding: 15px;
          }
          .form-row {
            grid-template-columns: 1fr;
          }
          .section-header {
            flex-direction: column;
            align-items: flex-start;
          }
          .header-buttons {
            width: 100%;
            flex-direction: column;
          }
          .header-buttons button {
            width: 100%;
          }
          .data-table th,
          .data-table td {
            padding: 8px 12px;
            font-size: 14px;
          }
        }
      `}</style>
    </div>
  );
}