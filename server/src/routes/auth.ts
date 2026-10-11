import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { AppError, asyncHandler } from '../errors';
import { hostAuth, requireHost, signHostToken } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { User } from '../models';
import { userDto } from '../serializers';

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(120),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(120),
  password: z.string().min(1, 'Password is required').max(100),
});

// Compared against when the email is unknown so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('rallie-dummy-password', config.bcryptRounds);

export function authRouter(): Router {
  const r = Router();

  r.post(
    '/register',
    authLimiter,
    validate(registerSchema),
    asyncHandler(async (req, res) => {
      const { name, email, password } = req.body as z.infer<typeof registerSchema>;
      if (await User.exists({ email })) throw new AppError(409, 'An account with this email already exists');
      const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, config.bcryptRounds) });
      res.status(201).json({ token: signHostToken(String(user._id)), user: userDto(user) });
    }),
  );

  r.post(
    '/login',
    authLimiter,
    validate(loginSchema),
    asyncHandler(async (req, res) => {
      const { email, password } = req.body as z.infer<typeof loginSchema>;
      const user = await User.findOne({ email });
      const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
      if (!user || !ok) throw new AppError(401, 'Incorrect email or password');
      res.json({ token: signHostToken(String(user._id)), user: userDto(user) });
    }),
  );

  r.get(
    '/me',
    requireHost,
    asyncHandler(async (req, res) => {
      const user = await User.findById(hostAuth(req).sub);
      if (!user) throw new AppError(401, 'Account no longer exists');
      res.json({ user: userDto(user) });
    }),
  );

  return r;
}
