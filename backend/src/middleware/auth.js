const { verifyToken } = require('../utils/auth-crypto');
const { db } = require('../config/db');
const { publicUser, PUBLIC_COLUMNS } = require('../modules/auth/user-shape');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });

  try {
    const payload = verifyToken(token);
    const row = db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`).get(payload.sub);
    if (!row) return res.status(401).json({ error: 'User no longer exists' });
    req.user = { ...publicUser(row), role: row.role };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
