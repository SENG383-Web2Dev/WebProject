import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { listSpecialistChildren } from '../services/linkService.js';

const router = Router();

// GET /api/specialist/children - children with an active link to the logged-in specialist (FR-M2-05)
router.get('/children', requireRole('specialist'), (req, res, next) => {
  try {
    const children = listSpecialistChildren(req.user.id);
    res.status(200).json(children);
  } catch (error) {
    next(error);
  }
});

export default router;
