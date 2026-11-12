import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('parent', 'specialist', 'child'))
  );

  CREATE TABLE IF NOT EXISTS children (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    child_account_id INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    birth_date TEXT
  );

  CREATE TABLE IF NOT EXISTS specialist_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    specialist_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    specialist_type TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (child_id, specialist_id)
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (end_time > start_time)
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    development_area TEXT NOT NULL,
    due_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
    done_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

// WEB-47 replaces the WEB-23 sample tasks table (id, title, done, created_at) with the M4 TASK entity.
// A local database created before WEB-47 still has the sample table, which only held demo rows,
// so it is dropped and created again with the new columns.
function dropSampleTasksTable(db) {
  const columns = db.prepare('PRAGMA table_info(tasks)').all().map((column) => column.name);
  if (columns.length > 0 && !columns.includes('child_id')) {
    db.exec('DROP TABLE tasks;');
  }
}

export function openDatabase(path = process.env.DB_PATH || './data/app.db') {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }

  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  dropSampleTasksTable(db);
  db.exec(SCHEMA);
  return db;
}

let currentDb = null;

export function getDatabase() {
  if (!currentDb) {
    currentDb = openDatabase();
  }
  return currentDb;
}

export function setDatabase(db) {
  currentDb = db;
}
