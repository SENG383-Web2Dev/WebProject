import { openDatabase } from './db.js';

const SAMPLE_TASKS = [
  'Set up the development environment',
  'Read the SRS document',
  'Try the health endpoint at GET /api/health',
];

const db = openDatabase();

const { count } = db.prepare('SELECT COUNT(*) AS count FROM tasks').get();

if (count === 0) {
  const insert = db.prepare('INSERT INTO tasks (title) VALUES (?)');
  for (const title of SAMPLE_TASKS) {
    insert.run(title);
  }
  console.log(`Seeded ${SAMPLE_TASKS.length} sample tasks.`);
} else {
  console.log(`Tasks table already has ${count} rows, skipping seed.`);
}

db.close();
