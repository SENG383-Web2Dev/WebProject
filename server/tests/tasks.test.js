import request from 'supertest';
import app from '../src/app.js';
import { openDatabase, setDatabase } from '../src/db.js';
import { signToken } from '../src/services/authService.js';
import { DEVELOPMENT_AREAS, validateTask } from '../src/services/taskService.js';

function createUser(db, { name, email, role }) {
  const result = db
    .prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(name, email, 'test-hash', role);
  const user = { id: Number(result.lastInsertRowid), name, email, role };
  return { ...user, token: signToken(user) };
}

function createChild(db, { parentId, childAccountId, name }) {
  const result = db
    .prepare('INSERT INTO children (parent_id, child_account_id, name, birth_date) VALUES (?, ?, ?, ?)')
    .run(parentId, childAccountId, name, '2018-05-14');
  return { id: Number(result.lastInsertRowid), name };
}

function linkSpecialist(db, childId, specialistId, active = 1) {
  db.prepare(
    'INSERT INTO specialist_links (child_id, specialist_id, specialist_type, active) VALUES (?, ?, ?, ?)'
  ).run(childId, specialistId, 'Teacher', active);
}

const VALID_TASK = {
  title: 'Read for 20 minutes',
  description: 'Read a picture book before bed.',
  developmentArea: 'Language',
  dueDate: '2026-11-18',
};

describe('validateTask (FR-M4-05, FR-M4-06)', () => {
  it('accepts a complete task and a task without a description', () => {
    expect(validateTask(VALID_TASK)).toBeNull();
    expect(validateTask({ ...VALID_TASK, description: undefined })).toBeNull();
  });

  it.each([
    [{ ...VALID_TASK, title: undefined }, 'Title is required.'],
    [{ ...VALID_TASK, title: '   ' }, 'Title is required.'],
    [{ ...VALID_TASK, dueDate: undefined }, 'Due date is required.'],
    [{ ...VALID_TASK, dueDate: '' }, 'Due date is required.'],
    [{ ...VALID_TASK, dueDate: '18.11.2026' }, 'Due date must be a date in the format YYYY-MM-DD.'],
    [{ ...VALID_TASK, dueDate: '2026-02-30' }, 'Due date must be a date in the format YYYY-MM-DD.'],
    [{ ...VALID_TASK, description: 42 }, 'Description must be text.'],
  ])('rejects %j', (body, message) => {
    expect(validateTask(body)).toBe(message);
  });

  it('accepts only the fixed list of development areas', () => {
    expect(DEVELOPMENT_AREAS).toEqual(['Language', 'Motor', 'Social-emotional', 'Cognitive', 'Self-care']);
    for (const area of DEVELOPMENT_AREAS) {
      expect(validateTask({ ...VALID_TASK, developmentArea: area })).toBeNull();
    }
    expect(validateTask({ ...VALID_TASK, developmentArea: 'Sports' })).toMatch(/^Development area must be one of/);
    expect(validateTask({ ...VALID_TASK, developmentArea: undefined })).toMatch(/^Development area must be one of/);
  });
});

describe('Tasks API (M4, WEB-47)', () => {
  let db;
  let parent;
  let otherParent;
  let linkedSpecialist;
  let unlinkedSpecialist;
  let formerSpecialist;
  let childAccount;
  let otherChildAccount;
  let child;
  let otherChild;

  beforeEach(() => {
    db = openDatabase(':memory:');
    setDatabase(db);

    parent = createUser(db, { name: 'Ayşe Demir', email: 'ayse@example.com', role: 'parent' });
    otherParent = createUser(db, { name: 'Kemal Yılmaz', email: 'kemal@example.com', role: 'parent' });
    linkedSpecialist = createUser(db, { name: 'Mehmet Kaya', email: 'mehmet@example.com', role: 'specialist' });
    unlinkedSpecialist = createUser(db, { name: 'Selin Öz', email: 'selin@example.com', role: 'specialist' });
    formerSpecialist = createUser(db, { name: 'Zeynep Arslan', email: 'zeynep@example.com', role: 'specialist' });
    childAccount = createUser(db, { name: 'Deniz Demir', email: 'deniz@example.com', role: 'child' });
    otherChildAccount = createUser(db, { name: 'Ece Yılmaz', email: 'ece@example.com', role: 'child' });

    child = createChild(db, { parentId: parent.id, childAccountId: childAccount.id, name: 'Deniz Demir' });
    otherChild = createChild(db, {
      parentId: otherParent.id,
      childAccountId: otherChildAccount.id,
      name: 'Ece Yılmaz',
    });

    linkSpecialist(db, child.id, linkedSpecialist.id);
    linkSpecialist(db, child.id, formerSpecialist.id, 0);
  });

  afterEach(() => {
    db.close();
    setDatabase(null);
  });

  function assign(user, childId, body = VALID_TASK) {
    return request(app)
      .post(`/api/children/${childId}/tasks`)
      .set('Authorization', `Bearer ${user.token}`)
      .send(body);
  }

  function list(user, childId) {
    return request(app)
      .get(`/api/children/${childId}/tasks`)
      .set('Authorization', `Bearer ${user.token}`);
  }

  function markDone(user, taskId) {
    return request(app)
      .patch(`/api/tasks/${taskId}/done`)
      .set('Authorization', `Bearer ${user.token}`);
  }

  describe('POST /api/children/:childId/tasks', () => {
    it('lets a linked specialist assign a pending task (FR-M4-01)', async () => {
      const res = await assign(linkedSpecialist, child.id);

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.any(Number),
        childId: child.id,
        assignedBy: { id: linkedSpecialist.id, name: 'Mehmet Kaya' },
        title: 'Read for 20 minutes',
        description: 'Read a picture book before bed.',
        developmentArea: 'Language',
        dueDate: '2026-11-18',
        status: 'pending',
        doneAt: null,
        createdAt: expect.any(String),
      });
    });

    it('lets the parent assign a task and stores an empty description as null', async () => {
      const res = await assign(parent, child.id, { ...VALID_TASK, title: '  Tidy your room  ', description: '  ' });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Tidy your room');
      expect(res.body.description).toBeNull();
      expect(res.body.assignedBy).toEqual({ id: parent.id, name: 'Ayşe Demir' });
    });

    it('returns 400 without a title or a due date and saves nothing (FR-M4-05)', async () => {
      const noTitle = await assign(parent, child.id, { ...VALID_TASK, title: '' });
      const noDueDate = await assign(parent, child.id, { ...VALID_TASK, dueDate: undefined });

      expect(noTitle.status).toBe(400);
      expect(noTitle.body).toEqual({ error: 'Title is required.' });
      expect(noDueDate.status).toBe(400);
      expect(noDueDate.body).toEqual({ error: 'Due date is required.' });
      expect(db.prepare('SELECT COUNT(*) AS count FROM tasks').get().count).toBe(0);
    });

    it('returns 400 for a development area outside the fixed list (FR-M4-06)', async () => {
      const res = await assign(parent, child.id, { ...VALID_TASK, developmentArea: 'Sports' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/^Development area must be one of/);
    });

    it('returns 403 when the child tries to assign a task', async () => {
      const res = await assign(childAccount, child.id);

      expect(res.status).toBe(403);
    });

    it('returns 403 for an unlinked specialist, a former specialist and another parent (FR-M2-06)', async () => {
      for (const user of [unlinkedSpecialist, formerSpecialist, otherParent]) {
        const res = await assign(user, child.id);
        expect(res.status).toBe(403);
      }
      expect(db.prepare('SELECT COUNT(*) AS count FROM tasks').get().count).toBe(0);
    });

    it('returns 401 without a token and 404 for an unknown child', async () => {
      const noToken = await request(app).post(`/api/children/${child.id}/tasks`).send(VALID_TASK);
      const unknownChild = await assign(parent, 9999);

      expect(noToken.status).toBe(401);
      expect(unknownChild.status).toBe(404);
    });
  });

  describe('GET /api/children/:childId/tasks', () => {
    beforeEach(async () => {
      await assign(linkedSpecialist, child.id, { ...VALID_TASK, title: 'Later task', dueDate: '2026-11-20' });
      await assign(parent, child.id, { ...VALID_TASK, title: 'Earlier task', dueDate: '2026-11-17' });
      await assign(otherParent, otherChild.id, { ...VALID_TASK, title: 'Other child task' });
    });

    it('shows the parent and the linked specialist all tasks of the child with status and assigner (FR-M4-04)', async () => {
      for (const user of [parent, linkedSpecialist]) {
        const res = await list(user, child.id);

        expect(res.status).toBe(200);
        expect(res.body.map((task) => task.title)).toEqual(['Earlier task', 'Later task']);
        expect(res.body.map((task) => task.status)).toEqual(['pending', 'pending']);
        expect(res.body.map((task) => task.assignedBy.name)).toEqual(['Ayşe Demir', 'Mehmet Kaya']);
      }
    });

    it('shows the child only their own tasks (FR-M4-02)', async () => {
      const own = await list(childAccount, child.id);
      const other = await list(childAccount, otherChild.id);

      expect(own.status).toBe(200);
      expect(own.body.map((task) => task.title)).toEqual(['Earlier task', 'Later task']);
      expect(other.status).toBe(403);
    });

    it('returns 403 for specialists without an active link (FR-M2-06)', async () => {
      for (const user of [unlinkedSpecialist, formerSpecialist]) {
        const res = await list(user, child.id);
        expect(res.status).toBe(403);
      }
    });

    it('returns an empty list when the child has no tasks', async () => {
      db.prepare('DELETE FROM tasks').run();
      const res = await list(parent, child.id);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('PATCH /api/tasks/:id/done', () => {
    let taskId;
    let otherTaskId;

    beforeEach(async () => {
      taskId = (await assign(linkedSpecialist, child.id)).body.id;
      otherTaskId = (await assign(otherParent, otherChild.id)).body.id;
    });

    it('lets the child mark their own task as done, and the assigner then sees it as done (FR-M4-03, FR-M4-04)', async () => {
      const res = await markDone(childAccount, taskId);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('done');
      expect(res.body.doneAt).toEqual(expect.any(String));

      const seenBySpecialist = await list(linkedSpecialist, child.id);
      expect(seenBySpecialist.body[0]).toMatchObject({ id: taskId, status: 'done' });
    });

    it('keeps the first done time when a done task is marked again', async () => {
      db.prepare("UPDATE tasks SET status = 'done', done_at = '2026-11-17 10:00:00' WHERE id = ?").run(taskId);

      const res = await markDone(childAccount, taskId);

      expect(res.status).toBe(200);
      expect(res.body.doneAt).toBe('2026-11-17 10:00:00');
    });

    it("returns 403 when a child marks another child's task", async () => {
      const res = await markDone(childAccount, otherTaskId);

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'You can only mark your own tasks as done.' });
      expect(db.prepare('SELECT status FROM tasks WHERE id = ?').get(otherTaskId).status).toBe('pending');
    });

    it('returns 403 for the parent and the specialist, who cannot mark tasks as done', async () => {
      for (const user of [parent, linkedSpecialist]) {
        const res = await markDone(user, taskId);
        expect(res.status).toBe(403);
      }
    });

    it('returns 404 for an unknown task and 400 for an invalid id', async () => {
      const unknown = await markDone(childAccount, 9999);
      const invalid = await markDone(childAccount, 'abc');

      expect(unknown.status).toBe(404);
      expect(unknown.body).toEqual({ error: 'Task not found.' });
      expect(invalid.status).toBe(400);
      expect(invalid.body).toEqual({ error: 'Invalid task id.' });
    });
  });

  it('no longer serves the walking-skeleton GET /api/tasks without a token', async () => {
    const res = await request(app).get('/api/tasks');

    expect(res.status).toBe(401);
  });
});
