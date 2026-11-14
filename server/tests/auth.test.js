import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';
import { openDatabase, setDatabase } from '../src/db.js';
import { DEFAULT_SEED_PASSWORD, SAMPLE_USERS, seedDatabase } from '../src/seed.js';
import { verifyToken } from '../src/services/authService.js';

describe('seedDatabase and POST /api/auth/login', () => {
  let db;

  beforeAll(async () => {
    db = openDatabase(':memory:');
    setDatabase(db);
    await seedDatabase(db);
  });

  afterAll(() => {
    if (db) {
      db.close();
      setDatabase(null);
    }
  });

  describe('seedDatabase', () => {
    it('seeds synthetic users across all roles with bcrypt hashes', async () => {
      const users = db.prepare('SELECT name, email, password_hash, role FROM users').all();

      expect(users).toHaveLength(SAMPLE_USERS.length);
      expect(users.map((u) => u.role)).toEqual(
        expect.arrayContaining(['parent', 'specialist', 'child'])
      );

      for (const user of users) {
        expect(user.password_hash).not.toBe(DEFAULT_SEED_PASSWORD);
        expect(user.password_hash).toMatch(/^\$2[aby]\$/);
        expect(await bcrypt.compare(DEFAULT_SEED_PASSWORD, user.password_hash)).toBe(true);
      }
    });

    it('seeds Deniz Demir child profile and initial active specialist links', () => {
      const child = db.prepare('SELECT id, name, birth_date, parent_id, child_account_id FROM children').get();
      expect(child).toMatchObject({
        name: 'Deniz Demir',
        birth_date: '2018-05-14',
      });
      expect(child.parent_id).toBeGreaterThan(0);
      expect(child.child_account_id).toBeGreaterThan(0);

      const links = db
        .prepare(
          `SELECT u.email, sl.specialist_type, sl.active
           FROM specialist_links sl
           JOIN users u ON u.id = sl.specialist_id
           ORDER BY sl.id ASC`
        )
        .all();
      expect(links).toEqual([
        { email: 'mehmet.kaya@example.com', specialist_type: 'Teacher', active: 1 },
        { email: 'zeynep.arslan@example.com', specialist_type: 'Psychologist', active: 1 },
      ]);
    });

    it('is idempotent when run more than once', async () => {
      const secondRun = await seedDatabase(db);
      expect(secondRun).toEqual({
        tasksInserted: 0,
        usersInserted: 0,
        childrenInserted: 0,
        linksInserted: 0,
      });
    });
  });

  describe('POST /api/auth/login', () => {
    it.each([
      { email: 'ayse.demir@example.com', expectedRole: 'parent' },
      { email: 'mehmet.kaya@example.com', expectedRole: 'specialist' },
      { email: 'deniz.demir@example.com', expectedRole: 'child' },
    ])(
      'returns 200, a valid JWT, and user info for $expectedRole',
      async ({ email, expectedRole }) => {
        const response = await request(app).post('/api/auth/login').send({
          email,
          password: DEFAULT_SEED_PASSWORD,
        });

        expect(response.status).toBe(200);
        expect(typeof response.body.token).toBe('string');
        expect(response.body.user).toMatchObject({
          email,
          role: expectedRole,
        });
        expect(response.body.user.password_hash).toBeUndefined();

        const decoded = verifyToken(response.body.token);
        expect(decoded).toMatchObject({
          id: response.body.user.id,
          email,
          role: expectedRole,
        });
      }
    );

    it('takes role from the account and ignores role sent in body (FR-M1-03)', async () => {
      const response = await request(app).post('/api/auth/login').send({
        email: 'deniz.demir@example.com',
        password: DEFAULT_SEED_PASSWORD,
        role: 'parent',
      });

      expect(response.status).toBe(200);
      expect(response.body.user.role).toBe('child');
      expect(verifyToken(response.body.token).role).toBe('child');
    });

    it("returns the child's profile id on login, the same user object as /me (WEB-48)", async () => {
      const profile = db.prepare('SELECT id FROM children WHERE name = ?').get('Deniz Demir');
      const response = await request(app).post('/api/auth/login').send({
        email: 'deniz.demir@example.com',
        password: DEFAULT_SEED_PASSWORD,
      });

      expect(response.status).toBe(200);
      expect(response.body.user.childProfileId).toBe(profile.id);

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${response.body.token}`);
      expect(meRes.body).toEqual(response.body.user);

      const parentRes = await request(app).post('/api/auth/login').send({
        email: 'ayse.demir@example.com',
        password: DEFAULT_SEED_PASSWORD,
      });
      expect(parentRes.body.user.childProfileId).toBeUndefined();
    });

    it('handles trimmed and mixed-case email addresses', async () => {
      const response = await request(app).post('/api/auth/login').send({
        email: '  AYSE.DEMIR@example.com  ',
        password: DEFAULT_SEED_PASSWORD,
      });

      expect(response.status).toBe(200);
      expect(response.body.user.email).toBe('ayse.demir@example.com');
    });

    it('returns 401 when password is wrong', async () => {
      const response = await request(app).post('/api/auth/login').send({
        email: 'ayse.demir@example.com',
        password: 'wrong-password',
      });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Wrong email or password.' });
    });

    it('returns 401 when email does not exist', async () => {
      const response = await request(app).post('/api/auth/login').send({
        email: 'nonexistent@example.com',
        password: DEFAULT_SEED_PASSWORD,
      });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Wrong email or password.' });
    });

    it('returns 400 when email or password is missing or blank', async () => {
      const missingBoth = await request(app).post('/api/auth/login').send({});
      expect(missingBoth.status).toBe(400);
      expect(missingBoth.body).toEqual({ error: 'Email and password are required.' });

      const blankEmail = await request(app).post('/api/auth/login').send({
        email: '   ',
        password: DEFAULT_SEED_PASSWORD,
      });
      expect(blankEmail.status).toBe(400);
      expect(blankEmail.body).toEqual({ error: 'Email and password are required.' });

      const missingPassword = await request(app).post('/api/auth/login').send({
        email: 'ayse.demir@example.com',
      });
      expect(missingPassword.status).toBe(400);
      expect(missingPassword.body).toEqual({ error: 'Email and password are required.' });
    });

    it('returns 400 for malformed JSON body', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{bad json');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid JSON body.' });
    });

    it('applies rate limiting headers on POST /api/auth/login', async () => {
      const response = await request(app).post('/api/auth/login').send({
        email: 'ayse.demir@example.com',
        password: DEFAULT_SEED_PASSWORD,
      });

      expect(response.status).toBe(200);
      expect(response.headers.ratelimit).toBeDefined();
      expect(response.headers['ratelimit-policy']).toBeDefined();
    });

    it('rejects malformed tokens in verifyToken', () => {
      expect(() => verifyToken('not-a-valid-jwt')).toThrow('Invalid or expired token.');
    });
  });
});
