const express = require('express');
const router = express.Router();
const appState = require('../models/appState');
const db = require('../utils/db');
const asyncHandler = require('../middleware/asyncHandler');
const { verifyToken } = require('../middleware/auth');
const { normalizeRegNumber, expireOldSessions } = appState;

router.use('/api/lecturer', (req, res, next) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`📥 [lecturer] ${req.method} ${req.originalUrl} -> path:${req.path}`);
    console.log('    params preview:', Object.keys(req.params).length ? req.params : '(none yet)');
  }
  next();
});

router.use('/api/lecturer', verifyToken);

function ensureLecturerOrAdmin(req, res) {
  if (!req.user || (req.user.role !== 'lecturer' && req.user.role !== 'admin')) {
    res.status(403).json({ error: 'Lecturer or admin access required' });
    return false;
  }
  return true;
}

router.get(/^\/api\/lecturer\/(.+)\/profile$/, asyncHandler(async (req, res) => {
  const regNumber = decodeURIComponent(req.params[0]);
  await appState.read();
  const user = appState.findUserByRegNumber(regNumber);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ name: user.name, reg_number: user.reg_number, phone: user.phone || null, role: user.role, account_created: user.created_at, login_attempts: user.login_attempts || 0 });
}));

router.put(/^\/api\/lecturer\/(.+)\/profile$/, asyncHandler(async (req, res) => {
  const regNumber = decodeURIComponent(req.params[0]);
  const { phone } = req.body;
  await appState.read();
  const userIndex = (appState.state.data.users || []).findIndex(u => normalizeRegNumber(u.reg_number) === normalizeRegNumber(regNumber) && u.role === 'lecturer');
  if (userIndex === -1) return res.status(404).json({ error: 'User not found' });
  if (phone !== undefined) appState.state.data.users[userIndex].phone = phone || null;
  await appState.write();
  res.json({ success: true, message: 'Profile updated successfully' });
}));

router.get(/^\/api\/lecturer\/(.+)\/courses$/, asyncHandler(async (req, res) => {
  const regNumber = decodeURIComponent(req.params[0]);
  await appState.read();
  const user = appState.findUserByRegNumber(regNumber);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json((appState.state.data.courses || []).filter(c => c.lecturer_id === user.id));
}));

router.get(/^\/api\/lecturer\/(.+)\/course\/([^/]+)\/students$/, asyncHandler(async (req, res) => {
  const regNumber = decodeURIComponent(req.params[0]);
  const courseId = req.params[1];
  await appState.read();
  const lecturer = appState.findUserByRegNumber(regNumber);
  if (!lecturer) return res.status(404).json({ error: 'User not found' });
  const enrollments = (appState.state.data.enrollments || []).filter(e => e.course_id === courseId && e.status === 'active');
  const studentIds = enrollments.map(e => e.student_reg_number);
  const students = (appState.state.data.users || []).filter(u => studentIds.includes(u.reg_number) && u.role === 'student');
  const attendanceRecords = (appState.state.data.attendance || []).filter(a => a.course_id === courseId);
  const result = students.map(s => {
    const studentAttendance = attendanceRecords.filter(a => a.reg_number === s.reg_number);
    const totalClasses = [...new Set(attendanceRecords.map(a => a.timestamp.split('T')[0]))].length;
    const presentCount = studentAttendance.length;
    const attendancePercentage = totalClasses > 0 ? (presentCount / totalClasses) * 100 : 0;
    return { id: s.id, name: s.name, reg_number: s.reg_number, total_classes: totalClasses, present_count: presentCount, attendance_percentage: Math.round(attendancePercentage) };
  });
  res.json(result);
}));

router.get(/^\/api\/lecturer\/(.+)\/attendance-report$/, asyncHandler(async (req, res) => {
  const regNumber = decodeURIComponent(req.params[0]);
  const { course_id } = req.query;
  await appState.read();
  const enrollments = (appState.state.data.enrollments || []).filter(e => e.course_id === course_id && e.status === 'active');
  const studentIds = enrollments.map(e => e.student_reg_number);
  const students = (appState.state.data.users || []).filter(u => studentIds.includes(u.reg_number));
  const attendanceRecords = (appState.state.data.attendance || []).filter(a => a.course_id === course_id);
  const totalClasses = [...new Set(attendanceRecords.map(a => a.timestamp.split('T')[0]))].length;
  const records = students.map(s => {
    const studentAttendance = attendanceRecords.filter(a => a.reg_number === s.reg_number);
    const presentCount = studentAttendance.length;
    const percentage = totalClasses > 0 ? (presentCount / totalClasses) * 100 : 0;
    return { student_name: s.name, reg_number: s.reg_number, total_classes: totalClasses, present_count: presentCount, attendance_percentage: Math.round(percentage) };
  });
  const totalPresent = records.reduce((sum, r) => sum + r.present_count, 0);
  const averageAttendance = records.length > 0 ? Math.round(records.reduce((sum, r) => sum + r.attendance_percentage, 0) / records.length) : 0;
  res.json({ summary: { totalStudents: students.length, totalClasses, totalPresent, averageAttendance }, records });
}));

router.post('/api/lecturer/attendance/bulk', async (req, res) => {
  if (!ensureLecturerOrAdmin(req, res)) return;
  const { lecturer_reg_number, course_id, date, location_id, present_students, absent_students } = req.body;
  await appState.read();
  const course = (appState.state.data.courses || []).find(c => c.id === course_id);
  const location = (appState.state.data.geo_locations || []).find(l => l.id === location_id);
  const timestamp = new Date(date).toISOString();
  const allStudents = (appState.state.data.users || []).filter(u => u.role === 'student');

  // find active session from SQL
  const activeSession = db.prepare('SELECT * FROM sessions WHERE course_id = ? AND status = ?').get(course_id, 'active');

  const insertSql = `INSERT INTO attendance (id, session_id, course_id, student_id, reg_number, user_name, status, timestamp, location_id, location_name, latitude, longitude, marked_by, source, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  try {
    db.exec('BEGIN');
    const stmt = db.prepare(insertSql);
    let inserted = 0;

    for (const studentId of present_students || []) {
      const student = allStudents.find(s => s.id === studentId);
      if (!student) continue;
      const id = appState.nanoid();
      const params = [id, activeSession ? activeSession.id : null, course_id || null, studentId || null, student.reg_number || null, student.name || null, 'present', timestamp, location?.id || null, location?.name || null, location?.latitude || null, location?.longitude || null, lecturer_reg_number || null, 'lecturer_marked', JSON.stringify({})];
      stmt.run(...params);
      inserted++;
      // keep appState in sync
      appState.state.data.attendance.push({ id, user_id: student.id, student_id: studentId, reg_number: student.reg_number, course_id, session_id: activeSession ? activeSession.id : null, timestamp, status: 'present', location_name: location?.name, latitude: location?.latitude, longitude: location?.longitude, marked_by: lecturer_reg_number, source: 'lecturer_marked' });
    }

    for (const studentId of absent_students || []) {
      const student = allStudents.find(s => s.id === studentId);
      if (!student) continue;
      const id = appState.nanoid();
      const params = [id, activeSession ? activeSession.id : null, course_id || null, studentId || null, student.reg_number || null, student.name || null, 'absent', timestamp, location?.id || null, location?.name || null, location?.latitude || null, location?.longitude || null, lecturer_reg_number || null, 'lecturer_marked', JSON.stringify({})];
      stmt.run(...params);
      inserted++;
      appState.state.data.attendance.push({ id, user_id: student.id, student_id: studentId, reg_number: student.reg_number, course_id, session_id: activeSession ? activeSession.id : null, timestamp, status: 'absent', location_name: location?.name, latitude: location?.latitude, longitude: location?.longitude, marked_by: lecturer_reg_number, source: 'lecturer_marked' });
    }

    db.exec('COMMIT');
    await appState.write();
    res.json({ success: true, message: `Attendance recorded: ${present_students?.length || 0} present, ${absent_students?.length || 0} absent`, inserted, present_count: present_students?.length || 0, absent_count: absent_students?.length || 0 });
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (e) {}
    console.error('Error saving attendance to SQL:', err);
    return res.status(500).json({ error: 'Failed to save attendance' });
  }
});

router.post('/api/lecturer/courses', async (req, res) => {
  const { code, title, lecturer_reg_number, credits, semester } = req.body;
  if (!code || !title || !lecturer_reg_number) return res.status(400).json({ error: 'Course code, title, and lecturer are required' });
  await appState.read();
  const existingCourse = (appState.state.data.courses || []).find(c => c.code === code.toUpperCase());
  if (existingCourse) return res.status(400).json({ error: 'Course code already exists' });
  const lecturer = appState.findUserByRegNumber(lecturer_reg_number, 'lecturer');
  if (!lecturer) return res.status(404).json({ error: 'Lecturer not found' });
  const newCourse = { id: appState.nanoid(), code: code.toUpperCase(), title, lecturer_id: lecturer.id, credits: credits || 3, semester: semester || 'First', created_by: lecturer_reg_number, created_at: new Date().toISOString() };
  appState.state.data.courses.push(newCourse);
  await appState.write();
  res.status(201).json({ success: true, course: newCourse });
});

router.put('/api/lecturer/courses/:id', async (req, res) => {
  const { id } = req.params;
  const { code, title, credits, semester, lecturer_reg_number } = req.body;
  await appState.read();
  const courseIndex = (appState.state.data.courses || []).findIndex(c => c.id === id);
  if (courseIndex === -1) return res.status(404).json({ error: 'Course not found' });
  const course = appState.state.data.courses[courseIndex];
  const lecturer = appState.findUserByRegNumber(lecturer_reg_number, 'lecturer');
  if (course.lecturer_id !== lecturer?.id) return res.status(403).json({ error: 'You can only edit your own courses' });
  if (code) appState.state.data.courses[courseIndex].code = code.toUpperCase();
  if (title) appState.state.data.courses[courseIndex].title = title;
  if (credits) appState.state.data.courses[courseIndex].credits = credits;
  if (semester) appState.state.data.courses[courseIndex].semester = semester;
  await appState.write();
  res.json({ success: true, message: 'Course updated successfully' });
});

router.delete('/api/lecturer/courses/:id', async (req, res) => {
  const { id } = req.params;
  const { lecturer_reg_number } = req.body;
  await appState.read();
  const courseIndex = (appState.state.data.courses || []).findIndex(c => c.id === id);
  if (courseIndex === -1) return res.status(404).json({ error: 'Course not found' });
  const course = appState.state.data.courses[courseIndex];
  const lecturer = appState.findUserByRegNumber(lecturer_reg_number, 'lecturer');
  if (course.lecturer_id !== lecturer?.id) return res.status(403).json({ error: 'You can only delete your own courses' });
  const hasEnrollments = (appState.state.data.enrollments || []).some(e => e.course_id === id);
  if (hasEnrollments) return res.status(400).json({ error: 'Cannot delete course with existing student enrollments' });
  appState.state.data.courses = (appState.state.data.courses || []).filter(c => c.id !== id);
  await appState.write();
  res.json({ success: true, message: 'Course deleted successfully' });
});

router.post('/api/lecturer/sessions/start', async (req, res) => {
  if (!ensureLecturerOrAdmin(req, res)) return;
  let { course_id, course_code, course_name, lecturer_reg_number, location_id, start_time, duration_minutes } = req.body;
  if (!course_id && !course_code && !course_name) return res.status(400).json({ error: 'Missing required fields: course identifier required' });
  if (!lecturer_reg_number || !location_id) return res.status(400).json({ error: 'Missing required fields' });

  await appState.read();

  // resolve course id when possible
  if (!course_id && (course_code || course_name)) {
    const code = (course_code || course_name || '').toString().trim();
    const found = (appState.state.data.courses || []).find(c => (c.code || '').toLowerCase() === code.toLowerCase())
                || (appState.state.data.courses || []).find(c => (c.title || '').toLowerCase() === code.toLowerCase());
    course_id = found ? found.id : code;
  }

  // prevent duplicate active session for course
  // check SQL-backed sessions first
  const existingActiveSql = db.prepare('SELECT * FROM sessions WHERE course_id = ? AND status = ?').get(course_id, 'active');
  if (existingActiveSql) return res.status(400).json({ error: 'An active session already exists for this course' });

  const startTime = start_time ? new Date(start_time) : new Date();
  const endTime = new Date(startTime.getTime() + (duration_minutes || 30) * 60000);
  const id = appState.nanoid();

  // insert into relational sessions table
  try {
    if (start_time) {
      // use provided start/end times
      db.prepare(`INSERT INTO sessions (id, course_id, course_code, course_title, lecturer_reg_number, location_id, status, start_time, end_time, created_at, metadata) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`)
        .run(id, course_id, course_code || null, course_name || null, lecturer_reg_number, location_id || null, startTime.toISOString(), endTime.toISOString(), new Date().toISOString(), JSON.stringify({}));
    } else {
      // use SQL datetime functions to set start_time and end_time (expires_at)
      db.prepare(`INSERT INTO sessions (id, course_id, course_code, course_title, lecturer_reg_number, location_id, status, start_time, end_time, created_at, metadata) VALUES (?, ?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now', '+1 hour'), ?, ?)`)
        .run(id, course_id, course_code || null, course_name || null, lecturer_reg_number, location_id || null, new Date().toISOString(), JSON.stringify({}));
    }

    const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);

    // keep appState in sync for legacy code paths
    if (!appState.state.data.sessions) appState.state.data.sessions = [];
    appState.state.data.sessions.push(row);
    await appState.write();

    return res.json({ success: true, session: row });
  } catch (err) {
    console.error('Error creating session in DB:', err);
    return res.status(500).json({ error: 'Failed to create session' });
  }
});

router.put('/api/lecturer/sessions/:sessionId/end', async (req, res) => {
  if (!ensureLecturerOrAdmin(req, res)) return;
  const { sessionId } = req.params;
  await appState.read();
  const sessionIndex = (appState.state.data.sessions || []).findIndex(s => s.id === sessionId);
  if (sessionIndex === -1) return res.status(404).json({ error: 'Session not found' });
  appState.state.data.sessions[sessionIndex].status = 'ended';
  appState.state.data.sessions[sessionIndex].ended_at = new Date().toISOString();
  await appState.write();
  res.json({ success: true, message: 'Session ended successfully' });
});

router.get('/api/lecturer/sessions/active', async (req, res) => {
  const { course_id } = req.query;
  if (!course_id) return res.status(400).json({ error: 'course_id required' });
  try {
    // fetch active session from SQL
    const session = db.prepare('SELECT * FROM sessions WHERE course_id = ? AND status = ?').get(course_id, 'active');
    if (!session) return res.json({ active: false, session: null });
    const now = new Date();
    const endTime = new Date(session.end_time);
    if (now > endTime) {
      // mark expired in SQL and appState
      db.prepare('UPDATE sessions SET status = ? WHERE id = ?').run('expired', session.id);
      await appState.read();
      const idx = (appState.state.data.sessions || []).findIndex(s => s.id === session.id);
      if (idx !== -1) {
        appState.state.data.sessions[idx].status = 'expired';
        await appState.write();
      }
      return res.json({ active: false, session: null, expired: true });
    }
    return res.json({ active: true, session });
  } catch (err) {
    console.error('Error fetching active session:', err);
    return res.status(500).json({ error: 'Failed to fetch active session' });
  }
});

router.get('/api/lecturer/sessions/history', async (req, res) => {
  const { course_id } = req.query;
  if (!course_id) return res.status(400).json({ error: 'course_id required' });
  try {
    // get sessions from SQL
    const rows = db.prepare('SELECT * FROM sessions WHERE course_id = ? ORDER BY datetime(start_time) DESC').all(course_id);
    // enrich with attendance counts from SQL
    const sessionsWithCounts = rows.map(r => {
      const countRow = db.prepare('SELECT COUNT(*) as cnt FROM attendance WHERE session_id = ?').get(r.id) || { cnt: 0 };
      return { ...r, attendance_count: countRow.cnt };
    });
    return res.json(sessionsWithCounts);
  } catch (err) {
    console.error('Error fetching session history:', err);
    return res.status(500).json({ error: 'Failed to fetch session history' });
  }
});

router.post('/api/lecturer/send-notification', async (req, res) => {
  const { course_id, session_id, title, message, type } = req.body;
  if (!course_id || !title || !message) return res.status(400).json({ error: 'Missing required fields' });
  await appState.read();
  const enrollments = (appState.state.data.enrollments || []).filter(e => e.course_id === course_id && e.status === 'active');
  const studentRegNumbers = enrollments.map(e => e.student_reg_number);
  if (!appState.state.data.notifications) appState.state.data.notifications = [];
  const notification = { id: appState.nanoid(), course_id, session_id: session_id || null, title, message, type: type || 'class_start', recipient_reg_numbers: studentRegNumbers, created_at: new Date().toISOString(), read_by: [] };
  appState.state.data.notifications.push(notification);
  await appState.write();
  res.json({ success: true, message: `Notification sent to ${studentRegNumbers.length} students`, recipient_count: studentRegNumbers.length });
});

router.get('/api/student/notifications', async (req, res) => {
  const { reg_number } = req.query;
  if (!reg_number) return res.status(400).json({ error: 'Registration number required' });
  await appState.read();
  const notifications = (appState.state.data.notifications || []).filter(n => n.recipient_reg_numbers.includes(reg_number)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(notifications);
});

router.put('/api/student/notifications/:id/read', async (req, res) => {
  const { id } = req.params;
  const { reg_number } = req.body;
  await appState.read();
  const notificationIndex = (appState.state.data.notifications || []).findIndex(n => n.id === id);
  if (notificationIndex === -1) return res.status(404).json({ error: 'Notification not found' });
  if (!appState.state.data.notifications[notificationIndex].read_by.includes(reg_number)) {
    appState.state.data.notifications[notificationIndex].read_by.push(reg_number);
    await appState.write();
  }
  res.json({ success: true });
});

router.post('/api/student/session/join', async (req, res) => {
  const { reg_number, course_id, session_id, location_id, face_verified } = req.body;
  if (!reg_number || !course_id || !session_id) return res.status(400).json({ error: 'Missing required fields' });
  await appState.read();
  const session = (appState.state.data.sessions || []).find(s => s.id === session_id);
  if (!session || session.status !== 'active') return res.status(400).json({ error: 'No active session found' });
  const now = new Date();
  const endTime = new Date(session.end_time);
  if (now > endTime) return res.status(400).json({ error: 'Session has expired. You cannot join now.' });
  const student = (appState.state.data.users || []).find(u => u.reg_number === reg_number);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const existingAttendance = (appState.state.data.attendance || []).find(a => a.session_id === session_id && a.reg_number === reg_number);
  if (existingAttendance) return res.status(400).json({ error: 'Attendance already marked for this session' });
  const attendance = { id: appState.nanoid(), reg_number, student_id: student.id, course_id, session_id, timestamp: now.toISOString(), status: 'present', location_id: location_id || session.location_id, face_verified: face_verified || false, source: 'student_checkin' };
  appState.state.data.attendance.push(attendance);
  await appState.write();
  res.json({ success: true, message: 'Attendance recorded successfully', attendance });
});

module.exports = router;
