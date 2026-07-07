const express = require('express');
const { z } = require('zod');
const { db } = require('../../config/db');
const { id } = require('../../utils/helpers');
const { requireAuth } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');

const router = express.Router();

router.get('/listings', (req, res) => {
  const listings = db.prepare('SELECT * FROM commerce_listings WHERE status = ? ORDER BY created_at DESC').all('active');
  res.json({ listings });
});

router.get('/listings/mine', requireAuth, (req, res) => {
  const listings = db.prepare('SELECT * FROM commerce_listings WHERE seller_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json({ listings });
});

const createSchema = z.object({
  title: z.string().min(2).max(120),
  priceCents: z.number().int().positive(),
  category: z.string().max(60).default(''),
  imageDataUrl: z.string().max(8_000_000).optional(),
});

router.post('/listings', requireAuth, validate(createSchema), (req, res, next) => {
  try {
    const listingId = id('list');
    db.prepare(
      `INSERT INTO commerce_listings (id, seller_id, seller_handle, title, price_cents, category, image_data_url, status, created_at)
       VALUES (?,?,?,?,?,?,?, 'active', datetime('now'))`
    ).run(listingId, req.user.id, req.user.handle, req.body.title, req.body.priceCents, req.body.category, req.body.imageDataUrl || null);
    res.status(201).json({ listing: db.prepare('SELECT * FROM commerce_listings WHERE id = ?').get(listingId) });
  } catch (err) { next(err); }
});

router.patch('/listings/:id/sold', requireAuth, (req, res) => {
  const listing = db.prepare('SELECT * FROM commerce_listings WHERE id = ? AND seller_id = ?').get(req.params.id, req.user.id);
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  db.prepare('UPDATE commerce_listings SET status = ? WHERE id = ?').run('sold', listing.id);
  res.json({ listing: db.prepare('SELECT * FROM commerce_listings WHERE id = ?').get(listing.id) });
});

module.exports = router;
