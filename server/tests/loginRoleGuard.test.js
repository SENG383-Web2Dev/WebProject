import bcrypt from 'bcryptjs';
import express from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../src/app.js';
import { openDatabase, setDatabase } from '../src/db.js';
import { requireAuth, requireRole } from '../src/middleware/auth.js';

const FIXTURE_USERS = [
  {
    name: 'Fixture Parent',
    email: 'parent.fixture@example.com',
    password: 'ParentPass!101',
    role: 'parent',
  },
  {
    name: 'Fixture Specialist',
    email: 'specialist.fixture@example.com',
    password: 'SpecPass!202',
    role: 'specialist',
  },
  {
    name: 'Fixture Child',
    email: 'child.fixture@example.com',
    password: 'ChildPass!303',
    role: 'child',
  },
];

/**
 * Insert a synthetic user with a bcrypt-hashed password into the test SQLite DB.
 */
async function insertTestUser(db, { name, email, password, role }) {
  const passwordHash = await bcrypt.hash(password, 8);
  const result = db
    .prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(name, email.trim().toLowerCase(), passwordHash, role);

  return {
    id: Number(result.lastInsertRowid),
    name,
    email: email.trim().toLowerCase(),
    role,
  };
}

/**
 * Mount sample role-guarded endpoints in front of the real Express app so API tests
 * exercise POST /api/auth/login -> JWT -> requireAuth -> requireRole end-to-end.
 */
function createGuardedApp() {
  const testApp = express();
  testApp.use(express.json());
  testApp.use(
    '/api/test-guards',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false
    })
  );

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

describe('API login, authentication (401), and role guard (403) (WEB-39)', () => {
  const testApp = createGuardedApp();
  let db;
  const usersByRole = {};
  const tokensByRole = {};

  async function loginViaApi(email, password, extraBody = {}) {
    return request(testApp)
      .post('/api/auth/login')
      .send({ email, password, ...extraBody });
  }

  beforeAll(async () => {
    db = openDatabase(':memory:');
    setDatabase(db);

    for (const fixture of FIXTURE_USERS) {
      usersByRole[fixture.role] = {
        ...(await insertTestUser(db, fixture)),
        password: fixture.password,
      };
      const loginRes = await loginViaApi(fixture.email, fixture.password);
      tokensByRole[fixture.role] = loginRes.body.token;
    }
  });

  afterAll(() => {
    if (db) {
      db.close();
      setDatabase(null);
    }
  });

  describe('Successful login and session lifecycle (FR-M1-01, FR-M1-04, FR-M1-06)', () => {
    it.each(FIXTURE_USERS)(
      'logs in $role ($email) with distinct password and uses returned JWT on /me and /logout',
      async ({ name, email, password, role }) => {
        const loginRes = await loginViaApi(email, password);

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

    it('authenticates newly created database accounts without relying on seed accounts', async () => {
      const dynamicUser = {
        name: 'Dynamic Specialist',
        email: 'dynamic.specialist@example.com',
        password: 'FreshDbUser!999',
        role: 'specialist',
      };
      const inserted = await insertTestUser(db, dynamicUser);

      const loginRes = await loginViaApi(dynamicUser.email, dynamicUser.password);
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.user).toEqual(inserted);

      const allowedRes = await request(testApp)
        .get('/api/test-guards/specialist-only')
        .set('Authorization', `Bearer ${loginRes.body.token}`);
      expect(allowedRes.status).toBe(200);
      expect(allowedRes.body).toMatchObject({ role: 'specialist', userId: inserted.id });

      const forbiddenRes = await request(testApp)
        .get('/api/test-guards/parent-only')
        .set('Authorization', `Bearer ${loginRes.body.token}`);
      expect(forbiddenRes.status).toBe(403);
      expect(forbiddenRes.body).toEqual({ error: 'Forbidden: insufficient permissions.' });
    });

    it('cannot elevate role via login payload and still hits 403 on parent endpoints (FR-M1-03)', async () => {
      const child = usersByRole.child;
      const loginRes = await loginViaApi(child.email, child.password, { role: 'parent' });

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
      { label: 'wrong password casing', password: 'parentpass!101' },
      { label: 'trailing whitespace in password', password: 'ParentPass!101 ' },
    ])('returns 401 without issuing a token for $label', async ({ password }) => {
      const response = await loginViaApi(usersByRole.parent.email, password);

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
      { email: 12345, password: 'some-password' },
      { email: 'parent.fixture@example.com', password: 12345 },
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
        const response = await loginViaApi(usersByRole.parent.email, usersByRole.parent.password);
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
      const parent = usersByRole.parent;
      const foreignToken = jwt.sign(
        { id: parent.id, email: parent.email, name: parent.name, role: parent.role },
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
      const child = usersByRole.child;
      const secret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
      const expiredChildToken = jwt.sign(
        { id: child.id, email: child.email, name: child.name, role: child.role },
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
