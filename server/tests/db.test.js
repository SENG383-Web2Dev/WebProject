import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db.js';

describe('tasks table', () => {
  it('is created with the expected columns', () => {
    const db = openDatabase(':memory:');
    const columns = db.prepare('PRAGMA table_info(tasks)').all().map((c) => c.name);

    assert.deepEqual(columns, ['id', 'title', 'done', 'created_at']);
    db.close();
  });

  it('stores a task with done defaulting to 0 and a created_at timestamp', () => {
    const db = openDatabase(':memory:');
    db.prepare('INSERT INTO tasks (title) VALUES (?)').run('Write a test');

    const task = db.prepare('SELECT * FROM tasks').get();
    assert.equal(task.title, 'Write a test');
    assert.equal(task.done, 0);
    assert.ok(task.created_at);
    db.close();
  });

  it('rejects a task without a title', () => {
    const db = openDatabase(':memory:');

    assert.throws(() => db.prepare('INSERT INTO tasks (title) VALUES (?)').run(null));
    db.close();
  });

  it('rejects a done value other than 0 or 1', () => {
    const db = openDatabase(':memory:');

    assert.throws(() =>
      db.prepare('INSERT INTO tasks (title, done) VALUES (?, ?)').run('Bad', 2)
    );
    db.close();
  });
});
