// WEB-46: Tests for the M3 weekly schedule (events) service and API
import request from 'supertest';
import app from '../src/app.js';
import { openDatabase, setDatabase } from '../src/db.js';
import { signToken } from '../src/services/authService.js';
import { validateEvent, getWeekRange, canModifyEvent } from '../src/services/eventService.js';

// ---------- Service rules (no HTTP) ----------

describe('eventService rules', () => {
  const valid = { title: 'Swimming', startTime: '2026-11-10T14:00', endTime: '2026-11-10T15:00' };

  it('accepts a valid event', () => {
    expect(validateEvent(valid)).toBeNull();
  });

  it('requires a title', () => {
    expect(validateEvent({ ...valid, title: '' })).toBe('Title is required');
    expect(validateEvent({ ...valid, title: '   ' })).toBe('Title is required');
    expect(validateEvent({ ...valid, title: undefined })).toBe('Title is required');
    expect(validateEvent()).toBe('Title is required');
  });

  it('requires times in the format YYYY-MM-DDTHH:MM', () => {
    const message = 'Start and end time must be in the format YYYY-MM-DDTHH:MM';
    expect(validateEvent({ ...valid, startTime: '2026-11-10 14:00' })).toBe(message);
    expect(validateEvent({ ...valid, endTime: 'tomorrow' })).toBe(message);
    expect(validateEvent({ ...valid, startTime: '2026-02-30T10:00' })).toBe(message);
    expect(validateEvent({ ...valid, endTime: '2026-11-10T25:00' })).toBe(message);
  });

  it('rejects an event whose end time is not after its start time (FR-M3-04)', () => {
    const message = 'End time must be after start time';
    expect(validateEvent({ ...valid, endTime: '2026-11-10T13:00' })).toBe(message);
    expect(validateEvent({ ...valid, endTime: valid.startTime })).toBe(message);
  });

  it('turns a week into a 7-day range', () => {
    expect(getWeekRange('2026-11-09')).toEqual({ from: '2026-11-09T00:00', to: '2026-11-16T00:00' });
    expect(getWeekRange('2026-12-28')).toEqual({ from: '2026-12-28T00:00', to: '2027-01-04T00:00' });
  });

  it('returns null for an invalid week', () => {
    expect(getWeekRange(undefined)).toBeNull();
    expect(getWeekRange('2026-11')).toBeNull();
    expect(getWeekRange('2026-13-01')).toBeNull();
  });

  it('lets only the creator modify an event (FR-M3-05)', () => {
    expect(canModifyEvent({ createdBy: 7 }, 7)).toBe(true);
    expect(canModifyEvent({ createdBy: 7 }, 8)).toBe(false);
    expect(canModifyEvent({ createdBy: null }, 7)).toBe(false);
  });
});

// ---------- API ----------

describe('Events API (M3)', () => {
  let db;
  let users;
  let child;
  let otherChild;

  function addUser(name, role) {
    const email = `${name.toLowerCase()}@example.com`;
    const id = Number(
      db
        .prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
        .run(name, email, 'not-used-in-these-tests', role).lastInsertRowid
    );
    return { id, name, email, role, token: `Bearer ${signToken({ id, name, email, role })}` };
  }

  function addChild(parentId, name, childAccountId = null) {
    return Number(
      db
        .prepare('INSERT INTO children (parent_id, child_account_id, name) VALUES (?, ?, ?)')
        .run(parentId, childAccountId, name).lastInsertRowid
    );
  }

  function link(childId, specialistId) {
    db.prepare(
      'INSERT INTO specialist_links (child_id, specialist_id, specialist_type) VALUES (?, ?, ?)'
    ).run(childId, specialistId, 'Teacher');
  }

  function unlink(childId, specialistId) {
    db.prepare('UPDATE specialist_links SET active = 0 WHERE child_id = ? AND specialist_id = ?').run(
      childId,
      specialistId
    );
  }

  const swimming = { title: 'Swimming', startTime: '2026-11-10T14:00', endTime: '2026-11-10T15:00' };

  const addEvent = (user, childId = child, body = swimming) =>
    request(app).post(`/api/children/${childId}/events`).set('Authorization', user.token).send(body);

  const listWeek = (user, week = '2026-11-09', childId = child) =>
    request(app).get(`/api/children/${childId}/events?week=${week}`).set('Authorization', user.token);

  beforeEach(() => {
    db = openDatabase(':memory:');
    setDatabase(db);

    users = {
      parent: addUser('Parent', 'parent'),
      otherParent: addUser('OtherParent', 'parent'),
      teacher: addUser('Teacher', 'specialist'),
      coach: addUser('Coach', 'specialist'),
      unlinked: addUser('Unlinked', 'specialist'),
      kid: addUser('Kid', 'child'),
    };
    child = addChild(users.parent.id, 'Kid', users.kid.id);
    otherChild = addChild(users.otherParent.id, 'Other kid');
    link(child, users.teacher.id);
    link(child, users.coach.id);
  });

  afterEach(() => {
    db.close();
    setDatabase(null);
  });

  describe('authentication and child access', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app).get(`/api/children/${child}/events?week=2026-11-09`);
      expect(res.status).toBe(401);
    });

    it('returns 403 for a specialist who is not linked to the child (FR-M2-06)', async () => {
      expect((await listWeek(users.unlinked)).status).toBe(403);
      expect((await addEvent(users.unlinked)).status).toBe(403);
    });

    it("returns 403 for another child's parent", async () => {
      expect((await listWeek(users.otherParent)).status).toBe(403);
    });

    it('returns 404 for a child that does not exist', async () => {
      expect((await listWeek(users.parent, '2026-11-09', 9999)).status).toBe(404);
    });
  });

  describe('POST /api/children/:childId/events', () => {
    it('lets the parent add an event and records who created it (FR-M3-01)', async () => {
      const res = await addEvent(users.parent);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        childId: child,
        createdBy: users.parent.id,
        title: 'Swimming',
        startTime: '2026-11-10T14:00',
        endTime: '2026-11-10T15:00',
      });
      expect(typeof res.body.id).toBe('number');
    });

    it('lets a linked specialist add an event', async () => {
      const res = await addEvent(users.teacher);
      expect(res.status).toBe(201);
      expect(res.body.createdBy).toBe(users.teacher.id);
    });

    it('does not let the child add an event', async () => {
      expect((await addEvent(users.kid)).status).toBe(403);
    });

    it('trims the title', async () => {
      const res = await addEvent(users.parent, child, { ...swimming, title: '  Swimming  ' });
      expect(res.body.title).toBe('Swimming');
    });

    it('returns 400 when the end time is not after the start time (FR-M3-04)', async () => {
      const res = await addEvent(users.parent, child, { ...swimming, endTime: '2026-11-10T13:00' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'End time must be after start time' });
    });

    it('returns 400 without a title or with an invalid time', async () => {
      expect((await addEvent(users.parent, child, { ...swimming, title: '' })).status).toBe(400);
      expect((await addEvent(users.parent, child, { ...swimming, startTime: 'soon' })).status).toBe(400);
    });
  });

  describe('GET /api/children/:childId/events', () => {
    it('lists only the selected week and child, sorted by start time (FR-M3-02)', async () => {
      await addEvent(users.parent, child, { title: 'Late', startTime: '2026-11-12T16:00', endTime: '2026-11-12T17:00' });
      await addEvent(users.parent, child, { title: 'Early', startTime: '2026-11-09T08:00', endTime: '2026-11-09T09:00' });
      await addEvent(users.parent, child, { title: 'Next week', startTime: '2026-11-16T00:00', endTime: '2026-11-16T01:00' });
      await addEvent(users.otherParent, otherChild, { title: 'Other child', startTime: '2026-11-10T10:00', endTime: '2026-11-10T11:00' });

      const res = await listWeek(users.parent);
      expect(res.status).toBe(200);
      expect(res.body.map((e) => e.title)).toEqual(['Early', 'Late']);
    });

    it('lets the child see their own schedule (FR-M3-03)', async () => {
      await addEvent(users.parent);
      const res = await listWeek(users.kid);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it('returns an empty list for a week without events', async () => {
      const res = await listWeek(users.parent, '2026-12-07');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns 400 without a valid week', async () => {
      const res = await request(app)
        .get(`/api/children/${child}/events`)
        .set('Authorization', users.parent.token);
      expect(res.status).toBe(400);
      expect((await listWeek(users.parent, '09-11-2026')).status).toBe(400);
    });
  });

  describe('PUT and DELETE /api/events/:id', () => {
    let eventId;
    const edited = { title: 'Swimming lesson', startTime: '2026-11-10T14:00', endTime: '2026-11-10T16:00' };

    beforeEach(async () => {
      eventId = (await addEvent(users.teacher)).body.id;
    });

    it('lets the creator edit the event (FR-M3-05)', async () => {
      const res = await request(app).put(`/api/events/${eventId}`).set('Authorization', users.teacher.token).send(edited);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: eventId, title: 'Swimming lesson', endTime: '2026-11-10T16:00' });
    });

    it('does not let another user edit or delete the event', async () => {
      for (const user of [users.coach, users.parent]) {
        const put = await request(app).put(`/api/events/${eventId}`).set('Authorization', user.token).send(edited);
        expect(put.status).toBe(403);
        const del = await request(app).delete(`/api/events/${eventId}`).set('Authorization', user.token);
        expect(del.status).toBe(403);
      }
    });

    it('does not let the child edit the event', async () => {
      const res = await request(app).put(`/api/events/${eventId}`).set('Authorization', users.kid.token).send(edited);
      expect(res.status).toBe(403);
    });

    it('blocks the creator after they are unlinked from the child', async () => {
      unlink(child, users.teacher.id);
      const res = await request(app).put(`/api/events/${eventId}`).set('Authorization', users.teacher.token).send(edited);
      expect(res.status).toBe(403);
    });

    it('validates the edited event', async () => {
      const res = await request(app)
        .put(`/api/events/${eventId}`)
        .set('Authorization', users.teacher.token)
        .send({ ...edited, endTime: '2026-11-10T12:00' });
      expect(res.status).toBe(400);
    });

    it('lets the creator delete the event', async () => {
      const res = await request(app).delete(`/api/events/${eventId}`).set('Authorization', users.teacher.token);
      expect(res.status).toBe(204);
      expect((await listWeek(users.parent)).body).toEqual([]);
    });

    it('returns 404 for an unknown event and 400 for an invalid id', async () => {
      expect((await request(app).delete('/api/events/9999').set('Authorization', users.teacher.token)).status).toBe(404);
      expect((await request(app).put('/api/events/abc').set('Authorization', users.teacher.token).send(edited)).status).toBe(400);
    });
  });
});
describe('GET /api/auth/me for a child account (WEB-45)', () => {
  let db;

  beforeEach(() => {
    db = openDatabase(':memory:');
    setDatabase(db);
  });

  afterEach(() => {
    db.close();
    setDatabase(null);
  });

  it("returns the child's own profile id so the client can load the schedule", async () => {
    const insertUser = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)');
    const parentId = Number(insertUser.run('Parent', 'p@example.com', 'x', 'parent').lastInsertRowid);
    const kidId = Number(insertUser.run('Kid', 'k@example.com', 'x', 'child').lastInsertRowid);
    const profileId = Number(
      db.prepare('INSERT INTO children (parent_id, child_account_id, name) VALUES (?, ?, ?)').run(parentId, kidId, 'Kid')
        .lastInsertRowid
    );

    const kidToken = signToken({ id: kidId, name: 'Kid', email: 'k@example.com', role: 'child' });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${kidToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: kidId, role: 'child', childProfileId: profileId });

    const parentToken = signToken({ id: parentId, name: 'Parent', email: 'p@example.com', role: 'parent' });
    const parentRes = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${parentToken}`);
    expect(parentRes.body.childProfileId).toBeUndefined();
  });
});
