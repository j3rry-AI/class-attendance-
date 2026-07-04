// src/components/admin/BulkUserImport.jsx
import React, { useState } from 'react';

export default function BulkUserImport({ onComplete }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [results, setResults] = useState(null);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setMessage(null);
    setResults(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!file) {
      setMessage({ type: 'error', text: 'Please select a CSV file' });
      return;
    }
    
    if (!file.name.endsWith('.csv')) {
      setMessage({ type: 'error', text: 'Please upload a CSV file' });
      return;
    }
    
    setLoading(true);
    setMessage(null);
    
    const token = window.localStorage.getItem('token');
    if (!token) {
      setMessage({ type: 'error', text: 'Not authenticated. Please login first.' });
      setLoading(false);
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await fetch('http://localhost:3000/api/admin/bulk-import', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setResults(data);
        setMessage({ type: 'success', text: `✅ ${data.created} users created successfully!` });
        if (onComplete) setTimeout(() => onComplete(), 2000);
      } else {
        setMessage({ type: 'error', text: data.error || 'Import failed' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    const csvTemplate = `name,reg_number,role,password
John Doe,2024CS001,student,password123
Jane Smith,2024CS002,student,password123
Dr. Brown,LEC001,lecturer,password123`;
    
    const blob = new Blob([csvTemplate], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'user_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bulk-import-container">
      <div className="import-header">
        <h2>📤 Bulk User Import</h2>
        <p>Upload a CSV file to create multiple users at once</p>
      </div>

      <div className="template-section">
        <button className="btn-template" onClick={downloadTemplate}>
          📥 Download CSV Template
        </button>
        <div className="template-info">
          <strong>CSV Format:</strong>
          <code>name,reg_number,role,password</code>
          <ul>
            <li><strong>role</strong>: student, lecturer, or admin</li>
            <li><strong>password</strong>: temporary password (user can change later)</li>
          </ul>
        </div>
      </div>

      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="upload-form">
        <div className="file-input-area">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="file-input"
            id="csv-file"
          />
          <label htmlFor="csv-file" className="file-label">
            {file ? file.name : 'Choose CSV file'}
          </label>
        </div>
        
        <button type="submit" disabled={loading || !file} className="btn-import">
          {loading ? '⏳ Importing...' : '📤 Import Users'}
        </button>
      </form>

      {results && results.errors && results.errors.length > 0 && (
        <div className="errors-section">
          <h4>⚠️ Import Errors ({results.errors.length})</h4>
          <ul>
            {results.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <style>{`
        .bulk-import-container {
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }
        .import-header {
          margin-bottom: 24px;
        }
        .import-header h2 {
          margin: 0 0 8px 0;
          color: #1a1a2e;
          font-size: 1.8rem;
        }
        .import-header p {
          margin: 0;
          color: #6b7280;
        }
        .template-section {
          background: #f0fdf4;
          border: 1px solid #d1fae5;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 24px;
        }
        .btn-template {
          background: #10b981;
          color: white;
          padding: 10px 20px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
          margin-bottom: 16px;
        }
        .template-info {
          font-size: 14px;
          color: #065f46;
        }
        .template-info code {
          display: inline-block;
          background: #d1fae5;
          padding: 4px 8px;
          border-radius: 4px;
          margin: 8px 0;
          font-family: monospace;
        }
        .template-info ul {
          margin: 8px 0 0 20px;
        }
        .message {
          padding: 12px 16px;
          border-radius: 8px;
          margin-bottom: 20px;
        }
        .message.success {
          background: #d4edda;
          color: #155724;
        }
        .message.error {
          background: #f8d7da;
          color: #721c24;
        }
        .upload-form {
          display: flex;
          gap: 16px;
          align-items: flex-start;
          flex-wrap: wrap;
          margin-bottom: 24px;
        }
        .file-input-area {
          flex: 1;
        }
        .file-input {
          display: none;
        }
        .file-label {
          display: block;
          padding: 12px 16px;
          background: #f9fafb;
          border: 2px dashed #e5e7eb;
          border-radius: 8px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
        }
        .file-label:hover {
          border-color: #4F46E5;
          background: #f3f4f6;
        }
        .btn-import {
          padding: 12px 24px;
          background: linear-gradient(135deg, #4F46E5, #4338CA);
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
        }
        .btn-import:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }
        .errors-section {
          background: #fef2f2;
          border-radius: 12px;
          padding: 16px;
          margin-top: 20px;
        }
        .errors-section h4 {
          margin: 0 0 12px 0;
          color: #991b1b;
        }
        .errors-section ul {
          margin: 0;
          padding-left: 20px;
          color: #991b1b;
        }
      `}</style>
    </div>
  );
}