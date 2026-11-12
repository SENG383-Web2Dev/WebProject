import bcrypt from 'bcryptjs';
import request from 'supertest';
import app from '../src/app.js';
import { openDatabase, setDatabase } from '../src/db.js';
import { DEFAULT_SEED_PASSWORD, seedDatabase } from '../src/seed.js';
import { SPECIALIST_TYPES } from '../src/services/linkService.js';

const CHILD_SUB_ENDPOINTS = [
  ['get', 'events'],
  ['get', 'tasks'],
  ['post', 'tasks'],
  ['get', 'observations'],
  ['get', 'documents'],
  ['get', 'stats'],
  ['post', 'ai-summaries'],
];

async function insertUser(db, { name, email, passwordHash, role }) {
  const normalizedEmail = email.trim().toLowerCase();
  const result = db
    .prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(name, normalizedEmail, passwordHash, role);

  return {
    id: Number(result.lastInsertRowid),
    name,
    email: normalizedEmail,
    role,
  };
}

function insertChild(db, { parentId, childAccountId = null, name, birthDate = '2018-04-12' }) {
  const result = db
    .prepare('INSERT INTO children (parent_id, child_account_id, name, birth_date) VALUES (?, ?, ?, ?)')
    .run(parentId, childAccountId, name, birthDate);

  return {
    id: Number(result.lastInsertRowid),
    parentId,
    childAccountId,
    name,
    birthDate,
  };
}

async function loginUser(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  expect(typeof res.body.token).toBe('string');
  return res.body.token;
}

function authGet(path, token) {
  return request(app).get(path).set('Authorization', `Bearer ${token}`);
}

function authPost(path, token, body) {
  return request(app).post(path).set('Authorization', `Bearer ${token}`).send(body);
}

function authDelete(path, token) {
  return request(app).delete(path).set('Authorization', `Bearer ${token}`);
}

describe('M2 specialist linking API flow & 403 after unlink (WEB-43)', () => {
  const TEST_PASSWORD = 'M2FlowPass!123';
  let passwordHash;
  let db;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(TEST_PASSWORD, 4);
  });

  afterEach(() => {
    if (db) {
      db.close();
      db = null;
      setDatabase(null);
    }
  });

  async function setupWorld() {
    db = openDatabase(':memory:');
    setDatabase(db);

    const parent = await insertUser(db, {
      name: 'Ayse Parent',
      email: 'ayse.parent@example.com',
      passwordHash,
      role: 'parent',
    });
    const otherParent = await insertUser(db, {
      name: 'Kemal Parent',
      email: 'kemal.parent@example.com',
      passwordHash,
      role: 'parent',
    });
    const childUser = await insertUser(db, {
      name: 'Deniz Child',
      email: 'deniz.child@example.com',
      passwordHash,
      role: 'child',
    });
    const otherChildUser = await insertUser(db, {
      name: 'Ece Child',
      email: 'ece.child@example.com',
      passwordHash,
      role: 'child',
    });
    const specialistOne = await insertUser(db, {
      name: 'Mehmet Teacher',
      email: 'mehmet.spec@example.com',
      passwordHash,
      role: 'specialist',
    });
    const specialistTwo = await insertUser(db, {
      name: 'Zeynep Psych',
      email: 'zeynep.spec@example.com',
      passwordHash,
      role: 'specialist',
    });

    const child = insertChild(db, {
      parentId: parent.id,
      childAccountId: childUser.id,
      name: 'Deniz Demir',
      birthDate: '2018-05-14',
    });
    const otherChild = insertChild(db, {
      parentId: otherParent.id,
      childAccountId: otherChildUser.id,
      name: 'Ece Yilmaz',
      birthDate: '2017-09-02',
    });

    return {
      parent,
      otherParent,
      childUser,
      otherChildUser,
      specialistOne,
      specialistTwo,
      child,
      otherChild,
    };
  }

  describe('Linking specialists and listing care team (FR-M2-01, FR-M2-03, FR-M2-05)', () => {
    it('logs in parent, lists own children, links specialist with trimmed case-insensitive email, and lists child for specialist', async () => {
      const world = await setupWorld();
      const parentToken = await loginUser(world.parent.email, TEST_PASSWORD);
      const specToken = await loginUser(world.specialistOne.email, TEST_PASSWORD);

      const childrenRes = await authGet('/api/children', parentToken);
      expect(childrenRes.status).toBe(200);
      expect(childrenRes.body).toEqual([world.child]);

      const linkRes = await authPost(`/api/children/${world.child.id}/specialists`, parentToken, {
        email: '  MEHMET.SPEC@Example.COM  ',
        specialistType: 'Teacher',
      });
      expect(linkRes.status).toBe(201);
      expect(linkRes.body).toEqual({
        id: expect.any(Number),
        childId: world.child.id,
        specialistId: world.specialistOne.id,
        name: world.specialistOne.name,
        email: world.specialistOne.email,
        specialistType: 'Teacher',
        active: true,
        createdAt: expect.any(String),
      });

      const specialistsRes = await authGet(`/api/children/${world.child.id}/specialists`, parentToken);
      expect(specialistsRes.status).toBe(200);
      expect(specialistsRes.body).toHaveLength(1);
      expect(specialistsRes.body[0]).toMatchObject({
        specialistId: world.specialistOne.id,
        email: world.specialistOne.email,
        specialistType: 'Teacher',
        active: true,
      });

      const specChildrenRes = await authGet('/api/specialist/children', specToken);
      expect(specChildrenRes.status).toBe(200);
      expect(specChildrenRes.body).toEqual([
        {
          id: world.child.id,
          name: world.child.name,
          birthDate: world.child.birthDate,
          parentId: world.parent.id,
          childAccountId: world.childUser.id,
          parentName: world.parent.name,
          specialistType: 'Teacher',
          linkedAt: expect.any(String),
        },
      ]);

      const childDetailRes = await authGet(`/api/children/${world.child.id}`, specToken);
      expect(childDetailRes.status).toBe(200);
      expect(childDetailRes.body).toEqual(world.child);
    });

    it('supports linking specialists across all configured SPECIALIST_TYPES and prevents duplicate active links', async () => {
      const world = await setupWorld();
      const parentToken = await loginUser(world.parent.email, TEST_PASSWORD);

      const extraSpecs = [];
      for (let i = 0; i < SPECIALIST_TYPES.length; i += 1) {
        const spec = await insertUser(db, {
          name: `Spec Type ${i}`,
          email: `spec.type.${i}@example.com`,
          passwordHash,
          role: 'specialist',
        });
        extraSpecs.push({ spec, specialistType: SPECIALIST_TYPES[i] });

        const res = await authPost(`/api/children/${world.child.id}/specialists`, parentToken, {
          email: spec.email,
          specialistType: SPECIALIST_TYPES[i],
        });
        expect(res.status).toBe(201);
        expect(res.body.specialistType).toBe(SPECIALIST_TYPES[i]);
      }

      const listRes = await authGet(`/api/children/${world.child.id}/specialists`, parentToken);
      expect(listRes.status).toBe(200);
      expect(listRes.body.map((item) => item.specialistType)).toEqual(SPECIALIST_TYPES);

      const duplicateRes = await authPost(`/api/children/${world.child.id}/specialists`, parentToken, {
        email: extraSpecs[0].spec.email,
        specialistType: 'Doctor',
      });
      expect(duplicateRes.status).toBe(409);
      expect(duplicateRes.body).toEqual({
        error: 'This specialist is already linked to this child.',
      });
    });

    it('enforces role boundaries on parent-only and specialist-only collection endpoints', async () => {
      const world = await setupWorld();
      const parentToken = await loginUser(world.parent.email, TEST_PASSWORD);
      const specToken = await loginUser(world.specialistOne.email, TEST_PASSWORD);
      const childToken = await loginUser(world.childUser.email, TEST_PASSWORD);

      await authPost(`/api/children/${world.child.id}/specialists`, parentToken, {
        email: world.specialistOne.email,
        specialistType: 'Teacher',
      });

      const parentOnSpecChildren = await authGet('/api/specialist/children', parentToken);
      expect(parentOnSpecChildren.status).toBe(403);
      expect(parentOnSpecChildren.body).toEqual({ error: 'Forbidden: insufficient permissions.' });

      const childOnSpecChildren = await authGet('/api/specialist/children', childToken);
      expect(childOnSpecChildren.status).toBe(403);

      const specListCareTeam = await authGet(`/api/children/${world.child.id}/specialists`, specToken);
      expect(specListCareTeam.status).toBe(403);
      expect(specListCareTeam.body).toEqual({ error: 'Forbidden: insufficient permissions.' });

      const specAddSpecialist = await authPost(`/api/children/${world.child.id}/specialists`, specToken, {
        email: world.specialistTwo.email,
        specialistType: 'Psychologist',
      });
      expect(specAddSpecialist.status).toBe(403);

      const childDeleteSpecialist = await authDelete(
        `/api/children/${world.child.id}/specialists/${world.specialistOne.id}`,
        childToken
      );
      expect(childDeleteSpecialist.status).toBe(403);
    });
  });

  describe('Unknown email and validation errors (FR-M2-02)', () => {
    it('returns 404 when email is unknown or belongs to a non-specialist account', async () => {
      const world = await setupWorld();
      const parentToken = await loginUser(world.parent.email, TEST_PASSWORD);

      const candidates = [
        'unknown.specialist@example.com',
        world.parent.email,
        world.otherParent.email,
        world.childUser.email,
      ];

      for (const email of candidates) {
        const res = await authPost(`/api/children/${world.child.id}/specialists`, parentToken, {
          email,
          specialistType: 'Teacher',
        });
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'No registered specialist with this email.' });
      }

      const listRes = await authGet(`/api/children/${world.child.id}/specialists`, parentToken);
      expect(listRes.status).toBe(200);
      expect(listRes.body).toEqual([]);
    });

    it('returns 400/404 for invalid payload fields, malformed JSON, invalid childId, or missing child', async () => {
      const world = await setupWorld();
      const parentToken = await loginUser(world.parent.email, TEST_PASSWORD);

      const missingEmail = await authPost(`/api/children/${world.child.id}/specialists`, parentToken, {
        email: '   ',
        specialistType: 'Teacher',
      });
      expect(missingEmail.status).toBe(400);
      expect(missingEmail.body).toEqual({ error: 'Specialist email is required.' });

      const missingType = await authPost(`/api/children/${world.child.id}/specialists`, parentToken, {
        email: world.specialistOne.email,
        specialistType: '  ',
      });
      expect(missingType.status).toBe(400);
      expect(missingType.body).toEqual({ error: 'Specialist type is required.' });

      const invalidJson = await request(app)
        .post(`/api/children/${world.child.id}/specialists`)
        .set('Authorization', `Bearer ${parentToken}`)
        .set('Content-Type', 'application/json')
        .send('{"email":');
      expect(invalidJson.status).toBe(400);
      expect(invalidJson.body).toEqual({ error: 'Invalid JSON body.' });

      const badChildId = await authGet('/api/children/abc/specialists', parentToken);
      expect(badChildId.status).toBe(400);
      expect(badChildId.body).toEqual({ error: 'Invalid child id.' });

      const missingChild = await authPost('/api/children/9999/specialists', parentToken, {
        email: world.specialistOne.email,
        specialistType: 'Teacher',
      });
      expect(missingChild.status).toBe(404);
      expect(missingChild.body).toEqual({ error: 'Child not found.' });
    });
  });

  describe('Unlinking specialists and soft-deactivate reactivation (FR-M2-04)', () => {
    it('unlinks with 204, keeps active = 0 history in DB, returns 404 on repeat delete, and reactivates on re-link', async () => {
      const world = await setupWorld();
      const parentToken = await loginUser(world.parent.email, TEST_PASSWORD);
      const specToken = await loginUser(world.specialistOne.email, TEST_PASSWORD);

      const createRes = await authPost(`/api/children/${world.child.id}/specialists`, parentToken, {
        email: world.specialistOne.email,
        specialistType: 'Teacher',
      });
      expect(createRes.status).toBe(201);

      const unlinkRes = await authDelete(
        `/api/children/${world.child.id}/specialists/${world.specialistOne.id}`,
        parentToken
      );
      expect(unlinkRes.status).toBe(204);
      expect(unlinkRes.text).toBe('');

      const persistedRow = db
        .prepare('SELECT active, specialist_type FROM specialist_links WHERE child_id = ? AND specialist_id = ?')
        .get(world.child.id, world.specialistOne.id);
      expect(persistedRow).toEqual({ active: 0, specialist_type: 'Teacher' });

      const parentListAfterUnlink = await authGet(`/api/children/${world.child.id}/specialists`, parentToken);
      expect(parentListAfterUnlink.status).toBe(200);
      expect(parentListAfterUnlink.body).toEqual([]);

      const specChildrenAfterUnlink = await authGet('/api/specialist/children', specToken);
      expect(specChildrenAfterUnlink.status).toBe(200);
      expect(specChildrenAfterUnlink.body).toEqual([]);

      const repeatUnlink = await authDelete(
        `/api/children/${world.child.id}/specialists/${world.specialistOne.id}`,
        parentToken
      );
      expect(repeatUnlink.status).toBe(404);
      expect(repeatUnlink.body).toEqual({ error: 'Active specialist link not found.' });

      const relinkRes = await authPost(`/api/children/${world.child.id}/specialists`, parentToken, {
        email: world.specialistOne.email,
        specialistType: 'Psychologist',
      });
      expect(relinkRes.status).toBe(201);
      expect(relinkRes.body).toMatchObject({
        id: createRes.body.id,
        specialistId: world.specialistOne.id,
        specialistType: 'Psychologist',
        active: true,
      });

      const specChildrenAfterRelink = await authGet('/api/specialist/children', specToken);
      expect(specChildrenAfterRelink.status).toBe(200);
      expect(specChildrenAfterRelink.body).toHaveLength(1);
      expect(specChildrenAfterRelink.body[0].specialistType).toBe('Psychologist');
    });
  });

  describe('403 access denial for unlinked specialists even with a valid token (FR-M2-06)', () => {
    it('denies a never-linked specialist with 403 on child profile and all child-scoped endpoints', async () => {
      const world = await setupWorld();
      const unlinkedSpecToken = await loginUser(world.specialistTwo.email, TEST_PASSWORD);

      const childRes = await authGet(`/api/children/${world.child.id}`, unlinkedSpecToken);
      expect(childRes.status).toBe(403);
      expect(childRes.body).toEqual({ error: 'You do not have access to this child.' });

      for (const [method, suffix] of CHILD_SUB_ENDPOINTS) {
        const res = await request(app)
          [method](`/api/children/${world.child.id}/${suffix}`)
          .set('Authorization', `Bearer ${unlinkedSpecToken}`);

        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: 'You do not have access to this child.' });
      }
    });

    it('revokes access immediately with 403 after unlink even when reusing the exact same valid JWT, and restores after re-link', async () => {
      const world = await setupWorld();
      const parentToken = await loginUser(world.parent.email, TEST_PASSWORD);
      const specToken = await loginUser(world.specialistOne.email, TEST_PASSWORD);

      const linkRes = await authPost(`/api/children/${world.child.id}/specialists`, parentToken, {
        email: world.specialistOne.email,
        specialistType: 'Doctor',
      });
      expect(linkRes.status).toBe(201);

      const allowedBeforeUnlink = await authGet(`/api/children/${world.child.id}`, specToken);
      expect(allowedBeforeUnlink.status).toBe(200);
      expect(allowedBeforeUnlink.body.id).toBe(world.child.id);

      // M3 events endpoint (WEB-44) is implemented, so a linked specialist gets 200
      const subRouteBeforeUnlink = await authGet(
        `/api/children/${world.child.id}/events?week=2026-11-09`,
        specToken
      );
      expect(subRouteBeforeUnlink.status).toBe(200);

      const unlinkRes = await authDelete(
        `/api/children/${world.child.id}/specialists/${world.specialistOne.id}`,
        parentToken
      );
      expect(unlinkRes.status).toBe(204);

      // Reuse the exact same valid JWT issued before unlink (must now get 403).
      const deniedChildProfile = await authGet(`/api/children/${world.child.id}`, specToken);
      expect(deniedChildProfile.status).toBe(403);
      expect(deniedChildProfile.body).toEqual({ error: 'You do not have access to this child.' });

      for (const [method, suffix] of CHILD_SUB_ENDPOINTS) {
        const res = await request(app)
          [method](`/api/children/${world.child.id}/${suffix}`)
          .set('Authorization', `Bearer ${specToken}`);

        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: 'You do not have access to this child.' });
      }

      const specChildrenRes = await authGet('/api/specialist/children', specToken);
      expect(specChildrenRes.status).toBe(200);
      expect(specChildrenRes.body).toEqual([]);

      // Re-linking restores access for the exact same JWT without re-login.
      const relinkRes = await authPost(`/api/children/${world.child.id}/specialists`, parentToken, {
        email: world.specialistOne.email,
        specialistType: 'Coach',
      });
      expect(relinkRes.status).toBe(201);

      const allowedAfterRelink = await authGet(`/api/children/${world.child.id}`, specToken);
      expect(allowedAfterRelink.status).toBe(200);
      expect(allowedAfterRelink.body.id).toBe(world.child.id);
    });

    it('rejects unauthenticated requests with 401 and blocks other parents or other children with 403', async () => {
      const world = await setupWorld();
      const unauthRes = await request(app).get(`/api/children/${world.child.id}`);
      expect(unauthRes.status).toBe(401);

      const otherParentToken = await loginUser(world.otherParent.email, TEST_PASSWORD);
      const otherChildToken = await loginUser(world.otherChildUser.email, TEST_PASSWORD);
      const ownChildToken = await loginUser(world.childUser.email, TEST_PASSWORD);

      const otherParentGet = await authGet(`/api/children/${world.child.id}`, otherParentToken);
      expect(otherParentGet.status).toBe(403);
      expect(otherParentGet.body).toEqual({ error: 'Forbidden: you do not have access to this child.' });

      const otherParentAddSpec = await authPost(`/api/children/${world.child.id}/specialists`, otherParentToken, {
        email: world.specialistOne.email,
        specialistType: 'Teacher',
      });
      expect(otherParentAddSpec.status).toBe(403);

      const otherChildGet = await authGet(`/api/children/${world.child.id}`, otherChildToken);
      expect(otherChildGet.status).toBe(403);

      const ownChildGet = await authGet(`/api/children/${world.child.id}`, ownChildToken);
      expect(ownChildGet.status).toBe(200);
      expect(ownChildGet.body).toEqual(world.child);
    });
  });

  describe('Seeded synthetic personas end-to-end M2 smoke test', () => {
    it('verifies Ayse, Selin (initially unlinked), and Zeynep (unlinked mid-session -> 403)', async () => {
      db = openDatabase(':memory:');
      await seedDatabase(db);
      setDatabase(db);

      const ayseToken = await loginUser('ayse.demir@example.com', DEFAULT_SEED_PASSWORD);
      const selinToken = await loginUser('selin.oz@example.com', DEFAULT_SEED_PASSWORD);
      const zeynepToken = await loginUser('zeynep.arslan@example.com', DEFAULT_SEED_PASSWORD);

      const childrenRes = await authGet('/api/children', ayseToken);
      expect(childrenRes.status).toBe(200);
      expect(childrenRes.body).toHaveLength(1);
      const denizId = childrenRes.body[0].id;

      // Selin is seeded without an active link -> 403
      const selinBeforeLink = await authGet(`/api/children/${denizId}`, selinToken);
      expect(selinBeforeLink.status).toBe(403);

      // Ayse links Selin -> Selin immediately gains access with the same JWT
      const linkSelinRes = await authPost(`/api/children/${denizId}/specialists`, ayseToken, {
        email: 'selin.oz@example.com',
        specialistType: 'Doctor',
      });
      expect(linkSelinRes.status).toBe(201);

      const selinAfterLink = await authGet(`/api/children/${denizId}`, selinToken);
      expect(selinAfterLink.status).toBe(200);

      // Zeynep starts linked (200), then Ayse unlinks Zeynep (204) -> Zeynep immediately gets 403
      const zeynepBeforeUnlink = await authGet(`/api/children/${denizId}`, zeynepToken);
      expect(zeynepBeforeUnlink.status).toBe(200);

      const linkedList = await authGet(`/api/children/${denizId}/specialists`, ayseToken);
      const zeynepRow = linkedList.body.find((s) => s.email === 'zeynep.arslan@example.com');
      expect(zeynepRow).toBeDefined();

      const unlinkZeynep = await authDelete(`/api/children/${denizId}/specialists/${zeynepRow.specialistId}`, ayseToken);
      expect(unlinkZeynep.status).toBe(204);

      const zeynepAfterUnlink = await authGet(`/api/children/${denizId}`, zeynepToken);
      expect(zeynepAfterUnlink.status).toBe(403);
      expect(zeynepAfterUnlink.body).toEqual({ error: 'You do not have access to this child.' });
    });
  });
});