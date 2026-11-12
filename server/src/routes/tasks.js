// M4 Tasks: HTTP endpoints for tasks (see SDD section 4)
import { Router } from 'express';
import { getDatabase } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { parsePositiveId } from '../services/linkService.js';
import {
  validateTask,
  listTasksForChild,
  getTaskById,
  createTask,
  isOwnTask,
  markTaskDone,
} from '../services/taskService.js';

const router = Router();

// Requests under /api/children/:childId already passed requireChildAccess in app.js (FR-M2-06):
// only the child's parent, an actively linked specialist or the child's own account get this far.

// GET /api/children/:childId/tasks  (FR-M4-02, FR-M4-04)
// The parent and linked specialists see all of the child's tasks with their status.
// A child account can only reach its own child id, so it sees only its own tasks.
router.get('/children/:childId/tasks', (req, res, next) => {
  try {
    const childId = parsePositiveId(req.params.childId, 'child id');
    res.status(200).json(listTasksForChild(getDatabase(), childId));
  } catch (error) {
    next(error);
  }
});

// POST /api/children/:childId/tasks  (FR-M4-01, FR-M4-05, FR-M4-06)
// The parent and linked specialists assign tasks; the child cannot.
router.post('/children/:childId/tasks', requireRole('parent', 'specialist'), (req, res, next) => {
  try {
    const childId = parsePositiveId(req.params.childId, 'child id');
    const body = req.body ?? {};
    const message = validateTask(body);
    if (message) {
      return res.status(400).json({ error: message });
    }
    const { title, description, developmentArea, dueDate } = body;
    const task = createTask(getDatabase(), {
      childId,
      assignedBy: req.user.id,
      title,
      description,
      developmentArea,
      dueDate,
    });
    return res.status(201).json(task);
  } catch (error) {
    return next(error);
  }
});

// PATCH /api/tasks/:id/done  (FR-M4-03)
// Only the child account marks a task as done, and only one of its own tasks.
router.patch('/tasks/:id/done', requireRole('child'), (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id, 'task id');
    const db = getDatabase();
    const task = getTaskById(db, id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found.' });
    }
    if (!isOwnTask(db, task, req.user.id)) {
      return res.status(403).json({ error: 'You can only mark your own tasks as done.' });
    }
    return res.status(200).json(markTaskDone(db, id));
  } catch (error) {
    return next(error);
  }
});

export default router;
