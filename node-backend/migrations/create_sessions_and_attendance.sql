PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  course_code TEXT,
  course_title TEXT,
  lecturer_reg_number TEXT NOT NULL,
  location_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  created_at TEXT NOT NULL,
  ended_at TEXT,
  metadata TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_course_id ON sessions(course_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  course_id TEXT,
  student_id TEXT,
  reg_number TEXT,
  user_name TEXT,
  status TEXT NOT NULL DEFAULT 'present',
  timestamp TEXT NOT NULL,
  location_id TEXT,
  location_name TEXT,
  latitude REAL,
  longitude REAL,
  marked_by TEXT,
  face_verified INTEGER DEFAULT 0,
  source TEXT,
  metadata TEXT,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_reg ON attendance(reg_number);
