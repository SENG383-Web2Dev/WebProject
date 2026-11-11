import { Router } from 'express';
import { getCurrentUser, loginUser } from '../services/authService.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};
    const result = await loginUser(email, password);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/me', requireAuth, (req, res, next) => {
  try {
    const user = getCurrentUser(req.user.id);
    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
});

router.post('/logout', requireAuth, (req, res) => {
  res.status(200).json({ message: 'Logged out.' });
});

export default router;

