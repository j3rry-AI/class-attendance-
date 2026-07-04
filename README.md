# Class Attendance System

A comprehensive full-stack attendance management platform designed for educational institutions, enabling lecturers to manage class sessions and students to check in with face-based verification.

##  Overview

The Class Attendance System streamlines the attendance tracking process in educational settings by combining modern web technologies with secure face recognition. Lecturers can start class sessions and mark attendance, while students can check in using their registered face data. All data is persisted in SQLite with a clean, intuitive UI built on React.

##  Key Features

- **Lecturer Dashboard**
  - Start and manage class sessions with automatic 30-minute session windows
  - Bulk mark attendance for enrolled students
  - View session history and attendance reports
  - Send notifications to students
  - Real-time countdown timer for active sessions

- **Student Interface**
  - Face registration for secure check-in
  - Real-time discovery of active class sessions
  - One-click check-in with face verification
  - View attendance history and reports
  - Location-based geofencing support

- **Database & Persistence**
  - SQLite-backed storage for sessions and attendance records
  - Automatic session expiry after 1 hour
  - Transaction-safe bulk operations
  - Synced legacy appState for backward compatibility

- **Security & Validation**
  - Face liveness detection to prevent spoofing
  - Euclidean distance-based face matching (threshold: 0.6)
  - Geofencing with configurable radius
  - Input sanitization and validation

##  Tech Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | React 18, Vite, CSS3 |
| **Backend** | Node.js, Express, Middleware (Auth, Async Handler) |
| **Database** | SQLite (node:sqlite), SQL migrations |
| **Face Recognition** | Face.js library (browser-side detection) |

##  Project Structure

```
attend-new/
├── frontend/                    # React + Vite application
│   ├── src/
│   │   ├── components/         # Reusable React components
│   │   │   ├── TakeAttendance.jsx      # Lecturer session & attendance
│   │   │   ├── Dashboard.jsx           # Student & admin dashboard
│   │   │   ├── CameraApp.jsx           # Face registration & check-in
│   │   │   └── ...
│   │   ├── utils/
│   │   │   └── api.js          # Centralized fetch wrapper
│   │   ├── styles/             # CSS files
│   │   └── App.jsx
│   ├── package.json
│   └── vite.config.js
│
├── node-backend/                # Express API server
│   ├── routes/
│   │   ├── lecturerRoutes.js    # Session management & bulk attendance
│   │   ├── attendanceRoutes.js  # Check-in & active sessions
│   │   ├── authRoutes.js        # Authentication
│   │   └── ...
│   ├── migrations/
│   │   ├── create_sessions_and_attendance.sql  # Schema
│   │   └── initDb.js            # Migration runner
│   ├── middleware/              # Auth, async error handling
│   ├── models/                  # appState model
│   ├── utils/
│   │   └── db.js                # SQLite database instance
│   ├── package.json
│   ├── server.js                # Express app setup
│   └── app.js                   # Routes & middleware config
│
└── package.json                 # Root package
```

##  Getting Started

### Prerequisites
- **Node.js** 18+ ([Download](https://nodejs.org))
- **npm** 9+ (included with Node.js)

### 1. Clone the Repository
```bash
git clone https://github.com/j3rry-AI/class-attendance-.git
cd class-attendance-
```

### 2. Install Dependencies
```bash
# Frontend
cd frontend
npm install

# Backend (in new terminal)
cd node-backend
npm install
```

### 3. Environment Setup
Create a `.env` file in `node-backend/`:
```env
NODE_ENV=development
PORT=3000
DATABASE_URL=sqlite:data/app_state.sqlite
JWT_SECRET=your-secret-key-here
SQLITE_FILE=data/app_state.sqlite
```

### 4. Initialize Database
The database migrations run automatically on server startup. The SQLite schema includes:
- `sessions` table (id, course_id, status, start_time, end_time, etc.)
- `attendance` table (id, session_id, student_id, status, timestamp, etc.)

### 5. Run the Application

**Start Backend:**
```bash
cd node-backend
npm start
# Server runs on http://localhost:3000
```

**Start Frontend (new terminal):**
```bash
cd frontend
npm run dev
# Frontend runs on http://localhost:5174 (or configured port)
```

### 6. Access the App
- Open browser to **http://localhost:5174**
- Login with test credentials or register a new account
- Lecturers can start sessions from the "Take Attendance" page
- Students can check in from their dashboard

##  Usage Guide

### For Lecturers
1. **Start a Session**
   - Select a course and location
   - Click "Start Class Session" (30-minute window)
   - Students will see the active session immediately

2. **Mark Attendance**
   - Students can check in via their dashboard
   - Or mark attendance manually in bulk
   - Countdown timer shows remaining session time

3. **View Reports**
   - See session history and attendance counts
   - Export or view detailed attendance per student

### For Students
1. **Register Face**
   - Upload a clear face photo in good lighting
   - System stores and uses for future check-ins

2. **Check In**
   - Open "Check In" on your dashboard
   - View active sessions for your enrolled courses
   - Use camera to verify face and mark attendance

3. **View Attendance**
   - Track your attendance percentage per course
   - Dispute missed sessions with proof (optional)

##  API Endpoints

### Lecturer Routes
- `POST /api/lecturer/sessions/start` - Start a new class session
- `GET /api/lecturer/sessions/active` - Get active session for a course
- `GET /api/lecturer/sessions/history` - Session history
- `POST /api/lecturer/attendance/bulk` - Mark multiple students' attendance
- `POST /api/lecturer/send-notification` - Send notification to students

### Student Routes
- `GET /api/student/sessions/active` - Fetch active sessions for student's enrolled courses
- `POST /api/attendance/checkin` - Check in with face verification
- `GET /api/student/attendance-report` - Get student's attendance report

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login and receive JWT token
- `POST /api/auth/logout` - Logout

##  Architecture Highlights

### Session Management (SQLite)
- Sessions inserted with SQL datetime triggers
- Auto-expiry after 1 hour via `end_time > datetime('now')` queries
- Transaction-safe bulk operations

### Face Recognition
- Browser-side detection using face.js library
- 128-dimensional face descriptor vectors
- Euclidean distance matching (threshold: 0.6)
- Liveness detection to prevent photo spoofing

### Backend Persistence
- Dual-layer sync: SQLite (canonical) + appState (legacy compatibility)
- Migrations run at server startup via `initDb.js`
- Database connection via Node.js native `DatabaseSync`

##  Data Flow

```
Lecturer Starts Session
    ↓
POST /api/lecturer/sessions/start
    ↓
INSERT INTO sessions (SQLite) + update appState
    ↓
Frontend receives persisted session with end_time
    ↓
Student sees active session
    ↓
Student checks in
    ↓
POST /api/attendance/checkin + INSERT INTO attendance
    ↓
Attendance record visible in reports
```

##  Security Considerations

- **Face Verification**: Liveness detection + euclidean distance matching
- **Geofencing**: Optional location-based check-in restrictions
- **JWT Authentication**: Token-based access control
- **Input Sanitization**: Escape user inputs to prevent XSS
- **Session Expiry**: Auto-expire sessions after configured duration

##  Testing

Run backend tests:
```bash
cd node-backend
npm test
```

Run frontend tests (if configured):
```bash
cd frontend
npm test
```

##  Notes

- The backend uses SQLite's synchronous API for simplicity and guaranteed atomicity
- Session duration defaults to 30 minutes; configurable via request body
- Face descriptor version is tracked for future algorithm updates
- Notifications are stored in appState; extend with Nodemailer/Twilio for email/SMS

##  Contributing

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Commit changes: `git commit -m "Add feature description"`
3. Push to branch: `git push origin feature/your-feature`
4. Open a pull request

##  License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

##  Support

For issues or questions:
- Check existing GitHub issues
- Create a new issue with detailed description and steps to reproduce
- Include terminal output and browser console errors

##  Roadmap

- [ ] PostgreSQL migration option
- [ ] Email/SMS notifications via Nodemailer/Twilio
- [ ] Mobile app (React Native)
- [ ] Multi-institution dashboard
- [ ] Advanced attendance analytics

---

**Made with love for educational institutions**
