const express = require('express');
const { z } = require('zod');
const { db } = require('../../config/db');
const { id } = require('../../utils/helpers');
const { hashPassword, comparePassword, signToken } = require('../../utils/auth-crypto');
const { validate } = require('../../middleware/validate');
const { requireAuth } = require('../../middleware/auth');
const { audit } = require('../../utils/audit');
const { publicUser, PUBLIC_COLUMNS } = require('./user-shape');

const router = express.Router();

const registerSchema = z.object({
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  handle: z.string().min(2).max(30).regex(/^[a-z0-9_.]+$/i, 'Handle can only contain letters, numbers, dots and underscores'),
  email: z.string().email(),
  phone: z.string().min(7).max(20),
  idNumber: z.string().min(4).max(30),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  avatar: z.string().max(6_000_000).optional(),
  role: z.enum(['buyer', 'organizer', 'admin', 'creator']).default('creator'),
});

router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const { firstName, lastName, handle, email, phone, idNumber, password, avatar, role } = req.body;
    const cleanHandle = handle.replace(/^@/, '').toLowerCase();

    const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingEmail) return res.status(409).json({ error: 'An account with this email already exists' });
    const existingHandle = db.prepare('SELECT id FROM users WHERE handle = ?').get(cleanHandle);
    if (existingHandle) return res.status(409).json({ error: 'That handle is already taken' });

    const passwordHash = await hashPassword(password);
    const userId = id('usr');
    const idMasked = '••••' + idNumber.slice(-3);
    const niches = ['Lifestyle', 'Music', 'Fashion'];
    // Demo social-proof numbers, consistent with a creator platform onboarding flow.
    const followers = Math.floor(2000 + Math.random() * 40000);
    const following = Math.floor(200 + Math.random() * 900);

    db.prepare(
      `INSERT INTO users (id, name, email, password_hash, role, wallet_balance_cents, handle, phone, id_masked,
        avatar_data_url, city, niches_json, picks_json, followers, following, verified, created_at)
       VALUES (?,?,?,?,?,0,?,?,?,?,?,?,?,?,?,1,datetime('now'))`
    ).run(userId, `${firstName} ${lastName}`, email, passwordHash, role, cleanHandle, phone, idMasked,
      avatar || null, 'Nairobi', JSON.stringify(niches), JSON.stringify([]), followers, following);

    audit(req, userId, 'user.register', { role, handle: cleanHandle });

    const row = db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`).get(userId);
    res.status(201).json({ token: signToken(row), user: publicUser(row) });
  } catch (err) { next(err); }
});

const loginSchema = z.object({
  identifier: z.string().min(1), // email, phone, or handle
  password: z.string().min(1),
});

router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { identifier, password } = req.body;
    const row = db.prepare('SELECT * FROM users WHERE email = ? OR phone = ? OR handle = ?')
      .get(identifier, identifier, identifier.replace(/^@/, ''));
    // Deliberately generic error — do not reveal whether the account exists.
    if (!row) return res.status(401).json({ error: 'Invalid email/phone or password' });

    const ok = await comparePassword(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid email/phone or password' });

    audit(req, row.id, 'user.login', {});
    res.json({ token: signToken(row), user: publicUser(row) });
  } catch (err) { next(err); }
});

router.get('/me', requireAuth, (req, res) => {
  const row = db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`).get(req.user.id);
  res.json({ user: publicUser(row) });
});

const updateMeSchema = z.object({
  avatar: z.string().max(6_000_000).nullable().optional(),
  picks: z.array(z.string()).max(12).optional(),
  city: z.string().max(80).optional(),
  niches: z.array(z.string()).max(10).optional(),
});

router.patch('/me', requireAuth, validate(updateMeSchema), (req, res, next) => {
  try {
    const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const next = {
      avatar_data_url: req.body.avatar !== undefined ? req.body.avatar : current.avatar_data_url,
      city: req.body.city !== undefined ? req.body.city : current.city,
      niches_json: req.body.niches !== undefined ? JSON.stringify(req.body.niches) : current.niches_json,
      picks_json: req.body.picks !== undefined ? JSON.stringify(req.body.picks) : current.picks_json,
    };
    db.prepare('UPDATE users SET avatar_data_url = ?, city = ?, niches_json = ?, picks_json = ? WHERE id = ?')
      .run(next.avatar_data_url, next.city, next.niches_json, next.picks_json, req.user.id);
    const row = db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`).get(req.user.id);
    res.json({ user: publicUser(row) });
  } catch (err) { next(err); }
});

module.exports = router;
