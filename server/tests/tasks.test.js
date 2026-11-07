import request from 'supertest';
import app from '../src/app.js';
import { openDatabase, setDatabase } from '../src/db.js';

describe('GET /api/tasks', () => {
  let db;

  beforeEach(() => {
    db = openDatabase(':memory:');
    setDatabase(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
      setDatabase(null);
    }
  });

  it('should return 200 OK with an empty array when no tasks exist', async () => {
    const response = await request(app).get('/api/tasks');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toEqual([]);
  });

  it('should return 200 OK with a list of tasks (id, title, done, created_at)', async () => {
    const insert = db.prepare('INSERT INTO tasks (title, done) VALUES (?, ?)');
    insert.run('First sample task', 0);
    insert.run('Second sample task', 1);

    const response = await request(app).get('/api/tasks');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(2);

    expect(response.body[0]).toMatchObject({
      id: 1,
      title: 'First sample task',
      done: 0,
    });
    expect(typeof response.body[0].created_at).toBe('string');

    expect(response.body[1]).toMatchObject({
      id: 2,
      title: 'Second sample task',
      done: 1,
    });
    expect(typeof response.body[1].created_at).toBe('string');
  });

  it('should return 500 when database query fails', async () => {
    db.exec('DROP TABLE tasks;');

    const response = await request(app).get('/api/tasks');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Failed to fetch tasks' });
  });
});
