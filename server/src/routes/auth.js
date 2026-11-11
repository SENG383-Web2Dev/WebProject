import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { loginUser } from '../services/authService.js';

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

export default router;
