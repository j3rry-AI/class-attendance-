const express = require('express');
const multer = require('multer');
const router = express.Router();
const appState = require('../models/appState');
const { verifyToken } = require('../middleware/auth');
const { normalizeRegNumber, analyzeImageLiveness, hashBuffer, hashPassword } = appState;
const upload = multer({ storage: multer.memoryStorage() });

router.get('/api/me', verifyToken, async (req, res) => {
  await appState.read();
  const user = (appState.state.data.users || []).find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, user: { id: user.id, reg_number: user.reg_number, name: user.name, role: user.role, has_face: !!user.face_hash } });
});

router.get('/api/users', async (req, res) => {
  await appState.read();
  const users = (appState.state.data.users || []).map(u => ({ id: u.id, name: u.name, reg_number: u.reg_number, role: u.role, has_face: !!u.face_hash, has_face_descriptor: !!u.face_descriptor }));
  res.json(users);
});

router.get('/api/admin/users', verifyToken, async (req, res) => {
  // Verify admin role
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  
  await appState.read();
  const users = (appState.state.data.users || []).map(u => ({ 
    id: u.id, 
    name: u.name, 
    reg_number: u.reg_number, 
    role: u.role, 
    created_at: u.created_at, 
    has_face: !!u.face_hash, 
    has_face_descriptor: !!u.face_descriptor, 
    face_descriptor_version: u.face_descriptor_version || 0, 
    last_face_update: u.last_face_update || null, 
    login_attempts: u.login_attempts || 0, 
    locked_until: u.locked_until || null 
  }));
  res.json(users);
});

router.post('/api/admin/users', verifyToken, async (req, res) => {
  // Verify admin role
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin privileges required. Only admins can create new users.' });
  }
  
  const { name, reg_number, role, password } = req.body;
  if (!name || !reg_number || !role || !password) {
    return res.status(400).json({ error: 'Missing required fields: name, reg_number, role, password' });
  }
  
  if (!appState.validateRegNumber(reg_number)) {
    return res.status(400).json({ error: 'Invalid registration number format' });
  }
  
  await appState.read();
  const existingUser = (appState.state.data.users || []).find(u => u.reg_number === reg_number);
  if (existingUser) {
    return res.status(400).json({ error: 'User already exists' });
  }
  
  const secret = require('otplib').authenticator.generateSecret();
  const newUser = { 
    id: appState.nanoid(), 
    name, 
    reg_number, 
    role, 
    password_hash: hashPassword(password), 
    mfa_secret: secret, 
    face_hash: null, 
    temp_otp: null, 
    temp_otp_expires: null, 
    login_attempts: 0, 
    locked_until: null, 
    face_descriptor: null, 
    face_descriptor_version: 0, 
    last_face_update: null, 
    created_at: new Date().toISOString() 
  };
  appState.state.data.users.push(newUser);
  await appState.write();
  res.status(201).json({ id: newUser.id, name, reg_number, role, message: 'User created successfully' });
});

router.put('/api/admin/users/:id', verifyToken, async (req, res) => {
  // Verify admin role
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  
  const { id } = req.params;
  const { name, role } = req.body;
  await appState.read();
  const userIndex = (appState.state.data.users || []).findIndex(u => u.id === id);
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (name) appState.state.data.users[userIndex].name = name;
  if (role) appState.state.data.users[userIndex].role = role;
  await appState.write();
  res.json({ message: 'User updated successfully' });
});

router.delete('/api/admin/users/:id', verifyToken, async (req, res) => {
  // Verify admin role
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  
  const { id } = req.params;
  await appState.read();
  const initialLength = appState.state.data.users.length;
  appState.state.data.users = (appState.state.data.users || []).filter(u => u.id !== id);
  if (appState.state.data.users.length === initialLength) {
    return res.status(404).json({ error: 'User not found' });
  }
  await appState.write();
  res.json({ message: 'User deleted successfully' });
});

router.get('/api/users/:regNumber/profile', async (req, res) => {
  const { regNumber } = req.params;
  await appState.read();
  const user = (appState.state.data.users || []).find(u => u.reg_number === regNumber);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ name: user.name, reg_number: user.reg_number, phone: user.phone || null, role: user.role, face_registered: !!user.face_descriptor, face_descriptor_version: user.face_descriptor_version || 0, last_face_update: user.last_face_update || null, account_created: user.created_at, login_attempts: user.login_attempts || 0 });
});

router.put('/api/users/:regNumber/profile', async (req, res) => {
  const { regNumber } = req.params;
  const { phone } = req.body;
  await appState.read();
  const userIndex = (appState.state.data.users || []).findIndex(u => u.reg_number === regNumber);
  if (userIndex === -1) return res.status(404).json({ error: 'User not found' });
  if (phone !== undefined) appState.state.data.users[userIndex].phone = phone || null;
  await appState.write();
  res.json({ success: true, message: 'Profile updated successfully', phone: appState.state.data.users[userIndex].phone });
});

router.get('/api/users/:regNumber/courses', async (req, res) => {
  const { regNumber } = req.params;
  await appState.read();
  const user = (appState.state.data.users || []).find(u => u.reg_number === regNumber);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(appState.state.data.courses || []);
});

router.get('/api/users/:regNumber/my-courses', async (req, res) => {
  const { regNumber } = req.params;
  await appState.read();
  const user = (appState.state.data.users || []).find(u => u.reg_number === regNumber || normalizeRegNumber(u.reg_number) === normalizeRegNumber(regNumber));
  if (!user) return res.status(404).json({ error: 'User not found' });
  const enrollments = (appState.state.data.enrollments || []).filter(e => e.student_reg_number === regNumber && e.status === 'active');
  const courses = enrollments.map(enrollment => {
    const course = (appState.state.data.courses || []).find(c => c.id === enrollment.course_id);
    const lecturer = appState.findUserByIdentifier(course?.lecturer_id);
    return { id: course?.id, code: course?.code, title: course?.title, credits: course?.credits, semester: enrollment.semester, academic_year: enrollment.academic_year, enrolled_date: enrollment.enrolled_date, lecturer_id: course?.lecturer_id, lecturer_name: lecturer?.name || null, lecturer_reg_number: lecturer?.reg_number || null };
  }).filter(c => c.id);
  const totalCredits = courses.reduce((sum, c) => sum + (c.credits || 0), 0);
  res.json({ total_courses: courses.length, total_credits: totalCredits, courses });
});

router.get('/api/users/:regNumber/available-courses', async (req, res) => {
  const { regNumber } = req.params;
  await appState.read();
  const user = (appState.state.data.users || []).find(u => u.reg_number === regNumber || normalizeRegNumber(u.reg_number) === normalizeRegNumber(regNumber));
  if (!user) return res.status(404).json({ error: 'User not found' });
  const activeEnrollments = (appState.state.data.enrollments || []).filter(e => e.student_reg_number === user.reg_number && e.status === 'active');
  const enrolledCourseIds = new Set(activeEnrollments.map(e => String(e.course_id)));
  const availableCourses = (appState.state.data.courses || []).filter(course => !enrolledCourseIds.has(String(course.id))).map(course => {
    const lecturer = appState.findUserByIdentifier(course.lecturer_id);
    return { id: course.id, code: course.code, title: course.title, credits: course.credits, semester: course.semester || 'First', lecturer_id: course.lecturer_id, lecturer_name: lecturer?.name || null, lecturer_reg_number: lecturer?.reg_number || null };
  });
  res.json({ courses: availableCourses });
});

router.post('/api/users/:regNumber/enroll', async (req, res) => {
  const { regNumber } = req.params;
  const { course_id } = req.body;
  if (!course_id) return res.status(400).json({ error: 'Course ID is required' });
  await appState.read();
  const user = (appState.state.data.users || []).find(u => u.reg_number === regNumber || normalizeRegNumber(u.reg_number) === normalizeRegNumber(regNumber));
  if (!user) return res.status(404).json({ error: 'User not found' });
  const course = (appState.state.data.courses || []).find(c => c.id === course_id);
  if (!course) return res.status(404).json({ error: 'Course not found' });
  const existingEnrollment = (appState.state.data.enrollments || []).find(e => e.student_reg_number === user.reg_number && e.course_id === course_id && e.status === 'active');
  if (existingEnrollment) return res.status(400).json({ error: 'Already enrolled in this course' });
  const newEnrollment = { id: appState.nanoid(), student_reg_number: user.reg_number, student_id: user.id, course_id: course.id, semester: course.semester || 'First', academic_year: '2025/2026', enrolled_date: new Date().toISOString(), status: 'active' };
  appState.state.data.enrollments.push(newEnrollment);
  await appState.write();
  res.json({ success: true, enrollment: newEnrollment });
});

router.delete('/api/users/:regNumber/enroll/:courseId', async (req, res) => {
  const { regNumber, courseId } = req.params;
  await appState.read();
  const user = (appState.state.data.users || []).find(u => u.reg_number === regNumber || normalizeRegNumber(u.reg_number) === normalizeRegNumber(regNumber));
  if (!user) return res.status(404).json({ error: 'User not found' });
  const enrollmentIndex = (appState.state.data.enrollments || []).findIndex(e => e.student_reg_number === user.reg_number && e.course_id === courseId && e.status === 'active');
  if (enrollmentIndex === -1) return res.status(404).json({ error: 'Enrollment not found' });
  appState.state.data.enrollments[enrollmentIndex].status = 'dropped';
  appState.state.data.enrollments[enrollmentIndex].dropped_date = new Date().toISOString();
  await appState.write();
  res.json({ success: true, message: 'Dropped from course successfully' });
});

router.post('/api/users/add-face', upload.single('file'), async (req, res) => {
  const { reg_number } = req.body;
  if (!reg_number || !req.file) return res.status(400).json({ error: 'reg_number and file are required' });
  const buf = req.file.buffer;
  const livenessResult = analyzeImageLiveness(buf);
  if (!livenessResult.isLikelyLive) return res.status(400).json({ error: 'Possible photo attack detected. Please use live camera with natural movement.', entropy: livenessResult.entropy });
  if (buf.length < 5000) return res.status(400).json({ error: 'Image too small. Please use live camera.' });
  const face_hash = hashBuffer(buf);
  await appState.read();
  const userIndex = (appState.state.data.users || []).findIndex(u => u.reg_number === reg_number);
  if (userIndex === -1) return res.status(404).json({ error: 'User not found' });
  appState.state.data.users[userIndex].face_hash = face_hash;
  await appState.write();
  res.json({ message: 'Face registered successfully' });
});

router.post('/api/users/register-face', upload.single('file'), async (req, res) => {
  const { reg_number, face_descriptor } = req.body;
  await appState.read();
  const normalizedReg = normalizeRegNumber(String(reg_number || ''));
  const userIndex = (appState.state.data.users || []).findIndex(u => normalizeRegNumber(String(u.reg_number || '')) === normalizedReg);
  if (userIndex === -1) return res.status(404).json({ error: 'User not found' });
  
  // Prioritize face_descriptor from browser-side detection
  if (face_descriptor) {
    let parsed = face_descriptor;
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch (e) { parsed = null; }
    }
    if (!Array.isArray(parsed) || parsed.length !== 128) return res.status(400).json({ error: 'Invalid face descriptor format' });
    
    // Validate liveness from image if provided
    if (req.file && req.file.buffer) {
      const buf = req.file.buffer;
      const livenessResult = analyzeImageLiveness(buf);
      if (!livenessResult.isLikelyLive) return res.status(400).json({ error: 'Possible photo attack detected', entropy: livenessResult.entropy });
      if (buf.length < 5000) return res.status(400).json({ error: 'Image too small. Please use live camera.' });
    }
    
    appState.state.data.users[userIndex].face_descriptor = parsed;
    appState.state.data.users[userIndex].face_descriptor_version = (appState.state.data.users[userIndex].face_descriptor_version || 0) + 1;
    appState.state.data.users[userIndex].last_face_update = new Date().toISOString();
    await appState.write();
    return res.json({ success: true, message: 'Face descriptor stored', descriptor_version: appState.state.data.users[userIndex].face_descriptor_version });
  }
  
  // Fallback: if only image is provided (legacy), reject and ask for face_descriptor
  if (req.file && req.file.buffer) {
    return res.status(400).json({ error: 'Please provide face_descriptor from browser-side face detection. Legacy image-based registration is no longer supported.' });
  }
  
  return res.status(400).json({ error: 'Please provide a `face_descriptor` payload (array of 128 values)' });
});

router.get('/api/users/:reg_number/face-descriptor', async (req, res) => {
  const { reg_number } = req.params;
  await appState.read();
  const user = (appState.state.data.users || []).find(u => u.reg_number === reg_number);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!user.face_descriptor) return res.status(404).json({ error: 'Face not registered for this user' });
  res.json({ face_descriptor: user.face_descriptor, descriptor_version: user.face_descriptor_version || 1, last_updated: user.last_face_update });
});

router.delete('/api/users/:reg_number/face-descriptor', async (req, res) => {
  const { reg_number } = req.params;
  await appState.read();
  const userIndex = (appState.state.data.users || []).findIndex(u => u.reg_number === reg_number);
  if (userIndex === -1) return res.status(404).json({ error: 'User not found' });
  appState.state.data.users[userIndex].face_descriptor = null;
  await appState.write();
  res.json({ success: true, message: 'Face descriptor removed' });
});

module.exports = router;
