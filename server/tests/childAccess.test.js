import express from 'express';
import rateLimit from 'express-rate-limit';
import request from 'supertest';
import app from '../src/app.js';
import { openDatabase, setDatabase } from '../src/db.js';
import { requireAuth } from '../src/middleware/auth.js';
import { requireChildAccess, verifyChildAccess } from '../src/middleware/childAccess.js';
import { signToken } from '../src/services/authService.js';

function createUser(db, { name, email, role }) {
  const result = db
    .prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(name, email.trim().toLowerCase(), 'test-hash', role);
  const user = {
    id: Number(result.lastInsertRowid),
    name,
    email: email.trim().toLowerCase(),
    role,
  };
  return {
    ...user,
    token: signToken(user),
  };
}

function createChild(db, { parentId, childAccountId = null, name, birthDate = '2018-05-14' }) {
  const result = db
    .prepare(
      'INSERT INTO children (parent_id, child_account_id, name, birth_date) VALUES (?, ?, ?, ?)'
    )
    .run(parentId, childAccountId, name, birthDate);
  return {
    id: Number(result.lastInsertRowid),
    parentId,
    childAccountId,
    name,
    birthDate,
  };
}

function createChildAccessTestApp() {
  const testApp = express();
  testApp.use(express.json());
  testApp.use(
    '/api',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    })
  );
  testApp.use('/api', requireAuth);

  // Default: parent + actively linked specialist only (child excluded, e.g. observations/documents/stats)
  testApp.get('/api/guard-default/:childId/records', requireChildAccess(), (req, res) => {
    res.status(200).json({
      childId: req.child.id,
      specialistType: req.specialistLink?.specialist_type ?? null,
    });
  });

  // Options object with allowChild + custom route parameter name
  testApp.get(
    '/api/guard-custom/:targetChildId/plan',
    requireChildAccess({ roles: ['parent', 'specialist'], allowChild: true, paramName: 'targetChildId' }),
    (req, res) => {
      res.status(200).json({ childId: req.child.id, role: req.user.role });
    }
  );

  // Centralized error handler matching src/app.js
  testApp.use((err, req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message });
  });

  return testApp;
}

describe('Child access guard (FR-M2-06, WEB-41)', () => {
  let db;
  let parentA;
  let parentB;
  let linkedSpecialist;
  let unlinkedSpecialist;
  let childAccountA;
  let childAccountB;
  let childA;
  let childB;

  beforeEach(() => {
    db = openDatabase(':memory:');
    setDatabase(db);

    parentA = createUser(db, {
      name: 'Ayşe Demir',
      email: 'ayse.demir@example.com',
      role: 'parent',
    });
    parentB = createUser(db, {
      name: 'Kemal Yılmaz',
      email: 'kemal.yilmaz@example.com',
      role: 'parent',
    });
    linkedSpecialist = createUser(db, {
      name: 'Mehmet Kaya',
      email: 'mehmet.kaya@example.com',
      role: 'specialist',
    });
    unlinkedSpecialist = createUser(db, {
      name: 'Selin Öz',
      email: 'selin.oz@example.com',
      role: 'specialist',
    });
    childAccountA = createUser(db, {
      name: 'Deniz Demir',
      email: 'deniz.demir@example.com',
      role: 'child',
    });
    childAccountB = createUser(db, {
      name: 'Ali Yıldız',
      email: 'ali.yildiz@example.com',
      role: 'child',
    });

    childA = createChild(db, {
      parentId: parentA.id,
      childAccountId: childAccountA.id,
      name: 'Deniz Demir',
    });
    childB = createChild(db, {
      parentId: parentB.id,
      childAccountId: childAccountB.id,
      name: 'Ali Yıldız',
    });

    db.prepare(
      'INSERT INTO specialist_links (child_id, specialist_id, specialist_type, active) VALUES (?, ?, ?, 1)'
    ).run(childA.id, linkedSpecialist.id, 'Teacher');
  });

  afterEach(() => {
    if (db) {
      db.close();
      setDatabase(null);
    }
  });

  describe('App child endpoints & /api/children/:childId guard', () => {
    it('allows owning parent, actively linked specialist, and child own account on GET /api/children/:childId', async () => {
      const parentRes = await request(app)
        .get(`/api/children/${childA.id}`)
        .set('Authorization', `Bearer ${parentA.token}`);
      expect(parentRes.status).toBe(200);
      expect(parentRes.body).toEqual(childA);

      const specialistRes = await request(app)
        .get(`/api/children/${childA.id}`)
        .set('Authorization', `Bearer ${linkedSpecialist.token}`);
      expect(specialistRes.status).toBe(200);
      expect(specialistRes.body).toEqual(childA);

      const childRes = await request(app)
        .get(`/api/children/${childA.id}`)
        .set('Authorization', `Bearer ${childAccountA.token}`);
      expect(childRes.status).toBe(200);
      expect(childRes.body).toEqual(childA);
    });

    it('rejects unlinked specialists with 403 across child endpoints even with a valid token (FR-M2-06)', async () => {
      for (const path of [
        `/api/children/${childA.id}`,
        `/api/children/${childA.id}/events`,
        `/api/children/${childA.id}/tasks`,
        `/api/children/${childA.id}/observations`,
      ]) {
        const res = await request(app)
          .get(path)
          .set('Authorization', `Bearer ${unlinkedSpecialist.token}`);
        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: 'You do not have access to this child.' });
      }
    });

    it('immediately rejects a previously linked specialist with 403 after unlink while token remains valid', async () => {
      // Valid specialist token succeeds while linked
      const beforeUnlink = await request(app)
        .get(`/api/children/${childA.id}`)
        .set('Authorization', `Bearer ${linkedSpecialist.token}`);
      expect(beforeUnlink.status).toBe(200);

      // Parent unlinks the specialist
      await request(app)
        .delete(`/api/children/${childA.id}/specialists/${linkedSpecialist.id}`)
        .set('Authorization', `Bearer ${parentA.token}`)
        .expect(204);

      // Exact same specialist token is now rejected with 403 on every child endpoint
      const afterUnlink = await request(app)
        .get(`/api/children/${childA.id}`)
        .set('Authorization', `Bearer ${linkedSpecialist.token}`);
      expect(afterUnlink.status).toBe(403);
      expect(afterUnlink.body).toEqual({ error: 'You do not have access to this child.' });

      const subRouteAfterUnlink = await request(app)
        .get(`/api/children/${childA.id}/events`)
        .set('Authorization', `Bearer ${linkedSpecialist.token}`);
      expect(subRouteAfterUnlink.status).toBe(403);

      // Re-linking restores access with the same valid token
      await request(app)
        .post(`/api/children/${childA.id}/specialists`)
        .set('Authorization', `Bearer ${parentA.token}`)
        .send({ email: linkedSpecialist.email, specialistType: 'Teacher' })
        .expect(201);

      const afterRelink = await request(app)
        .get(`/api/children/${childA.id}`)
        .set('Authorization', `Bearer ${linkedSpecialist.token}`);
      expect(afterRelink.status).toBe(200);
    });

    it('prevents cross-child access for specialists, other parents, and other child accounts', async () => {
      const specialistOtherChild = await request(app)
        .get(`/api/children/${childB.id}`)
        .set('Authorization', `Bearer ${linkedSpecialist.token}`);
      expect(specialistOtherChild.status).toBe(403);

      const parentOtherChild = await request(app)
        .get(`/api/children/${childB.id}`)
        .set('Authorization', `Bearer ${parentA.token}`);
      expect(parentOtherChild.status).toBe(403);

      const childOtherChild = await request(app)
        .get(`/api/children/${childB.id}`)
        .set('Authorization', `Bearer ${childAccountA.token}`);
      expect(childOtherChild.status).toBe(403);
    });

    it('keeps /api/children/:childId/specialists restricted to the owning parent even for linked specialists', async () => {
      const res = await request(app)
        .get(`/api/children/${childA.id}/specialists`)
        .set('Authorization', `Bearer ${linkedSpecialist.token}`);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Forbidden: insufficient permissions.' });
    });

    it('returns 400 for invalid childId and 404 when child does not exist', async () => {
      const invalidId = await request(app)
        .get('/api/children/0')
        .set('Authorization', `Bearer ${parentA.token}`);
      expect(invalidId.status).toBe(400);

      const missing = await request(app)
        .get('/api/children/9999')
        .set('Authorization', `Bearer ${parentA.token}`);
      expect(missing.status).toBe(404);
    });
  });

  describe('requireChildAccess middleware options and verifyChildAccess helper', () => {
    const testApp = createChildAccessTestApp();

    it('defaults to parent and actively linked specialist only (excludes child account)', async () => {
      const asParent = await request(testApp)
        .get(`/api/guard-default/${childA.id}/records`)
        .set('Authorization', `Bearer ${parentA.token}`);
      expect(asParent.status).toBe(200);
      expect(asParent.body).toEqual({ childId: childA.id, specialistType: null });

      const asLinked = await request(testApp)
        .get(`/api/guard-default/${childA.id}/records`)
        .set('Authorization', `Bearer ${linkedSpecialist.token}`);
      expect(asLinked.status).toBe(200);
      expect(asLinked.body).toEqual({ childId: childA.id, specialistType: 'Teacher' });

      const asUnlinked = await request(testApp)
        .get(`/api/guard-default/${childA.id}/records`)
        .set('Authorization', `Bearer ${unlinkedSpecialist.token}`);
      expect(asUnlinked.status).toBe(403);

      const asChild = await request(testApp)
        .get(`/api/guard-default/${childA.id}/records`)
        .set('Authorization', `Bearer ${childAccountA.token}`);
      expect(asChild.status).toBe(403);
    });

    it('supports allowChild option and custom paramName', async () => {
      const asOwnChild = await request(testApp)
        .get(`/api/guard-custom/${childA.id}/plan`)
        .set('Authorization', `Bearer ${childAccountA.token}`);
      expect(asOwnChild.status).toBe(200);
      expect(asOwnChild.body).toEqual({ childId: childA.id, role: 'child' });

      const asOtherChild = await request(testApp)
        .get(`/api/guard-custom/${childB.id}/plan`)
        .set('Authorization', `Bearer ${childAccountA.token}`);
      expect(asOtherChild.status).toBe(403);

      const asUnlinked = await request(testApp)
        .get(`/api/guard-custom/${childA.id}/plan`)
        .set('Authorization', `Bearer ${unlinkedSpecialist.token}`);
      expect(asUnlinked.status).toBe(403);
    });

    it('throws 401 when user is missing and 403 for unknown role', () => {
      expect(() => verifyChildAccess(db, null, childA.id)).toThrow('Authentication required.');
      expect(() =>
        verifyChildAccess(db, { id: 99, role: 'admin' }, childA.id, ['parent', 'admin'])
      ).toThrow('Forbidden: you do not have access to this child.');
    });
  });
});
