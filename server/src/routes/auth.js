import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getCurrentUser, loginUser } from '../services/authService.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' },
});

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};
    const result = await loginUser(email, password);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/me', authLimiter, requireAuth, (req, res, next) => {
  try {
    const user = getCurrentUser(req.user.id);
    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
});

router.post('/logout', authLimiter, requireAuth, (req, res) => {
  res.status(200).json({ message: 'Logged out.' });
});

export default router;
