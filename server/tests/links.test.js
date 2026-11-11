import request from 'supertest';
import app from '../src/app.js';
import { openDatabase, setDatabase } from '../src/db.js';
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

describe('Specialist links API (WEB-40)', () => {
  let db;
  let parentA;
  let parentB;
  let specialistOne;
  let specialistTwo;
  let childUser;
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
    specialistOne = createUser(db, {
      name: 'Mehmet Kaya',
      email: 'mehmet.kaya@example.com',
      role: 'specialist',
    });
    specialistTwo = createUser(db, {
      name: 'Selin Öz',
      email: 'selin.oz@example.com',
      role: 'specialist',
    });
    childUser = createUser(db, {
      name: 'Deniz Demir',
      email: 'deniz.demir@example.com',
      role: 'child',
    });

    childA = createChild(db, {
      parentId: parentA.id,
      childAccountId: childUser.id,
      name: 'Deniz Demir',
      birthDate: '2018-05-14',
    });
    childB = createChild(db, {
      parentId: parentB.id,
      name: 'Ali Yıldız',
      birthDate: '2019-09-01',
    });
  });

  afterEach(() => {
    if (db) {
      db.close();
      setDatabase(null);
    }
  });

  describe('GET /api/children', () => {
    it('requires authentication and parent role', async () => {
      const noToken = await request(app).get('/api/children');
      expect(noToken.status).toBe(401);

      const asSpecialist = await request(app)
        .get('/api/children')
        .set('Authorization', `Bearer ${specialistOne.token}`);
      expect(asSpecialist.status).toBe(403);

      const asChild = await request(app)
        .get('/api/children')
        .set('Authorization', `Bearer ${childUser.token}`);
      expect(asChild.status).toBe(403);
    });

    it('returns only children owned by the logged-in parent', async () => {
      const resA = await request(app)
        .get('/api/children')
        .set('Authorization', `Bearer ${parentA.token}`);

      expect(resA.status).toBe(200);
      expect(resA.body).toEqual([childA]);

      const resB = await request(app)
        .get('/api/children')
        .set('Authorization', `Bearer ${parentB.token}`);

      expect(resB.status).toBe(200);
      expect(resB.body).toEqual([childB]);
    });
  });

  describe('POST /api/children/:childId/specialists (FR-M2-01, FR-M2-02)', () => {
    it('links a registered specialist by normalized email and type', async () => {
      const response = await request(app)
        .post(`/api/children/${childA.id}/specialists`)
        .set('Authorization', `Bearer ${parentA.token}`)
        .send({
          email: '  SELIN.OZ@EXAMPLE.COM  ',
          specialistType: '  Teacher ',
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        childId: childA.id,
        specialistId: specialistTwo.id,
        name: 'Selin Öz',
        email: 'selin.oz@example.com',
        specialistType: 'Teacher',
        active: true,
      });
      expect(typeof response.body.id).toBe('number');
      expect(typeof response.body.createdAt).toBe('string');
    });

    it('returns 404 when the email does not belong to a registered specialist (FR-M2-02)', async () => {
      const unknown = await request(app)
        .post(`/api/children/${childA.id}/specialists`)
        .set('Authorization', `Bearer ${parentA.token}`)
        .send({ email: 'nobody@example.com', specialistType: 'Teacher' });

      expect(unknown.status).toBe(404);
      expect(unknown.body).toEqual({ error: 'No registered specialist with this email.' });

      // Existing non-specialist user (parent or child) must also be rejected
      const parentAccount = await request(app)
        .post(`/api/children/${childA.id}/specialists`)
        .set('Authorization', `Bearer ${parentA.token}`)
        .send({ email: parentB.email, specialistType: 'Teacher' });

      expect(parentAccount.status).toBe(404);
      expect(parentAccount.body).toEqual({ error: 'No registered specialist with this email.' });
    });

    it('returns 400 when email, specialistType, or childId is invalid', async () => {
      const missingEmail = await request(app)
        .post(`/api/children/${childA.id}/specialists`)
        .set('Authorization', `Bearer ${parentA.token}`)
        .send({ email: '   ', specialistType: 'Teacher' });
      expect(missingEmail.status).toBe(400);

      const missingType = await request(app)
        .post(`/api/children/${childA.id}/specialists`)
        .set('Authorization', `Bearer ${parentA.token}`)
        .send({ email: specialistOne.email, specialistType: '' });
      expect(missingType.status).toBe(400);

      const badChildId = await request(app)
        .post('/api/children/abc/specialists')
        .set('Authorization', `Bearer ${parentA.token}`)
        .send({ email: specialistOne.email, specialistType: 'Teacher' });
      expect(badChildId.status).toBe(400);
    });

    it('enforces child ownership, missing child 404, role guard, and duplicate prevention', async () => {
      const missingChild = await request(app)
        .post('/api/children/9999/specialists')
        .set('Authorization', `Bearer ${parentA.token}`)
        .send({ email: specialistOne.email, specialistType: 'Teacher' });
      expect(missingChild.status).toBe(404);

      const otherParent = await request(app)
        .post(`/api/children/${childB.id}/specialists`)
        .set('Authorization', `Bearer ${parentA.token}`)
        .send({ email: specialistOne.email, specialistType: 'Teacher' });
      expect(otherParent.status).toBe(403);

      const specialistCaller = await request(app)
        .post(`/api/children/${childA.id}/specialists`)
        .set('Authorization', `Bearer ${specialistOne.token}`)
        .send({ email: specialistTwo.email, specialistType: 'Doctor' });
      expect(specialistCaller.status).toBe(403);

      await request(app)
        .post(`/api/children/${childA.id}/specialists`)
        .set('Authorization', `Bearer ${parentA.token}`)
        .send({ email: specialistOne.email, specialistType: 'Teacher' })
        .expect(201);

      const duplicate = await request(app)
        .post(`/api/children/${childA.id}/specialists`)
        .set('Authorization', `Bearer ${parentA.token}`)
        .send({ email: specialistOne.email, specialistType: 'Psychologist' });
      expect(duplicate.status).toBe(409);
      expect(duplicate.body).toEqual({
        error: 'This specialist is already linked to this child.',
      });
    });
  });

  describe('GET /api/children/:childId/specialists and DELETE /api/children/:childId/specialists/:specialistId (FR-M2-03, FR-M2-04)', () => {
    it('lists active specialists, soft-unlinks via active=0, and allows re-linking', async () => {
      await request(app)
        .post(`/api/children/${childA.id}/specialists`)
        .set('Authorization', `Bearer ${parentA.token}`)
        .send({ email: specialistOne.email, specialistType: 'Teacher' })
        .expect(201);

      await request(app)
        .post(`/api/children/${childA.id}/specialists`)
        .set('Authorization', `Bearer ${parentA.token}`)
        .send({ email: specialistTwo.email, specialistType: 'Psychologist' })
        .expect(201);

      const listRes = await request(app)
        .get(`/api/children/${childA.id}/specialists`)
        .set('Authorization', `Bearer ${parentA.token}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body).toHaveLength(2);
      expect(listRes.body.map((s) => s.email)).toEqual([
        specialistOne.email,
        specialistTwo.email,
      ]);

      // Unlink specialistOne
      const unlinkRes = await request(app)
        .delete(`/api/children/${childA.id}/specialists/${specialistOne.id}`)
        .set('Authorization', `Bearer ${parentA.token}`);
      expect(unlinkRes.status).toBe(204);

      // Verify soft-unlink preserved row with active = 0
      const row = db
        .prepare('SELECT active FROM specialist_links WHERE child_id = ? AND specialist_id = ?')
        .get(childA.id, specialistOne.id);
      expect(row).toEqual({ active: 0 });

      // Active list now excludes specialistOne
      const updatedList = await request(app)
        .get(`/api/children/${childA.id}/specialists`)
        .set('Authorization', `Bearer ${parentA.token}`);
      expect(updatedList.status).toBe(200);
      expect(updatedList.body.map((s) => s.email)).toEqual([specialistTwo.email]);

      // Re-unlinking already inactive link returns 404
      const secondUnlink = await request(app)
        .delete(`/api/children/${childA.id}/specialists/${specialistOne.id}`)
        .set('Authorization', `Bearer ${parentA.token}`);
      expect(secondUnlink.status).toBe(404);

      // Re-linking reactivates cleanly with updated specialistType
      const relink = await request(app)
        .post(`/api/children/${childA.id}/specialists`)
        .set('Authorization', `Bearer ${parentA.token}`)
        .send({ email: specialistOne.email, specialistType: 'Coach' });
      expect(relink.status).toBe(201);
      expect(relink.body.specialistType).toBe('Coach');
      expect(relink.body.active).toBe(true);
    });

    it('rejects non-owner parent, bad ids, and non-parent roles', async () => {
      const otherParentList = await request(app)
        .get(`/api/children/${childB.id}/specialists`)
        .set('Authorization', `Bearer ${parentA.token}`);
      expect(otherParentList.status).toBe(403);

      const badSpecialistId = await request(app)
        .delete(`/api/children/${childA.id}/specialists/not-an-id`)
        .set('Authorization', `Bearer ${parentA.token}`);
      expect(badSpecialistId.status).toBe(400);

      const specialistUnlink = await request(app)
        .delete(`/api/children/${childA.id}/specialists/${specialistOne.id}`)
        .set('Authorization', `Bearer ${specialistOne.token}`);
      expect(specialistUnlink.status).toBe(403);
    });
  });

  describe('GET /api/specialist/children (FR-M2-05)', () => {
    it('requires authentication and specialist role', async () => {
      const noToken = await request(app).get('/api/specialist/children');
      expect(noToken.status).toBe(401);

      const asParent = await request(app)
        .get('/api/specialist/children')
        .set('Authorization', `Bearer ${parentA.token}`);
      expect(asParent.status).toBe(403);

      const asChild = await request(app)
        .get('/api/specialist/children')
        .set('Authorization', `Bearer ${childUser.token}`);
      expect(asChild.status).toBe(403);
    });

    it('returns actively linked children and drops them once unlinked', async () => {
      await request(app)
        .post(`/api/children/${childA.id}/specialists`)
        .set('Authorization', `Bearer ${parentA.token}`)
        .send({ email: specialistOne.email, specialistType: 'Teacher' })
        .expect(201);

      await request(app)
        .post(`/api/children/${childB.id}/specialists`)
        .set('Authorization', `Bearer ${parentB.token}`)
        .send({ email: specialistOne.email, specialistType: 'Doctor' })
        .expect(201);

      const listRes = await request(app)
        .get('/api/specialist/children')
        .set('Authorization', `Bearer ${specialistOne.token}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body).toHaveLength(2);
      expect(listRes.body[0]).toMatchObject({
        id: childA.id,
        name: 'Deniz Demir',
        birthDate: '2018-05-14',
        parentId: parentA.id,
        parentName: 'Ayşe Demir',
        specialistType: 'Teacher',
      });
      expect(listRes.body[1]).toMatchObject({
        id: childB.id,
        name: 'Ali Yıldız',
        birthDate: '2019-09-01',
        parentId: parentB.id,
        parentName: 'Kemal Yılmaz',
        specialistType: 'Doctor',
      });

      // Unlinked specialistTwo has empty list
      const emptyRes = await request(app)
        .get('/api/specialist/children')
        .set('Authorization', `Bearer ${specialistTwo.token}`);
      expect(emptyRes.status).toBe(200);
      expect(emptyRes.body).toEqual([]);

      // Unlinking childA drops it from specialistOne's list immediately
      await request(app)
        .delete(`/api/children/${childA.id}/specialists/${specialistOne.id}`)
        .set('Authorization', `Bearer ${parentA.token}`)
        .expect(204);

      const afterUnlink = await request(app)
        .get('/api/specialist/children')
        .set('Authorization', `Bearer ${specialistOne.token}`);
      expect(afterUnlink.status).toBe(200);
      expect(afterUnlink.body.map((c) => c.id)).toEqual([childB.id]);
    });
  });
});
