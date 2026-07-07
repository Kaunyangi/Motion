const express = require('express');
const { db } = require('../../config/db');
const { id } = require('../../utils/helpers');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

router.get('/groups', (req, res) => {
  const groups = db.prepare('SELECT * FROM community_groups ORDER BY member_count DESC').all();
  let joined = new Set();
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    try {
      const { verifyToken } = require('../../utils/auth-crypto');
      const payload = verifyToken(header.slice(7));
      const rows = db.prepare('SELECT group_id FROM group_memberships WHERE user_id = ?').all(payload.sub);
      joined = new Set(rows.map((r) => r.group_id));
    } catch (_) { /* browsing without a valid session still works */ }
  }
  res.json({ groups: groups.map((g) => ({ ...g, joined: joined.has(g.id) })) });
});

router.post('/groups/:id/join', requireAuth, (req, res, next) => {
  try {
    const group = db.prepare('SELECT * FROM community_groups WHERE id = ?').get(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    const existing = db.prepare('SELECT * FROM group_memberships WHERE group_id = ? AND user_id = ?').get(group.id, req.user.id);
    if (existing) return res.status(200).json({ joined: true });

    db.prepare('INSERT INTO group_memberships (id, group_id, user_id, joined_at) VALUES (?,?,?,datetime(\'now\'))')
      .run(id('mem'), group.id, req.user.id);
    db.prepare('UPDATE community_groups SET member_count = member_count + 1 WHERE id = ?').run(group.id);
    res.status(201).json({ joined: true });
  } catch (err) { next(err); }
});

router.post('/groups/:id/leave', requireAuth, (req, res, next) => {
  try {
    const membership = db.prepare('SELECT * FROM group_memberships WHERE group_id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!membership) return res.status(200).json({ joined: false });
    db.prepare('DELETE FROM group_memberships WHERE id = ?').run(membership.id);
    db.prepare('UPDATE community_groups SET member_count = MAX(0, member_count - 1) WHERE id = ?').run(req.params.id);
    res.json({ joined: false });
  } catch (err) { next(err); }
});

module.exports = router;
