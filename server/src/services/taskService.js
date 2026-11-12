// M4 Tasks: validation and database access for tasks (see SDD sections 2 to 4)

// Fixed list of development areas (FR-M4-06); the assign form offers the same list as a choice
export const DEVELOPMENT_AREAS = ['Language', 'Motor', 'Social-emotional', 'Cognitive', 'Self-care'];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

// Checks the body of a new task. Returns an error message, or null if the task is valid.
// Title and due date are required (FR-M4-05); the development area must come from the fixed list (FR-M4-06).
export function validateTask({ title, description, developmentArea, dueDate } = {}) {
  if (typeof title !== 'string' || title.trim() === '') {
    return 'Title is required.';
  }
  if (dueDate === undefined || dueDate === null || dueDate === '') {
    return 'Due date is required.';
  }
  if (!isRealDate(dueDate)) {
    return 'Due date must be a date in the format YYYY-MM-DD.';
  }
  if (!DEVELOPMENT_AREAS.includes(developmentArea)) {
    return `Development area must be one of: ${DEVELOPMENT_AREAS.join(', ')}.`;
  }
  if (description !== undefined && description !== null && typeof description !== 'string') {
    return 'Description must be text.';
  }
  return null;
}

// Each task comes back with the name of the user who assigned it (FR-M4-04)
const SELECT_TASKS = `
  SELECT t.id, t.child_id, t.assigned_by, u.name AS assigned_by_name, t.title, t.description,
         t.development_area, t.due_date, t.status, t.done_at, t.created_at
  FROM tasks t
  LEFT JOIN users u ON u.id = t.assigned_by`;

function toTask(row) {
  return {
    id: row.id,
    childId: row.child_id,
    assignedBy: row.assigned_by === null ? null : { id: row.assigned_by, name: row.assigned_by_name },
    title: row.title,
    description: row.description,
    developmentArea: row.development_area,
    dueDate: row.due_date,
    status: row.status,
    doneAt: row.done_at,
    createdAt: row.created_at,
  };
}

// All tasks of one child, the earliest due date first
export function listTasksForChild(db, childId) {
  const rows = db
    .prepare(`${SELECT_TASKS} WHERE t.child_id = ? ORDER BY t.due_date ASC, t.id ASC`)
    .all(childId);
  return rows.map(toTask);
}

export function getTaskById(db, id) {
  const row = db.prepare(`${SELECT_TASKS} WHERE t.id = ?`).get(id);
  return row ? toTask(row) : null;
}

// A new task always starts as pending
export function createTask(db, { childId, assignedBy, title, description, developmentArea, dueDate }) {
  const text = typeof description === 'string' && description.trim() !== '' ? description.trim() : null;
  const result = db
    .prepare(
      `INSERT INTO tasks (child_id, assigned_by, title, description, development_area, due_date)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(childId, assignedBy, title.trim(), text, developmentArea, dueDate);
  return getTaskById(db, Number(result.lastInsertRowid));
}

// True if the task belongs to the child profile whose login account is userId (FR-M4-02, FR-M4-03)
export function isOwnTask(db, task, userId) {
  const child = db.prepare('SELECT child_account_id FROM children WHERE id = ?').get(task.childId);
  return Boolean(child) && child.child_account_id === userId;
}

// Marks a pending task as done. A task that is already done keeps its first done time.
export function markTaskDone(db, id) {
  db.prepare(
    "UPDATE tasks SET status = 'done', done_at = datetime('now') WHERE id = ? AND status = 'pending'"
  ).run(id);
  return getTaskById(db, id);
}
