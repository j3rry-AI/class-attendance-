const { test, expect } = require('@playwright/test');

// NOTE: These E2E tests are scaffolded and expect the backend and frontend
// to be running locally. They are designed as examples for the activation -> login -> register-face -> checkin flow.

test('home loads', async ({ page }) => {
  await page.goto(process.env.FRONTEND_URL || 'http://127.0.0.1:5174');
  await expect(page).toHaveTitle(/Attendance|University|Login/i);
});

// Further tests (activation, register-face, checkin) require test accounts and camera mocking.
// Add tests here when you have a test environment and test assets.
