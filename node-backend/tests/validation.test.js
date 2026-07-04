const { validateRegNumber, normalizeRegNumber, hashPassword } = require('../utils/validation');

test('valid strict student ID passes', () => {
  expect(validateRegNumber('ifs204981')).toBe(true);
  expect(validateRegNumber('IFS204981')).toBe(true);
});

test('invalid ID fails', () => {
  expect(validateRegNumber('invalid-id')).toBe(false);
  expect(validateRegNumber('12345')).toBe(false);
});

test('normalize removes slashes and uppercase', () => {
  expect(normalizeRegNumber('FUTA/STAFF/Dr/John/CS')).toBe('FUTASTAFFDRJOHNCS');
});

test('hashPassword is stable and returns 64-hex string', () => {
  const h1 = hashPassword('password');
  const h2 = hashPassword('password');
  expect(h1).toBe(h2);
  expect(h1).toMatch(/^[a-f0-9]{64}$/i);
});
