import express from 'express';
import cors from 'cors';
import { getDatabase } from './db.js';

const app = express();

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Walking skeleton: sample tasks endpoint (WEB-30)
app.get('/api/tasks', (req, res) => {
  try {
    const db = getDatabase();
    const tasks = db.prepare('SELECT id, title, done, created_at FROM tasks ORDER BY id ASC').all();
    res.status(200).json(tasks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

export default app;
