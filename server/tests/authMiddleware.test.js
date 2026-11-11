import express from 'express';
import rateLimit from 'express-rate-limit';
import request from 'supertest';
import app from '../src/app.js';
import { openDatabase, setDatabase } from '../src/db.js';
import { requireAuth, requireRole } from '../src/middleware/auth.js';
import { signToken } from '../src/services/authService.js';
import { seedDatabase } from '../src/seed.js';

function createRoleGuardedTestApp() {
  const testApp = express();
  testApp.use(express.json());
  testApp.use(
    '/api',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false
    })
  );
  testApp.use('/api', requireAuth);

  testApp.get('/api/parent-only', requireRole('parent'), (req, res) => {
    res.status(200).json({ role: req.user.role });
  });

  testApp.get('/api/care-team', requireRole('parent', 'specialist'), (req, res) => {
    res.status(200).json({ role: req.user.role });
  });

  testApp.get('/api/care-team-array', requireRole(['parent', 'specialist']), (req, res) => {
    res.status(200).json({ role: req.user.role });
  });

  testApp.get('/api/child-only', requireRole('child'), (req, res) => {
    res.status(200).json({ role: req.user.role });
  });

  return testApp;
}

describe('Auth middleware and role guard (WEB-37)', () => {
  let db;
  let parentToken;
  let specialistToken;
  let childToken;

  beforeAll(async () => {
    db = openDatabase(':memory:');
    setDatabase(db);
    await seedDatabase(db);

    const parent = db.prepare("SELECT id, name, email, role FROM users WHERE role = 'parent'").get();
    const specialist = db
      .prepare("SELECT id, name, email, role FROM users WHERE role = 'specialist'")
      .get();
    const child = db.prepare("SELECT id, name, email, role FROM users WHERE role = 'child'").get();

    parentToken = signToken(parent);
    specialistToken = signToken(specialist);
    childToken = signToken(child);
  });

  afterAll(() => {
    if (db) {
      db.close();
      setDatabase(null);
    }
  });

  describe('requireAuth and API protection', () => {
    it('returns 401 when Authorization header is missing on protected or arbitrary API routes', async () => {
      for (const path of ['/api/auth/me', '/api/children/1/events', '/api/unknown']) {
        const response = await request(app).get(path);
        expect(response.status).toBe(401);
        expect(response.body).toEqual({ error: 'Authentication required.' });
      }

      const logoutResponse = await request(app).post('/api/auth/logout');
      expect(logoutResponse.status).toBe(401);
      expect(logoutResponse.body).toEqual({ error: 'Authentication required.' });
    });

    it.each([
      'Basic dXNlcjpwYXNz',
      'Bearer',
      'Bearer token-one token-two',
      'Token abc123',
    ])('returns 401 for malformed Authorization header: %s', async (headerValue) => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', headerValue);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid authorization header.' });
    });

    it('returns 401 for an invalid or tampered JWT', async () => {
      const tampered = `${parentToken.slice(0, -4)}xxxx`;

      for (const token of ['invalid.jwt.token', tampered]) {
        const response = await request(app)
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(401);
        expect(response.body).toEqual({ error: 'Invalid or expired token.' });
      }
    });

    it('returns 401 for an expired JWT', async () => {
      const prevExpiresIn = process.env.JWT_EXPIRES_IN;
      process.env.JWT_EXPIRES_IN = '-1s';
      const expiredToken = signToken({
        id: 1,
        name: 'Ayşe Demir',
        email: 'ayse.demir@example.com',
        role: 'parent',
      });
      if (prevExpiresIn === undefined) {
        delete process.env.JWT_EXPIRES_IN;
      } else {
        process.env.JWT_EXPIRES_IN = prevExpiresIn;
      }

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid or expired token.' });
    });

    it('returns the logged-in user profile for GET /api/auth/me with a valid JWT', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${parentToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        email: 'ayse.demir@example.com',
        role: 'parent',
      });
      expect(response.body.password_hash).toBeUndefined();
    });

    it('returns 404 on GET /api/auth/me if the token user no longer exists in DB', async () => {
      const ghostToken = signToken({
        id: 9999,
        name: 'Ghost User',
        email: 'ghost@example.com',
        role: 'parent',
      });

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${ghostToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'User not found.' });
    });

    it('allows POST /api/auth/logout with a valid JWT', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${specialistToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Logged out.' });
    });

    it('returns 404 JSON for unknown /api routes when authenticated', async () => {
      const response = await request(app)
        .get('/api/does-not-exist')
        .set('Authorization', `Bearer ${parentToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Not found.' });
    });

    it('keeps /api/health accessible without a token', async () => {
      const response = await request(app).get('/api/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
    });
  });

  describe('requireRole guard', () => {
    const testApp = createRoleGuardedTestApp();

    it('allows only parent on parent-only route and returns 403 for specialist and child', async () => {
      const parentRes = await request(testApp)
        .get('/api/parent-only')
        .set('Authorization', `Bearer ${parentToken}`);
      expect(parentRes.status).toBe(200);
      expect(parentRes.body).toEqual({ role: 'parent' });

      const specialistRes = await request(testApp)
        .get('/api/parent-only')
        .set('Authorization', `Bearer ${specialistToken}`);
      expect(specialistRes.status).toBe(403);
      expect(specialistRes.body).toEqual({ error: 'Forbidden: insufficient permissions.' });

      const childRes = await request(testApp)
        .get('/api/parent-only')
        .set('Authorization', `Bearer ${childToken}`);
      expect(childRes.status).toBe(403);
      expect(childRes.body).toEqual({ error: 'Forbidden: insufficient permissions.' });
    });

    it('supports multiple allowed roles via variadic arguments or an array', async () => {
      for (const path of ['/api/care-team', '/api/care-team-array']) {
        const parentRes = await request(testApp)
          .get(path)
          .set('Authorization', `Bearer ${parentToken}`);
        expect(parentRes.status).toBe(200);

        const specialistRes = await request(testApp)
          .get(path)
          .set('Authorization', `Bearer ${specialistToken}`);
        expect(specialistRes.status).toBe(200);

        const childRes = await request(testApp)
          .get(path)
          .set('Authorization', `Bearer ${childToken}`);
        expect(childRes.status).toBe(403);
        expect(childRes.body).toEqual({ error: 'Forbidden: insufficient permissions.' });
      }
    });

    it('allows only child on child-only route and rejects parent/specialist with 403', async () => {
      const childRes = await request(testApp)
        .get('/api/child-only')
        .set('Authorization', `Bearer ${childToken}`);
      expect(childRes.status).toBe(200);

      const parentRes = await request(testApp)
        .get('/api/child-only')
        .set('Authorization', `Bearer ${parentToken}`);
      expect(parentRes.status).toBe(403);

      const specialistRes = await request(testApp)
        .get('/api/child-only')
        .set('Authorization', `Bearer ${specialistToken}`);
      expect(specialistRes.status).toBe(403);
    });

    it('returns 401 if requireRole runs without req.user populated', () => {
      const guard = requireRole('parent');
      const statusCalls = [];
      const res = {
        status(code) {
          statusCalls.push(code);
          return {
            json(body) {
              statusCalls.push(body);
              return body;
            },
          };
        },
      };

      guard({}, res, () => {});
      expect(statusCalls).toEqual([401, { error: 'Authentication required.' }]);
    });
  });
});
