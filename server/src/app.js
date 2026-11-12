import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { getDatabase } from './db.js';
import authRouter from './routes/auth.js';
import childrenRouter from './routes/children.js';
import specialistsRouter from './routes/specialists.js';
import eventsRouter from './routes/events.js';
import { requireAuth } from './middleware/auth.js';
import { requireChildAccess } from './middleware/childAccess.js';

const app = express();

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many API requests. Please try again later.' },
});

app.use(cors());
app.use(express.json());

// Public endpoints (no JWT required)
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Walking skeleton: sample tasks endpoint (WEB-30, removed once M4 replaces it)
app.get('/api/tasks', (req, res) => {
  try {
    const db = getDatabase();
    const tasks = db.prepare('SELECT id, title, done, created_at FROM tasks ORDER BY id ASC').all();
    res.status(200).json(tasks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// M1: Authentication routes (login is public; /me and /logout require JWT)
app.use('/api/auth', authRouter);

// Rate-limit and require a valid JWT on every other /api endpoint (FR-M1-04, NFR-02)
app.use('/api', apiLimiter);
app.use('/api', requireAuth);

// M2: Child access guard (FR-M2-06) + children and specialist-linking routes
app.use('/api/children/:childId', requireChildAccess('parent', 'specialist', 'child'));
app.use('/api/children', childrenRouter);
app.use('/api/specialist', specialistsRouter);

// M3 Weekly schedule (WEB-44)
app.use('/api', eventsRouter);

// Protected API fallback for unmatched routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

// Centralized API error handler
app.use((err, req, res, _next) => {
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body.' });
  }
  const status = err.status || 500;
  const message = status === 500 ? 'Internal server error' : err.message;
  return res.status(status).json({ error: message });
});

export default app;