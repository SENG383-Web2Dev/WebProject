import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import bcrypt from 'bcryptjs';
import { openDatabase } from './db.js';

const BCRYPT_ROUNDS = 10;

export const DEFAULT_SEED_PASSWORD = 'password123';

export const SAMPLE_TASKS = [
  'Set up the development environment',
  'Read the SRS document',
  'Try the health endpoint at GET /api/health',
];

// Synthetic personas matching SDD wireframes (no real user data)
export const SAMPLE_USERS = [
  { name: 'Ayşe Demir', email: 'ayse.demir@example.com', role: 'parent' },
  { name: 'Mehmet Kaya', email: 'mehmet.kaya@example.com', role: 'specialist' },
  { name: 'Zeynep Arslan', email: 'zeynep.arslan@example.com', role: 'specialist' },
  { name: 'Selin Öz', email: 'selin.oz@example.com', role: 'specialist' },
  { name: 'Deniz Demir', email: 'deniz.demir@example.com', role: 'child' },
];

/**
 * Populate sample tasks and synthetic seed users (idempotent).
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {Promise<{ tasksInserted: number, usersInserted: number }>}
 */
export async function seedDatabase(db) {
  let tasksInserted = 0;
  const { count: taskCount } = db.prepare('SELECT COUNT(*) AS count FROM tasks').get();
  if (taskCount === 0) {
    const insertTask = db.prepare('INSERT INTO tasks (title) VALUES (?)');
    for (const title of SAMPLE_TASKS) {
      insertTask.run(title);
      tasksInserted += 1;
    }
  }

  let usersInserted = 0;
  const findUser = db.prepare('SELECT id FROM users WHERE email = ?');
  const insertUser = db.prepare(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
  );

  for (const user of SAMPLE_USERS) {
    const email = user.email.trim().toLowerCase();
    const existing = findUser.get(email);
    if (!existing) {
      const passwordHash = await bcrypt.hash(DEFAULT_SEED_PASSWORD, BCRYPT_ROUNDS);
      insertUser.run(user.name, email, passwordHash, user.role);
      usersInserted += 1;
    }
  }

  return { tasksInserted, usersInserted };
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  const db = openDatabase();
  try {
    const { tasksInserted, usersInserted } = await seedDatabase(db);
    console.log(
      tasksInserted > 0
        ? `Seeded ${tasksInserted} sample tasks.`
        : 'Tasks table already populated, skipping tasks seed.'
    );
    console.log(
      usersInserted > 0
        ? `Seeded ${usersInserted} synthetic users.`
        : 'Seed users already exist, skipping users seed.'
    );
  } finally {
    db.close();
  }
}
