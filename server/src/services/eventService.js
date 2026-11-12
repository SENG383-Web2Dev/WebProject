const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
// A week is the date of the Monday that starts it, for example "2026-11-09"
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
 
function isRealDateTime(value) {
  if (typeof value !== 'string' || !DATETIME_PATTERN.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}
 
// Checks the body of a new or edited event. Returns an error message, or null if the event is valid.
export function validateEvent({ title, startTime, endTime } = {}) {
  if (typeof title !== 'string' || title.trim() === '') {
    return 'Title is required';
  }
  if (!isRealDateTime(startTime) || !isRealDateTime(endTime)) {
    return 'Start and end time must be in the format YYYY-MM-DDTHH:MM';
  }
  // Same format on both sides, so comparing the strings compares the times
  if (endTime <= startTime) {
    return 'End time must be after start time';
  }
  return null;
}
 
// Turns "2026-11-09" into the range [2026-11-09T00:00, 2026-11-16T00:00). Returns null if the week is invalid.
export function getWeekRange(week) {
  if (typeof week !== 'string' || !DATE_PATTERN.test(week)) {
    return null;
  }
  const start = new Date(`${week}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || !start.toISOString().startsWith(week)) {
    return null;
  }
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return {
    from: `${week}T00:00`,
    to: `${end.toISOString().slice(0, 10)}T00:00`,
  };
}
 
// Only the user who created an event may edit or delete it (FR-M3-05)
export function canModifyEvent(event, userId) {
  return event.createdBy !== null && event.createdBy === userId;
}
 
function toEvent(row) {
  return {
    id: row.id,
    childId: row.child_id,
    createdBy: row.created_by,
    title: row.title,
    startTime: row.start_time,
    endTime: row.end_time,
  };
}
 
const COLUMNS = 'id, child_id, created_by, title, start_time, end_time';
 
export function listEventsForWeek(db, childId, range) {
  const rows = db
    .prepare(
      `SELECT ${COLUMNS} FROM events
       WHERE child_id = ? AND start_time >= ? AND start_time < ?
       ORDER BY start_time ASC`
    )
    .all(childId, range.from, range.to);
  return rows.map(toEvent);
}
 
export function getEventById(db, id) {
  const row = db.prepare(`SELECT ${COLUMNS} FROM events WHERE id = ?`).get(id);
  return row ? toEvent(row) : null;
}
 
export function createEvent(db, { childId, createdBy, title, startTime, endTime }) {
  const result = db
    .prepare(
      'INSERT INTO events (child_id, created_by, title, start_time, end_time) VALUES (?, ?, ?, ?, ?)'
    )
    .run(childId, createdBy ?? null, title.trim(), startTime, endTime);
  return getEventById(db, Number(result.lastInsertRowid));
}
 
export function updateEvent(db, id, { title, startTime, endTime }) {
  db.prepare('UPDATE events SET title = ?, start_time = ?, end_time = ? WHERE id = ?').run(
    title.trim(),
    startTime,
    endTime,
    id
  );
  return getEventById(db, id);
}
 
export function deleteEvent(db, id) {
  db.prepare('DELETE FROM events WHERE id = ?').run(id);
}