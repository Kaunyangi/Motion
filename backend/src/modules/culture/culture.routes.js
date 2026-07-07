const express = require('express');
const { db } = require('../../config/db');

const router = express.Router();

// Editorial content is curated by the Trybe/Cultured team, not user-generated —
// public, read-only feed.
router.get('/posts', (req, res) => {
  const posts = db.prepare('SELECT * FROM culture_posts ORDER BY created_at DESC').all();
  res.json({ posts });
});

module.exports = router;
