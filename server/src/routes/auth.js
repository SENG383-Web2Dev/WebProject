import { Router } from 'express';
import { loginUser } from '../services/authService.js';

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

export default router;
