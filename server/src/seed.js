import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import bcrypt from 'bcryptjs';
import { openDatabase } from './db.js';

const BCRYPT_ROUNDS = 10;

export const DEFAULT_SEED_PASSWORD = 'password123';

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

// Synthetic M4 tasks for the sample child (FR-M4-01), due in the week of the v0.1 demo (16-22 Nov 2026).
// One task is already done so that both statuses can be shown (FR-M4-04).
export const SAMPLE_TASKS = [
  {
    childName: 'Deniz Demir',
    assignedByEmail: 'mehmet.kaya@example.com',
    title: 'Finish a 24-piece puzzle',
    description: 'Complete the animal puzzle without help.',
    developmentArea: 'Cognitive',
    dueDate: '2026-11-17',
    status: 'done',
  },
  {
    childName: 'Deniz Demir',
    assignedByEmail: 'mehmet.kaya@example.com',
    title: 'Read a picture book aloud',
    description: 'Read one short picture book aloud to a parent.',
    developmentArea: 'Language',
    dueDate: '2026-11-18',
    status: 'pending',
  },
  {
    childName: 'Deniz Demir',
    assignedByEmail: 'ayse.demir@example.com',
    title: 'Button up your own shirt',
    description: 'Button the school shirt in the morning before breakfast.',
    developmentArea: 'Self-care',
    dueDate: '2026-11-19',
    status: 'pending',
  },
  {
    childName: 'Deniz Demir',
    assignedByEmail: 'zeynep.arslan@example.com',
    title: 'Play a turn-taking board game',
    description: 'Play one board game with a family member and wait for your turn.',
    developmentArea: 'Social-emotional',
    dueDate: '2026-11-20',
    status: 'pending',
  },
];

/**
 * Populate synthetic seed users, child profiles, initial specialist links, and sample tasks (idempotent).
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {Promise<{ tasksInserted: number, usersInserted: number, childrenInserted: number, linksInserted: number }>}
 */
export async function seedDatabase(db) {
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

  // Tasks need the child and the assigning user, so they are seeded last
  let tasksInserted = 0;
  const { count: taskCount } = db.prepare('SELECT COUNT(*) AS count FROM tasks').get();
  if (taskCount === 0) {
    const findChildByName = db.prepare('SELECT id FROM children WHERE name = ?');
    const insertTask = db.prepare(
      `INSERT INTO tasks (child_id, assigned_by, title, description, development_area, due_date, status, done_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const task of SAMPLE_TASKS) {
      const childRow = findChildByName.get(task.childName);
      const assigner = findUser.get(task.assignedByEmail.trim().toLowerCase());
      if (childRow && assigner) {
        insertTask.run(
          childRow.id,
          assigner.id,
          task.title,
          task.description,
          task.developmentArea,
          task.dueDate,
          task.status,
          task.status === 'done' ? `${task.dueDate} 17:00:00` : null
        );
        tasksInserted += 1;
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
