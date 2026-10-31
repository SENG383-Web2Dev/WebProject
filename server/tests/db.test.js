import { openDatabase } from '../src/db.js';

describe('tasks table', () => {
  it('is created with the expected columns', () => {
    const db = openDatabase(':memory:');
    const columns = db.prepare('PRAGMA table_info(tasks)').all().map((c) => c.name);

    expect(columns).toEqual(['id', 'title', 'done', 'created_at']);
    db.close();
  });

  it('stores a task with done defaulting to 0 and a created_at timestamp', () => {
    const db = openDatabase(':memory:');
    db.prepare('INSERT INTO tasks (title) VALUES (?)').run('Write a test');

    const task = db.prepare('SELECT * FROM tasks').get();
    expect(task.title).toBe('Write a test');
    expect(task.done).toBe(0);
    expect(task.created_at).toBeDefined();
    db.close();
  });

  it('rejects a task without a title', () => {
    const db = openDatabase(':memory:');

    expect(() => db.prepare('INSERT INTO tasks (title) VALUES (?)').run(null)).toThrow();
    db.close();
  });

  it('rejects a done value other than 0 or 1', () => {
    const db = openDatabase(':memory:');

    expect(() =>
      db.prepare('INSERT INTO tasks (title, done) VALUES (?, ?)').run('Bad', 2)
    ).toThrow();
    db.close();
  });
});
