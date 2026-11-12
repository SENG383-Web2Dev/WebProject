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

// Synthetic child profile linked to synthetic parent/child accounts
export const SAMPLE_CHILDREN = [
  {
    name: 'Deniz Demir',
    parentEmail: 'ayse.demir@example.com',
    childEmail: 'deniz.demir@example.com',
    birthDate: '2018-05-14',
  },
];

// Initial active specialist links (leaves Selin Öz unlinked so parent can demo linking)
export const SAMPLE_SPECIALIST_LINKS = [
  {
    childName: 'Deniz Demir',
    specialistEmail: 'mehmet.kaya@example.com',
    specialistType: 'Teacher',
  },
  {
    childName: 'Deniz Demir',
    specialistEmail: 'zeynep.arslan@example.com',
    specialistType: 'Psychologist',
  },
];

/**
 * Populate sample tasks, synthetic seed users, child profiles, and initial specialist links (idempotent).
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {Promise<{ tasksInserted: number, usersInserted: number, childrenInserted: number, linksInserted: number }>}
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

  let childrenInserted = 0;
  const findChild = db.prepare('SELECT id FROM children WHERE parent_id = ? AND name = ?');
  const insertChild = db.prepare(
    'INSERT INTO children (parent_id, child_account_id, name, birth_date) VALUES (?, ?, ?, ?)'
  );

  for (const child of SAMPLE_CHILDREN) {
    const parent = findUser.get(child.parentEmail.trim().toLowerCase());
    if (!parent) {
      continue;
    }

    const existingChild = findChild.get(parent.id, child.name);
    if (!existingChild) {
      const childAccount = child.childEmail
        ? findUser.get(child.childEmail.trim().toLowerCase())
        : null;
      insertChild.run(parent.id, childAccount ? childAccount.id : null, child.name, child.birthDate);
      childrenInserted += 1;
    }
  }

  let linksInserted = 0;
  const { count: linkCount } = db.prepare('SELECT COUNT(*) AS count FROM specialist_links').get();
  if (linkCount === 0) {
    const findChildByName = db.prepare('SELECT id FROM children WHERE name = ?');
    const insertLink = db.prepare(
      'INSERT INTO specialist_links (child_id, specialist_id, specialist_type, active) VALUES (?, ?, ?, 1)'
    );

    for (const link of SAMPLE_SPECIALIST_LINKS) {
      const childRow = findChildByName.get(link.childName);
      const specialist = findUser.get(link.specialistEmail.trim().toLowerCase());
      if (childRow && specialist) {
        insertLink.run(childRow.id, specialist.id, link.specialistType);
        linksInserted += 1;
      }
    }
  }

  return { tasksInserted, usersInserted, childrenInserted, linksInserted };
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  const db = openDatabase();
  try {
    const { tasksInserted, usersInserted, childrenInserted, linksInserted } = await seedDatabase(db);
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
    console.log(
      childrenInserted > 0
        ? `Seeded ${childrenInserted} synthetic children.`
        : 'Seed children already exist, skipping children seed.'
    );
    console.log(
      linksInserted > 0
        ? `Seeded ${linksInserted} specialist links.`
        : 'Specialist links already populated, skipping links seed.'
    );
  } finally {
    db.close();
  }
}
