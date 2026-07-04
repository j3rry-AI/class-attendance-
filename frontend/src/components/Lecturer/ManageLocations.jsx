// src/components/lecturer/ManageLocations.jsx
import React, { useState, useEffect } from 'react';
import apiFetch from '../../utils/api';

export default function ManageLocations({ lecturerId }) {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [activeLocation, setActiveLocation] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    latitude: '',
    longitude: '',
    radius: 100,
    course_id: ''
  });
  const [courses, setCourses] = useState([]);
  const [message, setMessage] = useState(null);

  // Fetch locations and courses
  useEffect(() => {
    fetchLocations();
    fetchCourses();
  }, []);

  const fetchLocations = async () => {
    try {
      const response = await apiFetch('/api/geo-locations');
      if (response.ok) {
        setLocations(response.data);
        const active = response.data.find(loc => loc.is_active === true);
        setActiveLocation(active);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error fetching locations:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCourses = async () => {
    try {
      const response = await apiFetch('/api/courses');
      if (response.ok) {
        setCourses(response.data);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error fetching courses:', error);
    }
  };

  // Get current location from browser
  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFormData({
          ...formData,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
        setMessage({ type: 'success', text: 'Location captured! Adjust radius if needed.' });
      },
      (error) => {
        setMessage({ type: 'error', text: 'Error getting location: ' + error.message });
      }
    );
  };

  // Add new location
  const handleAddLocation = async (e) => {
    e.preventDefault();
    
    if (!formData.name || !formData.latitude || !formData.longitude) {
      setMessage({ type: 'error', text: 'Name and location are required' });
      return;
    }
    
    try {
      const response = await apiFetch('/api/geo-locations', {
        method: 'POST',
        body: {
          name: formData.name,
          latitude: parseFloat(formData.latitude),
          longitude: parseFloat(formData.longitude),
          radius: parseFloat(formData.radius),
          course_id: formData.course_id || null,
          lecturer_id: lecturerId || null
        }
      });
      
      if (response.ok) {
        setMessage({ type: 'success', text: 'Location added successfully!' });
        setShowForm(false);
        setFormData({ name: '', latitude: '', longitude: '', radius: 100, course_id: '' });
        fetchLocations();
      } else {
        setMessage({ type: 'error', text: response.error?.error || response.error || 'Failed to add location' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error' });
    }
  };

  // Activate a location
  const activateLocation = async (locationId) => {
    try {
      const response = await apiFetch(`/api/geo-locations/activate/${locationId}`, {
        method: 'PUT'
      });
      
      if (response.ok) {
        setMessage({ type: 'success', text: 'Location activated! Students can now check in here.' });
        fetchLocations();
      } else {
        setMessage({ type: 'error', text: response.error?.error || response.error || 'Failed to activate location' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error' });
    }
  };

  if (loading) return <div>Loading locations...</div>;

  return (
    <div className="manage-locations">
      <div className="section-header">
        <h2>📍 Manage Class Locations</h2>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Add Location'}
        </button>
      </div>

      {/* Active Location Banner */}
      {activeLocation && (
        <div className="active-location-banner">
          <span className="active-icon">📍</span>
          <div>
            <strong>Currently Active:</strong> {activeLocation.name}
            <br />
            <small>Students can check in within {activeLocation.radius}m of this location</small>
          </div>
        </div>
      )}

      {/* Add Location Form */}
      {showForm && (
        <div className="location-form">
          <h3>Add New Location</h3>
          <form onSubmit={handleAddLocation}>
            <div className="form-group">
              <label>Location Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="e.g., Engineering Lecture Hall A"
                required
              />
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Latitude *</label>
                <input
                  type="number"
                  step="any"
                  value={formData.latitude}
                  onChange={(e) => setFormData({...formData, latitude: e.target.value})}
                  placeholder="e.g., 7.2906"
                  required
                />
              </div>
              <div className="form-group">
                <label>Longitude *</label>
                <input
                  type="number"
                  step="any"
                  value={formData.longitude}
                  onChange={(e) => setFormData({...formData, longitude: e.target.value})}
                  placeholder="e.g., 5.2014"
                  required
                />
              </div>
            </div>
            
            <button type="button" className="btn-secondary" onClick={getCurrentLocation}>
              📍 Use My Current Location
            </button>
            
            <div className="form-group">
              <label>Radius (meters)</label>
              <input
                type="number"
                value={formData.radius}
                onChange={(e) => setFormData({...formData, radius: e.target.value})}
                placeholder="Default: 100m"
              />
              <small>How far from the location can students check in?</small>
            </div>
            
            <div className="form-group">
              <label>Associated Course (Optional)</label>
              <select
                value={formData.course_id}
                onChange={(e) => setFormData({...formData, course_id: e.target.value})}
              >
                <option value="">All Courses</option>
                {courses.map(course => (
                  <option key={course.id} value={course.id}>
                    {course.code} - {course.title}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="form-buttons">
              <button type="submit" className="btn-primary">Save Location</button>
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Message Display */}
      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      {/* Locations List */}
      <div className="locations-list">
        <h3>Saved Locations</h3>
        <div className="locations-grid">
          {locations.length === 0 ? (
            <p>No locations added yet. Click "Add Location" to create one.</p>
          ) : (
            locations.map(location => (
              <div key={location.id} className={`location-card ${location.is_active ? 'active' : ''}`}>
                <div className="location-header">
                  <span className="location-icon">📍</span>
                  <h4>{location.name}</h4>
                  {location.is_active && <span className="active-badge">ACTIVE</span>}
                </div>
                <div className="location-details">
                  <p>Lat: {location.latitude}</p>
                  <p>Lon: {location.longitude}</p>
                  <p>Radius: {location.radius}m</p>
                </div>
                {!location.is_active && (
                  <button 
                    className="btn-activate" 
                    onClick={() => activateLocation(location.id)}
                  >
                    Activate for Class
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <style>{`
        .active-location-banner {
          background: linear-gradient(135deg, #10b981, #059669);
          color: white;
          padding: 15px 20px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          gap: 15px;
          margin-bottom: 20px;
        }
        .active-icon {
          font-size: 32px;
        }
        .location-form {
          background: #f8f9fa;
          padding: 20px;
          border-radius: 12px;
          margin-bottom: 30px;
        }
        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
        }
        .locations-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 20px;
          margin-top: 15px;
        }
        .location-card {
          background: white;
          border-radius: 12px;
          padding: 15px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          border: 2px solid #e0e0e0;
        }
        .location-card.active {
          border-color: #10b981;
          background: #f0fdf4;
        }
        .location-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }
        .location-icon {
          font-size: 24px;
        }
        .active-badge {
          background: #10b981;
          color: white;
          padding: 2px 8px;
          border-radius: 20px;
          font-size: 10px;
          font-weight: bold;
        }
        .btn-activate {
          background: #3b82f6;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 8px;
          cursor: pointer;
          width: 100%;
          margin-top: 10px;
        }
        .btn-secondary {
          background: #6b7280;
          color: white;
          padding: 8px 16px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
        }
        .form-buttons {
          display: flex;
          gap: 10px;
          margin-top: 15px;
        }
        .message {
          padding: 10px;
          border-radius: 8px;
          margin: 15px 0;
        }
        .message.success {
          background: #d4edda;
          color: #155724;
        }
        .message.error {
          background: #f8d7da;
          color: #721c24;
        }
      `}</style>
    </div>
  );
}