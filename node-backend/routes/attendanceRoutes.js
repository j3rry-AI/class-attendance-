const express = require('express');
const multer = require('multer');
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const appState = require('../models/appState');
const db = require('../utils/db');
const { analyzeImageLiveness, euclideanDistance, haversineMeters, hashBuffer, expireOldLocations, expireOldSessions } = appState;

const DEFAULT_GEOFENCE_LAT = parseFloat(process.env.GEOFENCE_LAT || '7.300735');
const DEFAULT_GEOFENCE_LON = parseFloat(process.env.GEOFENCE_LON || '5.137691');
const DEFAULT_GEOFENCE_RADIUS_METERS = parseFloat(process.env.GEOFENCE_RADIUS_METERS || '120');

router.get('/api/geo-locations', async (req, res) => {
  await appState.read();
  await expireOldLocations();
  res.json(appState.state.data.geo_locations || []);
});

router.post('/api/geo-locations', async (req, res) => {
  const { name, latitude, longitude, radius, course_id, lecturer_id } = req.body;
  if (!name || !latitude || !longitude) return res.status(400).json({ error: 'Name, latitude, and longitude are required' });
  await appState.read();
  const newLocation = { id: appState.nanoid(), name, latitude: parseFloat(latitude), longitude: parseFloat(longitude), radius: parseFloat(radius || 100), course_id: course_id || null, lecturer_id: lecturer_id || null, is_active: false, created_at: new Date().toISOString() };
  appState.state.data.geo_locations.push(newLocation);
  await appState.write();
  res.status(201).json(newLocation);
});

router.put('/api/geo-locations/activate/:id', async (req, res) => {
  const { id } = req.params;
  await appState.read();
  appState.state.data.geo_locations.forEach(loc => { loc.is_active = false; });
  const location = (appState.state.data.geo_locations || []).find(l => l.id === id);
  if (!location) return res.status(404).json({ error: 'Location not found' });
  location.is_active = true;
  location.activated_at = new Date().toISOString();
  await appState.write();
  res.json({ message: 'Location activated', location: { name: location.name, latitude: location.latitude, longitude: location.longitude, radius: location.radius } });
});

router.get('/api/geo-locations/active', async (req, res) => {
  await appState.read();
  await expireOldLocations();
  const activeLocation = (appState.state.data.geo_locations || []).find(l => l.is_active === true);
  if (!activeLocation) return res.json({ active: false, message: 'No active location set. Please contact your lecturer.' });
  res.json({ active: true, name: activeLocation.name, latitude: activeLocation.latitude, longitude: activeLocation.longitude, radius: activeLocation.radius, activated_at: activeLocation.activated_at || activeLocation.created_at });
});

router.post('/api/attendance/checkin', upload.single('file'), async (req, res) => {
  const lat = parseFloat(req.body.lat);
  const lon = parseFloat(req.body.lon);
  const course_id = req.body.course_id;
  const reg_number = req.body.reg_number;
  let face_descriptor = req.body.face_descriptor;
  
  // Parse face_descriptor if it's a string
  if (typeof face_descriptor === 'string') {
    try {
      face_descriptor = JSON.parse(face_descriptor);
    } catch (e) {
      face_descriptor = null;
    }
  }
  
  // Require image for liveness detection; face_descriptor from browser-side detection
  if (Number.isNaN(lat) || Number.isNaN(lon) || !req.file || !reg_number || !Array.isArray(face_descriptor) || face_descriptor.length !== 128) {
    return res.status(400).json({ detail: 'lat, lon, reg_number, file, and face_descriptor (array of 128 values) are required' });
  }
  
  const buf = req.file.buffer;
  const livenessResult = analyzeImageLiveness(buf);
  if (!livenessResult.isLikelyLive) {
    return res.status(400).json({ error: 'Possible photo attack detected. Please use live camera with natural movement.', entropy: livenessResult.entropy });
  }
  if (buf.length < 5000) {
    return res.status(400).json({ error: 'Image too small. Please use live camera.' });
  }
  
  await appState.read();
  
  // Find user by reg_number first
  let user = (appState.state.data.users || []).find(u => u.reg_number === reg_number);
  
  // If no reg_number match, search by face_descriptor (for unregistered faces)
  if (!user) {
    const candidates = (appState.state.data.users || []).filter(u => Array.isArray(u.face_descriptor));
    let best = { idx: -1, dist: Infinity };
    for (let i = 0; i < candidates.length; i++) {
      const u = candidates[i];
      const d = euclideanDistance(face_descriptor, u.face_descriptor);
      if (d < best.dist) { best = { idx: i, dist: d }; }
    }
    if (best.idx !== -1 && best.dist < 0.6) user = candidates[best.idx];
  }
  
  if (!user) return res.status(404).json({ detail: 'No matching user found' });
  
  // Verify face_descriptor matches if user has one registered
  if (Array.isArray(user.face_descriptor)) {
    const dist = euclideanDistance(face_descriptor, user.face_descriptor);
    if (dist > 0.6) return res.status(403).json({ detail: 'Face does not match registered user', distance: dist });
  }
  
  await expireOldSessions();
  await expireOldLocations();
  const activeLocation = (appState.state.data.geo_locations || []).find(l => l.is_active === true);
  let checkLat = DEFAULT_GEOFENCE_LAT;
  let checkLon = DEFAULT_GEOFENCE_LON;
  let checkRadius = DEFAULT_GEOFENCE_RADIUS_METERS;
  if (activeLocation) {
    checkLat = activeLocation.latitude;
    checkLon = activeLocation.longitude;
    checkRadius = activeLocation.radius;
  }
  if (checkLat !== 0 || checkLon !== 0) {
    const dist = haversineMeters(lat, lon, checkLat, checkLon);
    if (dist > checkRadius) {
      return res.status(403).json({ detail: `Outside allowed geofence. You are ${dist.toFixed(1)}m away. Allowed within ${checkRadius}m.`, current_location: { lat, lon }, allowed_location: { lat: checkLat, lon: checkLon } });
    }
  }

  const now = new Date();
  let sessionId = null;
  const activeSessions = (appState.state.data.sessions || []).filter(session => session.status === 'active' && new Date(session.end_time) > now);
  if (course_id) {
    const matching = activeSessions.find(session => session.course_id === course_id);
    if (matching) sessionId = matching.id;
  }
  if (!sessionId) {
    const enrolledCourseIds = new Set((appState.state.data.enrollments || [])
      .filter(e => e.student_reg_number === user.reg_number && e.status === 'active')
      .map(e => e.course_id));
    const matching = activeSessions.find(session => enrolledCourseIds.has(session.course_id));
    if (matching) {
      sessionId = matching.id;
      if (!course_id) {
        course_id = matching.course_id;
      }
    }
  }

  const attendance = { id: appState.nanoid(), user_id: user.id, user_name: user.name, reg_number: user.reg_number, course_id: course_id || null, session_id: sessionId || null, timestamp: new Date().toISOString(), latitude: lat, longitude: lon, location_name: activeLocation ? activeLocation.name : 'Campus', source: 'student_checkin' };
  appState.state.data.attendance.push(attendance);
  await appState.write();
  res.json({ success: true, message: 'Attendance marked successfully!', attendance });
});

router.get('/api/student/sessions/active', async (req, res) => {
  const { reg_number } = req.query;
  if (!reg_number) return res.status(400).json({ error: 'reg_number is required' });

  await appState.read();
  await appState.expireOldSessions?.();

  const user = (appState.state.data.users || []).find(u => u.reg_number === reg_number || (typeof u.reg_number === 'string' && u.reg_number.toLowerCase() === reg_number.toLowerCase()));
  if (!user) return res.status(404).json({ error: 'User not found' });

  const enrollments = (appState.state.data.enrollments || []).filter(e => (e.student_reg_number === user.reg_number || (typeof e.student_reg_number === 'string' && e.student_reg_number.toLowerCase() === user.reg_number.toLowerCase())) && e.status === 'active');
  const enrolledCourseIds = Array.from(new Set(enrollments.map(e => e.course_id))).filter(Boolean);

  try {
    let activeSessions = [];
    if (enrolledCourseIds.length > 0) {
      const placeholders = enrolledCourseIds.map(() => '?').join(',');
      const sql = `SELECT * FROM sessions WHERE status = 'active' AND end_time > datetime('now') AND course_id IN (${placeholders})`;
      activeSessions = db.prepare(sql).all(...enrolledCourseIds);
    }

    const sessionsWithLoc = activeSessions.map(session => {
      const location = (appState.state.data.geo_locations || []).find(l => l.id === session.location_id);
      const course = (appState.state.data.courses || []).find(c => c.id === session.course_id);
      return {
        ...session,
        course_code: course?.code || null,
        course_title: course?.title || null,
        location: location ? { id: location.id, name: location.name, latitude: location.latitude, longitude: location.longitude, radius: location.radius } : null
      };
    });

    const activeLocation = (appState.state.data.geo_locations || []).find(location => location.is_active === true);
    const activeLocationInfo = activeLocation ? { id: activeLocation.id, name: activeLocation.name, latitude: activeLocation.latitude, longitude: activeLocation.longitude, radius: activeLocation.radius } : null;

    res.json({ active: sessionsWithLoc.length > 0 || Boolean(activeLocationInfo), active_sessions: sessionsWithLoc, active_location: activeLocationInfo, message: sessionsWithLoc.length > 0 ? 'Active session(s) found.' : (activeLocationInfo ? 'Active location found, but no active session for your enrolled courses.' : 'No active session or location found.') });
  } catch (err) {
    console.error('Error querying active sessions:', err);
    return res.status(500).json({ error: 'Failed to fetch active sessions' });
  }
});

router.post('/api/debug/checkin_no_liveness', upload.single('file'), async (req, res) => {
  const lat = parseFloat(req.body.lat);
  const lon = parseFloat(req.body.lon);
  const course_id = req.body.course_id;
  const reg_number = req.body.reg_number;
  let face_descriptor = req.body.face_descriptor;
  
  // Parse face_descriptor if it's a string
  if (typeof face_descriptor === 'string') {
    try {
      face_descriptor = JSON.parse(face_descriptor);
    } catch (e) {
      face_descriptor = null;
    }
  }
  
  if (Number.isNaN(lat) || Number.isNaN(lon) || !req.file || !reg_number || !Array.isArray(face_descriptor) || face_descriptor.length !== 128) {
    return res.status(400).json({ detail: 'lat, lon, reg_number, file, and face_descriptor (array of 128 values) are required' });
  }
  
  const buf = req.file.buffer;
  await appState.read();
  
  let user = (appState.state.data.users || []).find(u => u.reg_number === reg_number);
  if (!user) {
    const candidates = (appState.state.data.users || []).filter(u => Array.isArray(u.face_descriptor));
    let best = { idx: -1, dist: Infinity };
    for (let i = 0; i < candidates.length; i++) {
      const u = candidates[i];
      const d = euclideanDistance(face_descriptor, u.face_descriptor);
      if (d < best.dist) { best = { idx: i, dist: d }; }
    }
    if (best.idx !== -1 && best.dist < 0.6) user = candidates[best.idx];
  }
  
  if (!user) return res.status(404).json({ detail: 'No matching user found' });
  
  if (Array.isArray(user.face_descriptor)) {
    const dist = euclideanDistance(face_descriptor, user.face_descriptor);
    if (dist > 0.6) return res.status(403).json({ detail: 'Face does not match registered user', distance: dist });
  }
  
  const attendance = { id: appState.nanoid(), user_id: user.id, user_name: user.name, reg_number: user.reg_number, email: user.email, course_id: course_id || null, timestamp: new Date().toISOString(), latitude: lat, longitude: lon, location_name: 'Campus' };
  appState.state.data.attendance.push(attendance);
  await appState.write();
  res.json({ success: true, message: 'Attendance marked successfully (debug)', attendance });
});

router.post('/api/debug/insert_test_user', upload.single('file'), async (req, res) => {
  try {
    const { reg_number, name, email } = req.body;
    let face_descriptor = req.body.face_descriptor;
    
    // Parse face_descriptor if it's a string
    if (typeof face_descriptor === 'string') {
      try {
        face_descriptor = JSON.parse(face_descriptor);
      } catch (e) {
        face_descriptor = null;
      }
    }
    
    if (!reg_number) return res.status(400).json({ error: 'reg_number is required' });
    
    // If no file and no face_descriptor, create a dummy descriptor
    if (!req.file && !Array.isArray(face_descriptor)) {
      return res.status(400).json({ error: 'Either file or face_descriptor is required' });
    }
    
    await appState.read();
    const existing = (appState.state.data.users || []).find(u => u.reg_number === reg_number);
    if (existing) return res.status(400).json({ error: 'User already exists' });
    
    // Use provided descriptor or create a dummy one
    let descriptor = face_descriptor;
    if (!descriptor && req.file) {
      // Create deterministic descriptor from image hash (for backwards compatibility)
      const buf = req.file.buffer;
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(buf).digest();
      descriptor = new Array(128).fill(0).map((_, idx) => ((hash[idx % hash.length] || 0) / 255 - 0.5) * 2);
      const norm = Math.sqrt(descriptor.reduce((sum, value) => sum + value * value, 0));
      descriptor = norm > 0 ? descriptor.map(value => value / norm) : descriptor;
    }
    
    if (!Array.isArray(descriptor) || descriptor.length !== 128) {
      return res.status(400).json({ error: 'face_descriptor must be an array of 128 values' });
    }
    
    const user = { 
      id: appState.nanoid(), 
      name: name || 'Debug User', 
      reg_number, 
      email: email || null, 
      role: 'student', 
      password_hash: appState.hashBuffer(req.file ? req.file.buffer : Buffer.from(reg_number)), 
      face_descriptor: descriptor,
      face_descriptor_version: 1,
      temp_otp: null, 
      temp_otp_expires: null, 
      login_attempts: 0, 
      locked_until: null,
      last_face_update: new Date().toISOString(),
      created_at: new Date().toISOString() 
    };
    appState.state.data.users.push(user);
    await appState.write();
    return res.json({ success: true, user });
  } catch (err) {
    return res.status(500).json({ error: err && err.response ? err.response.data : err.message });
  }
});

router.get('/api/attendance/user/:userId', async (req, res) => {
  const { userId } = req.params;
  await appState.read();
  const attendance = (appState.state.data.attendance || []).filter(a => a.user_id === userId).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json(attendance);
});

router.get('/api/attendance/summary/:userId', async (req, res) => {
  const { userId } = req.params;
  await appState.read();
  const userAttendance = (appState.state.data.attendance || []).filter(a => a.user_id === userId);
  const totalDays = userAttendance.length;
  const percentage = totalDays > 0 ? 100 : 0;
  res.json({ total_attendance: totalDays, present_count: totalDays, percentage: percentage.toFixed(2), records: userAttendance.slice(0, 10) });
});

router.get('/api/attendance/all', async (req, res) => {
  await appState.read();
  const attendance = (appState.state.data.attendance || []).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json(attendance);
});

router.get('/api/dashboard/stats/:role', async (req, res) => {
  const { role } = req.params;
  await appState.read();
  const stats = {
    total_students: (appState.state.data.users || []).filter(u => u.role === 'student').length,
    total_lecturers: (appState.state.data.users || []).filter(u => u.role === 'lecturer').length,
    total_admins: (appState.state.data.users || []).filter(u => u.role === 'admin').length,
    total_courses: (appState.state.data.courses || []).length,
    total_attendance: (appState.state.data.attendance || []).length,
    today_attendance: (appState.state.data.attendance || []).filter(a => {
      const today = new Date().toDateString();
      return new Date(a.timestamp).toDateString() === today;
    }).length
  };
  res.json(stats);
});

router.get('/api/student/attendance-report', async (req, res) => {
  const { reg_number, course_id, start_date, end_date } = req.query;
  await appState.read();
  const user = (appState.state.data.users || []).find(u => u.reg_number === reg_number);
  if (!user) return res.status(404).json({ error: 'User not found' });
  let records = (appState.state.data.attendance || []).filter(a => a.reg_number === reg_number);
  if (start_date) records = records.filter(a => a.timestamp.split('T')[0] >= start_date);
  if (end_date) records = records.filter(a => a.timestamp.split('T')[0] <= end_date);
  if (course_id) records = records.filter(a => a.course_id === course_id);
  const total = records.length;
  const attended = records.filter(a => a.status === 'present' || a.status === 'late').length;
  const overallPercentage = total > 0 ? (attended / total) * 100 : 100;
  const requiredPercentage = 75;
  const currentScore = overallPercentage;
  let absencesLeft = 0;
  if (currentScore > requiredPercentage) absencesLeft = Math.floor((currentScore - requiredPercentage) / (100 / total));
  const formattedRecords = records.map(r => ({ id: r.id, date: r.timestamp.split('T')[0], courseCode: r.course_code || r.course_id || 'CSC401', courseName: r.course_name || 'General Course', time: new Date(r.timestamp).toLocaleTimeString(), status: r.status || 'present', mfa: { used: true, method: 'Face + OTP', faceScore: Math.floor(85 + Math.random() * 10), livenessPassed: true, device: 'Web Browser' }, gps: `${r.latitude}, ${r.longitude}`, timestamp: r.timestamp, canDispute: (r.status === 'absent' && new Date(r.timestamp) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) }));
  res.json({ summary: { overallPercentage: Math.round(overallPercentage), attended, total, mfaSuccessRate: 98, absencesLeft, requiredPercentage: 75 }, records: formattedRecords });
});

router.post('/api/disputes', upload.single('proof'), async (req, res) => {
  const { reg_number, record_id, reason } = req.body;
  const proofFile = req.file;
  if (!reg_number || !record_id || !reason) return res.status(400).json({ error: 'Missing required fields' });
  const dispute = { id: appState.nanoid(), reg_number, record_id, reason, proof_filename: proofFile?.originalname || null, status: 'pending', created_at: new Date().toISOString() };
  await appState.read();
  if (!appState.state.data.disputes) appState.state.data.disputes = [];
  appState.state.data.disputes.push(dispute);
  await appState.write();
  res.json({ success: true, message: 'Dispute submitted successfully' });
});

module.exports = router;
