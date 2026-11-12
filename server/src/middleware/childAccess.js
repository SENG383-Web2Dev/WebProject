import { getDatabase } from '../db.js';
import { verifyChildAccess } from '../services/linkService.js';

const DEFAULT_ROLES = ['parent', 'specialist'];

function resolveAccessOptions(args) {
  if (
    args.length === 1 &&
    typeof args[0] === 'object' &&
    args[0] !== null &&
    !Array.isArray(args[0])
  ) {
    const { roles, allowChild = false, paramName = 'childId' } = args[0];
    const allowedRoles = roles ? roles.flat() : [...DEFAULT_ROLES];
    if (allowChild && !allowedRoles.includes('child')) {
      allowedRoles.push('child');
    }
    return { allowedRoles, paramName };
  }

  const flatRoles = args.flat().filter(Boolean);
  return {
    allowedRoles: flatRoles.length > 0 ? flatRoles : [...DEFAULT_ROLES],
    paramName: 'childId',
  };
}

/**
 * Express middleware factory enforcing child access rules (FR-M2-06).
 * By default allows the child's parent or an actively linked specialist;
 * pass `'child'` (or `{ allowChild: true }`) where the child's own account is permitted.
 * Attaches `req.child` and (for specialists) `req.specialistLink`.
 * @param {...(string|string[]|{ roles?: string[], allowChild?: boolean, paramName?: string })} args
 */
export function requireChildAccess(...args) {
  const { allowedRoles, paramName } = resolveAccessOptions(args);

  return (req, res, next) => {
    try {
      const { child, specialistLink } = verifyChildAccess(
        getDatabase(),
        req.user,
        req.params?.[paramName],
        allowedRoles
      );
      req.child = child;
      req.specialistLink = specialistLink;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export { verifyChildAccess };
