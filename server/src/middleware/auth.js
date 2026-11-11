import { verifyToken } from '../services/authService.js';

/**
 * Express middleware that requires a valid Bearer JWT in the Authorization header.
 * Attaches the decoded user payload ({ id, email, name, role }) to req.user.
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
    return res.status(401).json({ error: 'Invalid authorization header.' });
  }

  try {
    const decoded = verifyToken(parts[1]);
    req.user = {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
    };
    return next();
  } catch (error) {
    return res
      .status(error.status || 401)
      .json({ error: error.message || 'Invalid or expired token.' });
  }
}

/**
 * Express middleware factory that restricts access to specific user roles (FR-M1-05).
 * Accepts either variadic role strings or an array of roles.
 * @param  {...(string|string[])} roles
 */
export function requireRole(...roles) {
  const allowedRoles = roles.flat();

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: insufficient permissions.' });
    }

    return next();
  };
}
