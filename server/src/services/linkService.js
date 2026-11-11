import { getDatabase } from '../db.js';
import { HttpError } from '../utils/httpError.js';

export const SPECIALIST_TYPES = [
  'Teacher',
  'Psychologist',
  'Doctor',
  'Special education teacher',
  'Coach',
];

function parsePositiveId(value, label) {
  const normalized = String(value ?? '').trim();
  if (!/^[1-9]\d*$/.test(normalized)) {
    throw new HttpError(400, `Invalid ${label}.`);
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) {
    throw new HttpError(400, `Invalid ${label}.`);
  }
  return parsed;
}

function mapChildRow(row) {
  return {
    id: row.id,
    parentId: row.parent_id,
    childAccountId: row.child_account_id,
    name: row.name,
    birthDate: row.birth_date,
  };
}

function mapLinkedSpecialistRow(row) {
  return {
    id: row.id,
    childId: row.child_id,
    specialistId: row.specialist_id,
    name: row.name,
    email: row.email,
    specialistType: row.specialist_type,
    active: Boolean(row.active),
    createdAt: row.created_at,
  };
}

function mapSpecialistChildRow(row) {
  return {
    id: row.id,
    name: row.name,
    birthDate: row.birth_date,
    parentId: row.parent_id,
    childAccountId: row.child_account_id,
    parentName: row.parent_name,
    specialistType: row.specialist_type,
    linkedAt: row.linked_at,
  };
}

function findLinkedSpecialistById(db, linkId) {
  const row = db
    .prepare(
      `SELECT
        sl.id,
        sl.child_id,
        sl.specialist_id,
        u.name,
        u.email,
        sl.specialist_type,
        sl.active,
        sl.created_at
      FROM specialist_links sl
      JOIN users u ON u.id = sl.specialist_id
      WHERE sl.id = ?`
    )
    .get(linkId);

  return row ? mapLinkedSpecialistRow(row) : null;
}

/**
 * Verify that the target child exists and belongs to the requesting parent.
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {number|string} rawChildId
 * @param {number} parentId
 */
export function assertParentOwnsChild(db, rawChildId, parentId) {
  const childId = parsePositiveId(rawChildId, 'child id');
  const child = db
    .prepare('SELECT id, parent_id, child_account_id, name, birth_date FROM children WHERE id = ?')
    .get(childId);

  if (!child) {
    throw new HttpError(404, 'Child not found.');
  }

  if (child.parent_id !== parentId) {
    throw new HttpError(403, 'Forbidden: you do not have access to this child.');
  }

  return child;
}

/**
 * List all child profiles owned by a parent.
 * @param {number} parentId
 */
export function listParentChildren(parentId) {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT id, parent_id, child_account_id, name, birth_date
       FROM children
       WHERE parent_id = ?
       ORDER BY id ASC`
    )
    .all(parentId);

  return rows.map(mapChildRow);
}

/**
 * Link a registered specialist user to the parent's child by email and specialist type (FR-M2-01, FR-M2-02).
 * Reactivates an existing inactive link if the specialist was previously unlinked.
 * @param {number|string} rawChildId
 * @param {number} parentId
 * @param {{ email?: string, specialistType?: string }} payload
 */
export function linkSpecialist(rawChildId, parentId, { email, specialistType } = {}) {
  const db = getDatabase();
  const child = assertParentOwnsChild(db, rawChildId, parentId);

  if (typeof email !== 'string' || email.trim().length === 0) {
    throw new HttpError(400, 'Specialist email is required.');
  }

  if (typeof specialistType !== 'string' || specialistType.trim().length === 0) {
    throw new HttpError(400, 'Specialist type is required.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedType = specialistType.trim();

  const specialist = db
    .prepare(`SELECT id, name, email, role FROM users WHERE email = ? AND role = 'specialist'`)
    .get(normalizedEmail);

  if (!specialist) {
    throw new HttpError(404, 'No registered specialist with this email.');
  }

  const existingLink = db
    .prepare(
      'SELECT id, active FROM specialist_links WHERE child_id = ? AND specialist_id = ?'
    )
    .get(child.id, specialist.id);

  if (existingLink) {
    if (existingLink.active === 1) {
      throw new HttpError(409, 'This specialist is already linked to this child.');
    }

    db.prepare(
      'UPDATE specialist_links SET active = 1, specialist_type = ? WHERE id = ?'
    ).run(normalizedType, existingLink.id);

    return findLinkedSpecialistById(db, existingLink.id);
  }

  const result = db
    .prepare(
      'INSERT INTO specialist_links (child_id, specialist_id, specialist_type, active) VALUES (?, ?, ?, 1)'
    )
    .run(child.id, specialist.id, normalizedType);

  return findLinkedSpecialistById(db, Number(result.lastInsertRowid));
}

/**
 * List specialists actively linked to a parent's child (FR-M2-03).
 * @param {number|string} rawChildId
 * @param {number} parentId
 */
export function listChildSpecialists(rawChildId, parentId) {
  const db = getDatabase();
  const child = assertParentOwnsChild(db, rawChildId, parentId);

  const rows = db
    .prepare(
      `SELECT
        sl.id,
        sl.child_id,
        sl.specialist_id,
        u.name,
        u.email,
        sl.specialist_type,
        sl.active,
        sl.created_at
      FROM specialist_links sl
      JOIN users u ON u.id = sl.specialist_id
      WHERE sl.child_id = ? AND sl.active = 1
      ORDER BY sl.id ASC`
    )
    .all(child.id);

  return rows.map(mapLinkedSpecialistRow);
}

/**
 * Unlink an actively linked specialist from a child by marking the link inactive (FR-M2-04).
 * @param {number|string} rawChildId
 * @param {number|string} rawSpecialistId
 * @param {number} parentId
 */
export function unlinkSpecialist(rawChildId, rawSpecialistId, parentId) {
  const db = getDatabase();
  const child = assertParentOwnsChild(db, rawChildId, parentId);
  const specialistId = parsePositiveId(rawSpecialistId, 'specialist id');

  const activeLink = db
    .prepare(
      'SELECT id FROM specialist_links WHERE child_id = ? AND specialist_id = ? AND active = 1'
    )
    .get(child.id, specialistId);

  if (!activeLink) {
    throw new HttpError(404, 'Active specialist link not found.');
  }

  db.prepare('UPDATE specialist_links SET active = 0 WHERE id = ?').run(activeLink.id);
}

/**
 * List children who have an active link to the logged-in specialist (FR-M2-05).
 * @param {number} specialistId
 */
export function listSpecialistChildren(specialistId) {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT
        c.id,
        c.name,
        c.birth_date,
        c.parent_id,
        c.child_account_id,
        p.name AS parent_name,
        sl.specialist_type,
        sl.created_at AS linked_at
      FROM specialist_links sl
      JOIN children c ON c.id = sl.child_id
      JOIN users p ON p.id = c.parent_id
      WHERE sl.specialist_id = ? AND sl.active = 1
      ORDER BY c.id ASC`
    )
    .all(specialistId);

  return rows.map(mapSpecialistChildRow);
}
