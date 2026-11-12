import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { requireChildAccess } from '../middleware/childAccess.js';
import {
  linkSpecialist,
  listChildSpecialists,
  listParentChildren,
  mapChildRow,
  unlinkSpecialist,
} from '../services/linkService.js';

const router = Router();

// GET /api/children - list child profiles of the logged-in parent
router.get('/', requireRole('parent'), (req, res, next) => {
  try {
    const children = listParentChildren(req.user.id);
    res.status(200).json(children);
  } catch (error) {
    next(error);
  }
});

// GET /api/children/:childId - view a child profile (parent, actively linked specialist, or own child account)
router.get(
  '/:childId',
  requireChildAccess('parent', 'specialist', 'child'),
  (req, res) => {
    res.status(200).json(mapChildRow(req.child));
  }
);

// GET /api/children/:childId/specialists - list specialists actively linked to a child (FR-M2-03)
router.get('/:childId/specialists', requireChildAccess('parent'), (req, res, next) => {
  try {
    const specialists = listChildSpecialists(req.params.childId, req.user.id);
    res.status(200).json(specialists);
  } catch (error) {
    next(error);
  }
});

// POST /api/children/:childId/specialists - link a registered specialist by email & type (FR-M2-01, FR-M2-02)
router.post('/:childId/specialists', requireChildAccess('parent'), (req, res, next) => {
  try {
    const link = linkSpecialist(req.params.childId, req.user.id, req.body ?? {});
    res.status(201).json(link);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/children/:childId/specialists/:specialistId - unlink specialist (FR-M2-04)
router.delete(
  '/:childId/specialists/:specialistId',
  requireChildAccess('parent'),
  (req, res, next) => {
    try {
      unlinkSpecialist(req.params.childId, req.params.specialistId, req.user.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  }
);

export default router;

