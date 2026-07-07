const express = require('express');
const { z } = require('zod');
const { db } = require('../../config/db');
const { id } = require('../../utils/helpers');
const { requireAuth } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');

const router = express.Router();
router.use(requireAuth);

router.get('/mine', (req, res) => {
  const posts = db.prepare('SELECT * FROM posts WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json({ posts });
});

const createSchema = z.object({
  type: z.enum(['image', 'video']),
  mediaDataUrl: z.string().max(15_000_000),
  caption: z.string().max(400).default(''),
  brand: z.string().max(80).default(''),
});

router.post('/', validate(createSchema), (req, res, next) => {
  try {
    const postId = id('post');
    const likes = Math.floor(Math.random() * 400);
    db.prepare(
      `INSERT INTO posts (id, user_id, type, media_data_url, caption, brand, likes, created_at)
       VALUES (?,?,?,?,?,?,?,datetime('now'))`
    ).run(postId, req.user.id, req.body.type, req.body.mediaDataUrl, req.body.caption, req.body.brand, likes);
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
    res.status(201).json({ post });
  } catch (err) { next(err); }
});

router.delete('/:id', (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
