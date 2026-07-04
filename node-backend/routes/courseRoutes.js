const express = require('express');
const router = express.Router();
const appState = require('../models/appState');

router.get('/api/courses', async (req, res) => {
  await appState.read();
  res.json(appState.state.data.courses || []);
});

router.get('/api/courses/:id', async (req, res) => {
  const { id } = req.params;
  await appState.read();
  const course = (appState.state.data.courses || []).find(c => c.id === id);
  if (!course) return res.status(404).json({ error: 'Course not found' });
  res.json(course);
});

router.post('/api/courses', async (req, res) => {
  const { code, title, lecturer_id, credits, semester } = req.body;
  if (!code || !title) return res.status(400).json({ error: 'Course code and title are required' });
  await appState.read();
  const existingCourse = (appState.state.data.courses || []).find(c => c.code === code);
  if (existingCourse) return res.status(400).json({ error: 'Course code already exists' });
  const newCourse = { id: appState.nanoid(), code: code.toUpperCase(), title, lecturer_id: lecturer_id || null, credits: credits || 3, semester: semester || 'First', created_at: new Date().toISOString() };
  appState.state.data.courses.push(newCourse);
  await appState.write();
  res.status(201).json(newCourse);
});

router.put('/api/courses/:id', async (req, res) => {
  const { id } = req.params;
  const { code, title, lecturer_id, credits, semester } = req.body;
  await appState.read();
  const courseIndex = (appState.state.data.courses || []).findIndex(c => c.id === id);
  if (courseIndex === -1) return res.status(404).json({ error: 'Course not found' });
  if (code) appState.state.data.courses[courseIndex].code = code.toUpperCase();
  if (title) appState.state.data.courses[courseIndex].title = title;
  if (lecturer_id !== undefined) appState.state.data.courses[courseIndex].lecturer_id = lecturer_id;
  if (credits) appState.state.data.courses[courseIndex].credits = credits;
  if (semester) appState.state.data.courses[courseIndex].semester = semester;
  await appState.write();
  res.json({ message: 'Course updated successfully', course: appState.state.data.courses[courseIndex] });
});

router.delete('/api/courses/:id', async (req, res) => {
  const { id } = req.params;
  await appState.read();
  const initialLength = appState.state.data.courses.length;
  appState.state.data.courses = (appState.state.data.courses || []).filter(c => c.id !== id);
  if (appState.state.data.courses.length === initialLength) return res.status(404).json({ error: 'Course not found' });
  await appState.write();
  res.json({ message: 'Course deleted successfully' });
});

module.exports = router;
