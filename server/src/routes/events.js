import { Router } from 'express';
import { getDatabase } from '../db.js';
import {
  validateEvent,
  getWeekRange,
  canModifyEvent,
  listEventsForWeek,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
} from '../services/eventService.js';
 
const router = Router();
 
function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
 
// The logged-in user's id. Login (WEB-36) and the auth middleware (WEB-37) will set req.user;
// until then it is null, and the creator check below is skipped.
function currentUserId(req) {
  return req.user ? req.user.id : null;
}
 
// GET /api/children/:childId/events?week=YYYY-MM-DD  (FR-M3-02, FR-M3-03)
router.get('/children/:childId/events', (req, res) => {
  const childId = parseId(req.params.childId);
  if (!childId) {
    return res.status(400).json({ error: 'Invalid child id' });
  }
  const range = getWeekRange(req.query.week);
  if (!range) {
    return res.status(400).json({ error: 'week must be a date in the format YYYY-MM-DD' });
  }
  try {
    res.status(200).json(listEventsForWeek(getDatabase(), childId, range));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});
 
// POST /api/children/:childId/events  (FR-M3-01, FR-M3-04)
router.post('/children/:childId/events', (req, res) => {
  const childId = parseId(req.params.childId);
  if (!childId) {
    return res.status(400).json({ error: 'Invalid child id' });
  }
  const message = validateEvent(req.body);
  if (message) {
    return res.status(400).json({ error: message });
  }
  try {
    const { title, startTime, endTime } = req.body;
    const event = createEvent(getDatabase(), {
      childId,
      createdBy: currentUserId(req),
      title,
      startTime,
      endTime,
    });
    res.status(201).json(event);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create event' });
  }
});
 
// Finds the event for PUT and DELETE, or sends 400/404/403 and returns null
function findEditableEvent(req, res) {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Invalid event id' });
    return null;
  }
  const event = getEventById(getDatabase(), id);
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return null;
  }
  const userId = currentUserId(req);
  if (userId !== null && !canModifyEvent(event, userId)) {
    res.status(403).json({ error: 'Only the creator can change this event' });
    return null;
  }
  return event;
}
 
// PUT /api/events/:id  (FR-M3-04, FR-M3-05)
router.put('/events/:id', (req, res) => {
  try {
    const event = findEditableEvent(req, res);
    if (!event) {
      return;
    }
    const message = validateEvent(req.body);
    if (message) {
      return res.status(400).json({ error: message });
    }
    const { title, startTime, endTime } = req.body;
    res.status(200).json(updateEvent(getDatabase(), event.id, { title, startTime, endTime }));
  } catch (error) {
    res.status(500).json({ error: 'Failed to update event' });
  }
});
 
// DELETE /api/events/:id  (FR-M3-05)
router.delete('/events/:id', (req, res) => {
  try {
    const event = findEditableEvent(req, res);
    if (!event) {
      return;
    }
    deleteEvent(getDatabase(), event.id);
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete event' });
  }
});
 
export default router;
