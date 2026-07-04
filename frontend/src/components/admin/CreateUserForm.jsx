// src/components/admin/CreateUserForm.jsx
import React, { useState } from 'react';

export default function CreateUserForm({ onUserCreated }) {
  const [formData, setFormData] = useState({
    name: '',
    reg_number: '',
    role: 'student',
    password: '',
    title: 'Dr',
    department: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const buildLecturerRegNumber = ({ title, name, department }) => {
    const safeName = name.trim().replace(/\s+/g, '-').replace(/[^A-Za-z\-]/g, '');
    const safeDept = department.trim().replace(/\s+/g, '-').replace(/[^A-Za-z\-]/g, '');
    if (!title || !safeName || !safeDept) return '';
    return `FUTA/STAFF/${title}/${safeName}/${safeDept}`;
  };

  const lecturerRegNumber = buildLecturerRegNumber(formData);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const token = window.localStorage.getItem('token');
      if (!token) {
        setMessage({ type: 'error', text: 'Not authenticated. Please login first.' });
        setLoading(false);
        return;
      }

      const reg_number = formData.role === 'lecturer' ? lecturerRegNumber : formData.reg_number.trim();
      if (!reg_number) {
        setMessage({ type: 'error', text: 'Registration number is required.' });
        setLoading(false);
        return;
      }

      // Client-side validation to match server-side patterns for lecturer IDs
      if (formData.role === 'lecturer') {
        const lecturerPattern = /^FUTA\/STAFF\/(Dr|Professor|Prof|Mr|Mrs|Ms)\/[A-Za-z\-]+\/[A-Za-z\-\s]+$/i;
        if (!lecturerPattern.test(reg_number)) {
          setMessage({ type: 'error', text: 'Invalid lecturer ID format. Use: FUTA/STAFF/Dr/First-Last/Department' });
          setLoading(false);
          return;
        }
      }

      const response = await fetch('http://localhost:3000/api/admin/register-simple', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: formData.name,
          reg_number,
          role: formData.role,
          password: formData.password
        })
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({ type: 'success', text: `User ${formData.name} created successfully!` });
        setFormData({ name: '', reg_number: '', role: 'student', password: '', title: 'Dr', department: '' });
        if (onUserCreated) onUserCreated(data);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to create user' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error. Is the backend running?' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="create-user-form">
      <h3>Create New User</h3>
      
      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Full Name *</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({...formData, name: e.target.value})}
            placeholder="John Doe"
            required
          />
        </div>
        
        <div className="form-group">
          <label>Role *</label>
          <select
            value={formData.role}
            onChange={(e) => setFormData({...formData, role: e.target.value})}
          >
            <option value="student">Student</option>
            <option value="lecturer">Lecturer</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        {formData.role === 'lecturer' ? (
          <>
            <div className="form-group">
              <label>Title *</label>
              <select
                value={formData.title}
                onChange={(e) => setFormData({...formData, title: e.target.value})}
              >
                <option value="Dr">Dr</option>
                <option value="Professor">Professor</option>
                <option value="Prof">Prof</option>
                <option value="Mr">Mr</option>
                <option value="Mrs">Mrs</option>
                <option value="Ms">Ms</option>
              </select>
            </div>

            <div className="form-group">
              <label>Department *</label>
              <input
                type="text"
                value={formData.department}
                onChange={(e) => setFormData({...formData, department: e.target.value})}
                placeholder="Computer-Science"
                required
              />
            </div>

            <div className="form-group">
              <label>Lecturer ID</label>
              <input
                type="text"
                value={lecturerRegNumber}
                disabled
                placeholder="FUTA/STAFF/Dr/John-Doe/Computer-Science"
              />
            </div>
          </>
        ) : (
          <>
            <div className="form-group">
              <label>Registration Number *</label>
              <input
                type="text"
                value={formData.reg_number}
                onChange={(e) => setFormData({...formData, reg_number: e.target.value})}
                placeholder="e.g., 2024CS001 or IFS/20/4998"
                required
              />
            </div>
          </>
        )}


        <div className="form-group">
          <label>Temporary Password *</label>
          <input
            type="password"
            value={formData.password}
            onChange={(e) => setFormData({...formData, password: e.target.value})}
            placeholder="Enter temporary password"
            required
          />
        </div>
        
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Creating...' : 'Create User'}
        </button>
      </form>
    </div>
  );
}