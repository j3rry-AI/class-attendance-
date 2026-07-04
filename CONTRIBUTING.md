# Contributing to Class Attendance System

Thank you for your interest in contributing! This document outlines the process and guidelines for contributing to this project.

## Code of Conduct
- Be respectful and professional in all interactions
- Welcome diverse perspectives and experiences
- Focus on constructive feedback

## Getting Started

### 1. Fork & Clone
```bash
git clone https://github.com/YOUR_USERNAME/class-attendance-.git
cd class-attendance-
git remote add upstream https://github.com/j3rry-AI/class-attendance-.git
```

### 2. Create a Feature Branch
```bash
git checkout -b feature/your-feature-name
```

Use descriptive branch names:
- `feature/` for new features
- `bugfix/` for bug fixes
- `docs/` for documentation updates
- `refactor/` for code refactoring

### 3. Development

#### Frontend Changes
```bash
cd frontend
npm install
npm run dev
# Edit files and test in browser
```

#### Backend Changes
```bash
cd node-backend
npm install
npm start
# Test endpoints with a tool like Postman or cURL
```

#### Database Changes
- Update migration SQL in `node-backend/migrations/create_sessions_and_attendance.sql`
- Ensure migration runs automatically at server startup
- Document schema changes in comments

### 4. Testing

Run test suites before committing:
```bash
# Backend
cd node-backend
npm test

# Frontend (if applicable)
cd frontend
npm test
```

Ensure:
- No new console errors
- All tests pass locally
- Code is syntactically valid

### 5. Commit & Push

Write clear, descriptive commit messages:
```bash
git add .
git commit -m "feature: add face liveness detection (#123)"
git push origin feature/your-feature-name
```

#### Commit Message Format
- `feature:` - New functionality
- `bugfix:` - Bug fix
- `docs:` - Documentation only
- `refactor:` - Code refactoring without behavior change
- `perf:` - Performance improvements
- `test:` - Test additions or fixes

### 6. Pull Request Process

1. Open a pull request against the `main` branch
2. Provide a clear title and description of changes
3. Link any related issues: `Fixes #123`
4. Include:
   - What the PR adds/fixes
   - How to test the changes
   - Any new dependencies or environment variables
   - Screenshots (if UI changes)

Example PR description:
```markdown
## Description
Adds face liveness detection to improve security.

## Testing
1. Start backend and frontend
2. Register a new face
3. Attempt check-in with a photo (should fail)
4. Use live camera (should succeed)

## Related Issues
Fixes #45
```

## Style Guidelines

### JavaScript/JSX
- Use ES6+ syntax
- 2-space indentation
- Prefer functional components in React
- Use meaningful variable names
- Add JSDoc comments for complex functions

Example:
```jsx
/**
 * Validates and checks in a student
 * @param {Object} faceDescriptor - Student's face vector
 * @param {string} sessionId - Current session ID
 * @returns {Promise<{success: boolean, message: string}>}
 */
const checkInStudent = async (faceDescriptor, sessionId) => {
  // Implementation
};
```

### SQL
- Use uppercase for SQL keywords
- Include comments for complex queries
- Index frequently queried columns

Example:
```sql
-- Get active sessions for a student's enrolled courses
SELECT s.* FROM sessions s
WHERE s.status = 'active'
  AND s.end_time > datetime('now')
  AND s.course_id IN (
    SELECT course_id FROM student_enrollments WHERE student_id = ?
  );
```

### File Organization
- Keep components in `components/` directory
- Place API calls in `utils/api.js`
- Group related routes in single files
- Use descriptive file names

## Areas for Contribution

### High Priority
- [ ] PostgreSQL migration support
- [ ] Email/SMS notifications
- [ ] Mobile app (React Native)
- [ ] Advanced attendance analytics

### Medium Priority
- [ ] Improved UI/UX
- [ ] Performance optimizations
- [ ] Additional test coverage
- [ ] API documentation (Swagger/OpenAPI)

### Low Priority
- [ ] Documentation improvements
- [ ] Code style consistency
- [ ] Dev tool configurations

## Reporting Issues

Use GitHub Issues to report bugs or suggest features:

### Bug Report Template
```markdown
## Description
Brief description of the issue.

## Steps to Reproduce
1. Start the application
2. ...
3. Observe the error

## Expected Behavior
What should happen instead

## Actual Behavior
What actually happens

## Environment
- Node.js: v18.x
- Browser: Chrome v115
- OS: Windows/macOS/Linux

## Screenshots
Attach any relevant screenshots
```

### Feature Request Template
```markdown
## Description
Brief description of the requested feature.

## Use Case
Why do you need this feature?

## Proposed Solution
How should it work?

## Alternatives Considered
Other approaches you've thought of
```

## Questions?
- Open a GitHub discussion
- Contact the maintainers
- Check existing issues and PRs

---

Thank you for contributing! Your efforts make this project better for everyone. 🎉
