import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../src/app.js';
import { openDatabase, setDatabase } from '../src/db.js';
import { requireAuth, requireRole } from '../src/middleware/auth.js';
import { DEFAULT_SEED_PASSWORD, SAMPLE_USERS, seedDatabase } from '../src/seed.js';

/**
 * Mount sample role-guarded endpoints in front of the real Express app so M1 tests
 * can exercise POST /api/auth/login -> JWT -> requireAuth -> requireRole end-to-end.
 */
function buildM1TestApp() {
  const testApp = express();
  testApp.use(express.json());

  testApp.get('/api/test-guards/parent-only', requireAuth, requireRole('parent'), (req, res) => {
    res.status(200).json({ scope: 'parent-only', role: req.user.role, userId: req.user.id });
  });

  testApp.get(
    '/api/test-guards/specialist-only',
    requireAuth,
    requireRole('specialist'),
    (req, res) => {
      res.status(200).json({ scope: 'specialist-only', role: req.user.role, userId: req.user.id });
    }
  );

  testApp.get(
    '/api/test-guards/care-team',
    requireAuth,
    requireRole('parent', 'specialist'),
    (req, res) => {
      res.status(200).json({ scope: 'care-team', role: req.user.role, userId: req.user.id });
    }
  );

  testApp.get('/api/test-guards/child-only', requireAuth, requireRole('child'), (req, res) => {
    res.status(200).json({ scope: 'child-only', role: req.user.role, userId: req.user.id });
  });

  testApp.use(app);
  return testApp;
}

describe('M1 API integration: login, missing token (401), and role guard (403) (WEB-39)', () => {
  const testApp = buildM1TestApp();
  let db;
  const tokensByRole = {};

  async function loginViaApi(email, password = DEFAULT_SEED_PASSWORD, extraBody = {}) {
    return request(testApp)
      .post('/api/auth/login')
      .send({ email, password, ...extraBody });
  }

  beforeAll(async () => {
    db = openDatabase(':memory:');
    setDatabase(db);
    await seedDatabase(db);

    const parentLogin = await loginViaApi('ayse.demir@example.com');
    const specialistLogin = await loginViaApi('mehmet.kaya@example.com');
    const childLogin = await loginViaApi('deniz.demir@example.com');

    tokensByRole.parent = parentLogin.body.token;
    tokensByRole.specialist = specialistLogin.body.token;
    tokensByRole.child = childLogin.body.token;
  });

  afterAll(() => {
    if (db) {
      db.close();
      setDatabase(null);
    }
  });

  describe('Successful login and session lifecycle (FR-M1-01, FR-M1-04, FR-M1-06)', () => {
    it.each(SAMPLE_USERS)(
      'logs in seeded $role ($email) and uses returned JWT on /me and /logout',
      async ({ name, email, role }) => {
        const loginRes = await loginViaApi(email);

        expect(loginRes.status).toBe(200);
        expect(typeof loginRes.body.token).toBe('string');
        expect(loginRes.body.user).toEqual({
          id: expect.any(Number),
          name,
          email,
          role,
        });
        expect(loginRes.body.user.password_hash).toBeUndefined();

        const meRes = await request(testApp)
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${loginRes.body.token}`);

        expect(meRes.status).toBe(200);
        expect(meRes.body).toEqual(loginRes.body.user);

        const logoutRes = await request(testApp)
          .post('/api/auth/logout')
          .set('Authorization', `Bearer ${loginRes.body.token}`);

        expect(logoutRes.status).toBe(200);
        expect(logoutRes.body).toEqual({ message: 'Logged out.' });
      }
    );

    it('cannot elevate role via login payload and still hits 403 on parent endpoints (FR-M1-03)', async () => {
      const loginRes = await loginViaApi('deniz.demir@example.com', DEFAULT_SEED_PASSWORD, {
        role: 'parent',
      });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.user.role).toBe('child');

      const guardedRes = await request(testApp)
        .get('/api/test-guards/parent-only')
        .set('Authorization', `Bearer ${loginRes.body.token}`);

      expect(guardedRes.status).toBe(403);
      expect(guardedRes.body).toEqual({ error: 'Forbidden: insufficient permissions.' });
    });
  });

  describe('Wrong password and invalid login payloads (FR-M1-02)', () => {
    it.each([
      { label: 'completely wrong password', password: 'wrong-password' },
      { label: 'wrong password casing', password: 'Password123' },
      { label: 'trailing whitespace in password', password: `${DEFAULT_SEED_PASSWORD} ` },
    ])('returns 401 without issuing a token for $label', async ({ password }) => {
      const response = await loginViaApi('ayse.demir@example.com', password);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Wrong email or password.' });
      expect(response.body.token).toBeUndefined();
      expect(response.body.user).toBeUndefined();
    });

    it('returns 400 when POST /api/auth/login is called without a body or Content-Type', async () => {
      const response = await request(testApp).post('/api/auth/login');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Email and password are required.' });
    });

    it.each([
      { email: 12345, password: DEFAULT_SEED_PASSWORD },
      { email: 'ayse.demir@example.com', password: 12345 },
      { email: null, password: null },
    ])('returns 400 when email or password has a non-string type: %j', async (payload) => {
      const response = await request(testApp).post('/api/auth/login').send(payload);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Email and password are required.' });
    });

    it('returns sanitized 500 Internal server error when an unexpected DB failure occurs', async () => {
      const brokenDb = openDatabase(':memory:');
      brokenDb.exec('DROP TABLE users;');
      setDatabase(brokenDb);

      try {
        const response = await loginViaApi('ayse.demir@example.com');
        expect(response.status).toBe(500);
        expect(response.body).toEqual({ error: 'Internal server error' });
      } finally {
        brokenDb.close();
        setDatabase(db);
      }
    });
  });

  describe('Missing and invalid tokens (401) (FR-M1-04, NFR-02)', () => {
    it.each([
      ['GET', '/api/auth/me'],
      ['POST', '/api/auth/logout'],
      ['GET', '/api/auth/unknown-subroute'],
      ['GET', '/api/test-guards/parent-only'],
      ['GET', '/api/test-guards/specialist-only'],
      ['GET', '/api/test-guards/care-team'],
      ['GET', '/api/test-guards/child-only'],
      ['GET', '/api/children/1/specialists'],
    ])('returns 401 when token is missing on %s %s', async (method, path) => {
      const response = await request(testApp)[method.toLowerCase()](path);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Authentication required.' });
    });

    it.each(['', '   '])(
      'returns 401 when Authorization header is blank: %j',
      async (headerValue) => {
        const response = await request(testApp)
          .get('/api/test-guards/parent-only')
          .set('Authorization', headerValue);

        expect(response.status).toBe(401);
        expect(response.body).toEqual({ error: 'Authentication required.' });
      }
    );

    it.each(['bearer some-token', 'Bearer ', 'Token abc'])(
      'returns 401 for invalid Authorization scheme/format: %j',
      async (headerValue) => {
        const response = await request(testApp)
          .get('/api/test-guards/parent-only')
          .set('Authorization', headerValue);

        expect(response.status).toBe(401);
        expect(response.body).toEqual({ error: 'Invalid authorization header.' });
      }
    );

    it('returns 401 for a JWT signed with the wrong secret', async () => {
      const foreignToken = jwt.sign(
        { id: 1, email: 'ayse.demir@example.com', name: 'Ayşe Demir', role: 'parent' },
        'wrong-signing-secret',
        { expiresIn: '1h' }
      );

      const response = await request(testApp)
        .get('/api/test-guards/parent-only')
        .set('Authorization', `Bearer ${foreignToken}`);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid or expired token.' });
    });

    it('returns 401 before requireRole when a JWT is expired', async () => {
      const secret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
      const expiredChildToken = jwt.sign(
        { id: 5, email: 'deniz.demir@example.com', name: 'Deniz Demir', role: 'child' },
        secret,
        { expiresIn: '-10s' }
      );

      const response = await request(testApp)
        .get('/api/test-guards/parent-only')
        .set('Authorization', `Bearer ${expiredChildToken}`);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid or expired token.' });
    });
  });

  describe('Role guard matrix using login-issued JWTs (403 vs 200) (FR-M1-05, NFR-02)', () => {
    it.each([
      { role: 'parent', path: '/api/test-guards/parent-only', expectedStatus: 200 },
      { role: 'specialist', path: '/api/test-guards/parent-only', expectedStatus: 403 },
      { role: 'child', path: '/api/test-guards/parent-only', expectedStatus: 403 },
      { role: 'parent', path: '/api/test-guards/specialist-only', expectedStatus: 403 },
      { role: 'specialist', path: '/api/test-guards/specialist-only', expectedStatus: 200 },
      { role: 'child', path: '/api/test-guards/specialist-only', expectedStatus: 403 },
      { role: 'parent', path: '/api/test-guards/care-team', expectedStatus: 200 },
      { role: 'specialist', path: '/api/test-guards/care-team', expectedStatus: 200 },
      { role: 'child', path: '/api/test-guards/care-team', expectedStatus: 403 },
      { role: 'parent', path: '/api/test-guards/child-only', expectedStatus: 403 },
      { role: 'specialist', path: '/api/test-guards/child-only', expectedStatus: 403 },
      { role: 'child', path: '/api/test-guards/child-only', expectedStatus: 200 },
    ])(
      'responds $expectedStatus when $role calls $path with its login token',
      async ({ role, path, expectedStatus }) => {
        const response = await request(testApp)
          .get(path)
          .set('Authorization', `Bearer ${tokensByRole[role]}`);

        expect(response.status).toBe(expectedStatus);
        if (expectedStatus === 403) {
          expect(response.body).toEqual({ error: 'Forbidden: insufficient permissions.' });
        } else {
          expect(response.body.role).toBe(role);
        }
      }
    );
  });
});
