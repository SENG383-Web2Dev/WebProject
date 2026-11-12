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
