import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDatabase } from '../db.js';
import { HttpError } from '../utils/httpError.js';

const DEV_JWT_SECRET = 'dev-secret-change-in-production';

function getJwtSecret() {
  return process.env.JWT_SECRET || DEV_JWT_SECRET;
}

function getJwtExpiresIn() {
  return process.env.JWT_EXPIRES_IN || '7d';
}

/**
 * Create a signed JWT containing the authenticated user's identity and role.
 * @param {{ id: number, email: string, name: string, role: string }} user
 * @returns {string}
 */
export function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    getJwtSecret(),
    { expiresIn: getJwtExpiresIn() }
  );
}

/**
 * Verify a JWT and return its decoded payload, or throw 401 HttpError if invalid.
 * @param {string} token
 * @returns {{ id: number, email: string, name: string, role: string }}
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, getJwtSecret());
  } catch {
    throw new HttpError(401, 'Invalid or expired token.');
  }
}

/**
 * Authenticate a user by email and password and issue a JWT.
 * Role is always taken from the database record (FR-M1-03).
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ token: string, user: { id: number, name: string, email: string, role: string } }>}
 */
export async function loginUser(email, password) {
  if (
    typeof email !== 'string' ||
    email.trim().length === 0 ||
    typeof password !== 'string' ||
    password.length === 0
  ) {
    throw new HttpError(400, 'Email and password are required.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const db = getDatabase();
  const user = db
    .prepare('SELECT id, name, email, password_hash, role FROM users WHERE email = ?')
    .get(normalizedEmail);

  if (!user) {
    throw new HttpError(401, 'Wrong email or password.');
  }

  const passwordValid = await bcrypt.compare(password, user.password_hash);
  if (!passwordValid) {
    throw new HttpError(401, 'Wrong email or password.');
  }

  const publicUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  return {
    token: signToken(publicUser),
    user: publicUser,
  };
}
