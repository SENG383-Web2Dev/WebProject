import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../src/db.js';

describe('users table', () => {
  it('is created with the expected columns', () => {
    const db = openDatabase(':memory:');
    const columns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);

    expect(columns).toEqual(['id', 'name', 'email', 'password_hash', 'role']);
    db.close();
  });

  it('allows valid roles: parent, specialist, and child', () => {
    const db = openDatabase(':memory:');
    const insert = db.prepare(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
    );

    insert.run('Parent User', 'parent@example.com', 'hash1', 'parent');
    insert.run('Specialist User', 'spec@example.com', 'hash2', 'specialist');
    insert.run('Child User', 'child@example.com', 'hash3', 'child');

    const roles = db.prepare('SELECT role FROM users ORDER BY id ASC').all().map((r) => r.role);
    expect(roles).toEqual(['parent', 'specialist', 'child']);
    db.close();
  });

  it('rejects an invalid role', () => {
    const db = openDatabase(':memory:');
    const insert = db.prepare(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
    );

    expect(() => insert.run('Admin', 'admin@example.com', 'hash', 'admin')).toThrow();
    db.close();
  });

  it('enforces unique email addresses case-insensitively', () => {
    const db = openDatabase(':memory:');
    const insert = db.prepare(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
    );

    insert.run('Ayse', 'ayse.demir@example.com', 'hash1', 'parent');
    expect(() => insert.run('Ayse 2', 'AYSE.DEMIR@example.com', 'hash2', 'parent')).toThrow();
    db.close();
  });
});

describe('children and specialist_links tables', () => {
  it('creates children and specialist_links with the expected columns', () => {
    const db = openDatabase(':memory:');
    const childCols = db.prepare('PRAGMA table_info(children)').all().map((c) => c.name);
    const linkCols = db.prepare('PRAGMA table_info(specialist_links)').all().map((c) => c.name);

    expect(childCols).toEqual(['id', 'parent_id', 'child_account_id', 'name', 'birth_date']);
    expect(linkCols).toEqual([
      'id',
      'child_id',
      'specialist_id',
      'specialist_type',
      'active',
      'created_at',
    ]);
    db.close();
  });

  it('enforces foreign keys, unique (child_id, specialist_id), and valid active flag', () => {
    const db = openDatabase(':memory:');
    const insertUser = db.prepare(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
    );
    const parentId = Number(
      insertUser.run('Parent', 'p@example.com', 'hash', 'parent').lastInsertRowid
    );
    const specId = Number(
      insertUser.run('Spec', 's@example.com', 'hash', 'specialist').lastInsertRowid
    );

    const childId = Number(
      db
        .prepare('INSERT INTO children (parent_id, name, birth_date) VALUES (?, ?, ?)')
        .run(parentId, 'Kid One', '2019-03-10').lastInsertRowid
    );

    db.prepare(
      'INSERT INTO specialist_links (child_id, specialist_id, specialist_type) VALUES (?, ?, ?)'
    ).run(childId, specId, 'Teacher');

    const link = db.prepare('SELECT active, specialist_type FROM specialist_links').get();
    expect(link).toEqual({ active: 1, specialist_type: 'Teacher' });

    // Duplicate (child_id, specialist_id) fails
    expect(() =>
      db
        .prepare(
          'INSERT INTO specialist_links (child_id, specialist_id, specialist_type) VALUES (?, ?, ?)'
        )
        .run(childId, specId, 'Doctor')
    ).toThrow();

    // Invalid active value fails
    const spec2Id = Number(
      insertUser.run('Spec 2', 's2@example.com', 'hash', 'specialist').lastInsertRowid
    );
    expect(() =>
      db
        .prepare(
          'INSERT INTO specialist_links (child_id, specialist_id, specialist_type, active) VALUES (?, ?, ?, ?)'
        )
        .run(childId, spec2Id, 'Doctor', 2)
    ).toThrow();

    // Missing child FK fails
    expect(() =>
      db
        .prepare(
          'INSERT INTO specialist_links (child_id, specialist_id, specialist_type) VALUES (?, ?, ?)'
        )
        .run(9999, specId, 'Teacher')
    ).toThrow();

    db.close();
  });
});

describe('tasks table (WEB-47)', () => {
  function createChildRecord(db) {
    const insertUser = db.prepare(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
    );
    const parentId = Number(insertUser.run('Parent', 'p@example.com', 'hash', 'parent').lastInsertRowid);
    const childId = Number(
      db
        .prepare('INSERT INTO children (parent_id, name, birth_date) VALUES (?, ?, ?)')
        .run(parentId, 'Kid One', '2019-03-10').lastInsertRowid
    );
    return { parentId, childId };
  }

  it('is created with the TASK columns from the SDD', () => {
    const db = openDatabase(':memory:');
    const columns = db.prepare('PRAGMA table_info(tasks)').all().map((c) => c.name);

    expect(columns).toEqual([
      'id',
      'child_id',
      'assigned_by',
      'title',
      'description',
      'development_area',
      'due_date',
      'status',
      'done_at',
      'created_at',
    ]);
    db.close();
  });

  it('stores a task as pending with no done time by default', () => {
    const db = openDatabase(':memory:');
    const { parentId, childId } = createChildRecord(db);
    db.prepare(
      'INSERT INTO tasks (child_id, assigned_by, title, development_area, due_date) VALUES (?, ?, ?, ?, ?)'
    ).run(childId, parentId, 'Read a book', 'Language', '2026-11-18');

    const task = db.prepare('SELECT status, done_at, created_at FROM tasks').get();
    expect(task.status).toBe('pending');
    expect(task.done_at).toBeNull();
    expect(task.created_at).toBeDefined();
    db.close();
  });

  it('rejects an unknown status, a missing title and a missing child', () => {
    const db = openDatabase(':memory:');
    const { parentId, childId } = createChildRecord(db);
    const insert = db.prepare(
      'INSERT INTO tasks (child_id, assigned_by, title, development_area, due_date, status) VALUES (?, ?, ?, ?, ?, ?)'
    );

    expect(() => insert.run(childId, parentId, 'Bad', 'Language', '2026-11-18', 'started')).toThrow();
    expect(() => insert.run(childId, parentId, null, 'Language', '2026-11-18', 'pending')).toThrow();
    expect(() => insert.run(9999, parentId, 'No child', 'Language', '2026-11-18', 'pending')).toThrow();
    db.close();
  });

  it('replaces the WEB-23 sample tasks table in an existing database file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'web47-'));
    const path = join(dir, 'old.db');
    const oldDb = new DatabaseSync(path);
    oldDb.exec(`CREATE TABLE tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );`);
    oldDb.prepare('INSERT INTO tasks (title) VALUES (?)').run('Old sample task');
    oldDb.close();

    const db = openDatabase(path);
    const columns = db.prepare('PRAGMA table_info(tasks)').all().map((c) => c.name);
    expect(columns).toContain('child_id');
    expect(columns).not.toContain('done');
    expect(db.prepare('SELECT COUNT(*) AS count FROM tasks').get().count).toBe(0);
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
