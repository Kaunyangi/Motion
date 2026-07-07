const express = require('express');
const { z } = require('zod');
const { db, transaction } = require('../../config/db');
const { id } = require('../../utils/helpers');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { audit } = require('../../utils/audit');
const { computeInvoiceTotals, nextInvoiceNumber, serializeGig } = require('./marketplace.service');
const mkDocs = require('./marketplace-documents.service');
const invoicePdf = require('./marketplace-invoice-pdf.service');
const { publicUser, PUBLIC_COLUMNS } = require('../auth/user-shape');
const fs = require('fs');

const router = express.Router();

function loadGig(gigId) {
  const gig = db.prepare('SELECT * FROM gigs WHERE id = ?').get(gigId);
  if (!gig) return null;
  const brand = db.prepare('SELECT * FROM brands WHERE id = ?').get(gig.brand_id);
  const category = db.prepare('SELECT * FROM brand_categories WHERE id = ?').get(brand.category_id);
  const deliverables = db.prepare('SELECT * FROM gig_deliverables WHERE gig_id = ? ORDER BY sort_order').all(gigId);
  return serializeGig(gig, brand, category, deliverables);
}

// ---- Browse: categories -> brands -> gigs -------------------------------

router.get('/categories', (req, res) => {
  const categories = db.prepare('SELECT * FROM brand_categories ORDER BY sort_order').all();
  const withCounts = categories.map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    age: !!c.age_restricted,
    brandCount: db.prepare('SELECT COUNT(*) AS n FROM brands WHERE category_id = ?').get(c.id).n,
  }));
  res.json({ categories: withCounts });
});

router.get('/categories/:id/brands', (req, res) => {
  const category = db.prepare('SELECT * FROM brand_categories WHERE id = ?').get(req.params.id);
  if (!category) return res.status(404).json({ error: 'Category not found' });
  const brands = db.prepare('SELECT * FROM brands WHERE category_id = ? ORDER BY sort_order').all(category.id);
  res.json({
    category: { id: category.id, name: category.name, icon: category.icon, age: !!category.age_restricted },
    brands: brands.map((b) => ({ id: b.id, name: b.name, color: b.color, textColor: b.text_color, campaign: b.campaign })),
  });
});

router.get('/brands/:id', (req, res) => {
  const brand = db.prepare('SELECT * FROM brands WHERE id = ?').get(req.params.id);
  if (!brand) return res.status(404).json({ error: 'Brand not found' });
  const category = db.prepare('SELECT * FROM brand_categories WHERE id = ?').get(brand.category_id);
  const gigs = db.prepare('SELECT * FROM gigs WHERE brand_id = ? AND status = ? ORDER BY is_live DESC').all(brand.id, 'open');
  res.json({
    brand: { id: brand.id, name: brand.name, color: brand.color, textColor: brand.text_color, campaign: brand.campaign },
    category: { id: category.id, name: category.name, icon: category.icon, age: !!category.age_restricted },
    gigs: gigs.map((g) => serializeGig(g, brand, category, db.prepare('SELECT * FROM gig_deliverables WHERE gig_id = ? ORDER BY sort_order').all(g.id))),
  });
});

// Spread feed of open, live campaigns across many brands — "Live campaigns" tab.
router.get('/gigs', (req, res) => {
  const rows = db.prepare(
    `SELECT gigs.* FROM gigs WHERE status = 'open' ORDER BY is_live DESC, RANDOM() LIMIT 24`
  ).all();
  const gigs = rows.map((g) => loadGig(g.id));
  res.json({ gigs });
});

router.get('/gigs/:id', (req, res) => {
  const gig = loadGig(req.params.id);
  if (!gig) return res.status(404).json({ error: 'Gig not found' });
  res.json({ gig });
});

// ---- Applying to a gig (award is instant in this build, matching the
//      product's "apply -> awarded" flow) --------------------------------

router.post('/gigs/:id/apply', requireAuth, (req, res, next) => {
  try {
    const gig = db.prepare('SELECT * FROM gigs WHERE id = ?').get(req.params.id);
    if (!gig) return res.status(404).json({ error: 'Gig not found' });

    const existing = db.prepare('SELECT * FROM gig_applications WHERE gig_id = ? AND user_id = ?').get(gig.id, req.user.id);
    if (existing) return res.status(200).json({ applicationId: existing.id, alreadyApplied: true });

    const applicationId = transaction(() => {
      const appId = id('app');
      db.prepare(
        `INSERT INTO gig_applications (id, gig_id, user_id, status, created_at) VALUES (?,?,?, 'awarded', datetime('now'))`
      ).run(appId, gig.id, req.user.id);
      const deliverables = db.prepare('SELECT * FROM gig_deliverables WHERE gig_id = ? ORDER BY sort_order').all(gig.id);
      const insert = db.prepare(
        `INSERT INTO application_deliverables (id, application_id, title, quantity, unit_price_cents, status, sort_order)
         VALUES (?,?,?,?,?, 'pending', ?)`
      );
      deliverables.forEach((d, i) => insert.run(id('adel'), appId, d.title, d.quantity, d.unit_price_cents, i));
      return appId;
    });

    audit(req, req.user.id, 'marketplace.gig_applied', { gigId: gig.id, applicationId });
    res.status(201).json({ applicationId, alreadyApplied: false });
  } catch (err) { next(err); }
});

function loadApplication(applicationId, userId) {
  const app = db.prepare('SELECT * FROM gig_applications WHERE id = ? AND user_id = ?').get(applicationId, userId);
  if (!app) return null;
  const gig = loadGig(app.gig_id);
  const deliverables = db.prepare('SELECT * FROM application_deliverables WHERE application_id = ? ORDER BY sort_order').all(app.id);
  const invoiceRow = db.prepare('SELECT * FROM invoices WHERE application_id = ?').get(app.id);
  return {
    id: app.id,
    status: app.status,
    createdAt: app.created_at,
    gig,
    deliverables: deliverables.map((d) => ({ id: d.id, title: d.title, quantity: d.quantity, unitPriceCents: d.unit_price_cents, status: d.status })),
    invoiceId: invoiceRow ? invoiceRow.id : null,
  };
}

router.get('/applications', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT id FROM gig_applications WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json({ applications: rows.map((r) => loadApplication(r.id, req.user.id)) });
});

router.get('/applications/:id', requireAuth, (req, res) => {
  const app = loadApplication(req.params.id, req.user.id);
  if (!app) return res.status(404).json({ error: 'Application not found' });
  res.json({ application: app });
});

router.patch('/applications/:id/deliverables/:deliverableId', requireAuth, (req, res, next) => {
  try {
    const app = db.prepare('SELECT * FROM gig_applications WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!app) return res.status(404).json({ error: 'Application not found' });
    if (!['awarded', 'in_production'].includes(app.status)) {
      return res.status(409).json({ error: 'Deliverables can only be updated before invoicing' });
    }
    const deliverable = db.prepare('SELECT * FROM application_deliverables WHERE id = ? AND application_id = ?').get(req.params.deliverableId, app.id);
    if (!deliverable) return res.status(404).json({ error: 'Deliverable not found' });

    const nextStatus = deliverable.status === 'done' ? 'pending' : 'done';
    transaction(() => {
      db.prepare('UPDATE application_deliverables SET status = ? WHERE id = ?').run(nextStatus, deliverable.id);
      const all = db.prepare('SELECT status FROM application_deliverables WHERE application_id = ?').all(app.id);
      const allDone = all.every((d) => d.status === 'done');
      db.prepare('UPDATE gig_applications SET status = ? WHERE id = ?').run(allDone ? 'in_production' : 'awarded', app.id);
    });

    res.json({ application: loadApplication(app.id, req.user.id) });
  } catch (err) { next(err); }
});

// ---- Invoicing ------------------------------------------------------------

function loadInvoice(invoiceId, userId) {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
  if (!invoice) return null;
  const app = db.prepare('SELECT * FROM gig_applications WHERE id = ? AND user_id = ?').get(invoice.application_id, userId);
  if (!app) return null;
  const gig = loadGig(app.gig_id);
  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order').all(invoice.id);
  const totals = computeInvoiceTotals(items.map((i) => ({ quantity: i.quantity, unit_price_cents: i.unit_price_cents })), invoice.fee_rate, invoice.vat_rate);
  return {
    id: invoice.id,
    invoiceNo: invoice.invoice_no,
    status: invoice.status,
    feeRate: invoice.fee_rate,
    vatRate: invoice.vat_rate,
    issuedAt: invoice.issued_at,
    dueAt: invoice.due_at,
    paidAt: invoice.paid_at,
    bankName: invoice.bank_name,
    paybill: invoice.paybill,
    accountNumber: invoice.account_number,
    items: items.map((i) => ({ id: i.id, description: i.description, quantity: i.quantity, unitPriceCents: i.unit_price_cents })),
    totals,
    application: { id: app.id, status: app.status },
    gig,
    documents: mkDocs.documentsForInvoice(invoice.id),
  };
}

router.post('/applications/:id/invoice', requireAuth, (req, res, next) => {
  try {
    const app = db.prepare('SELECT * FROM gig_applications WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!app) return res.status(404).json({ error: 'Application not found' });
    const existing = db.prepare('SELECT * FROM invoices WHERE application_id = ?').get(app.id);
    if (existing) return res.status(200).json({ invoice: loadInvoice(existing.id, req.user.id) });

    const deliverables = db.prepare('SELECT * FROM application_deliverables WHERE application_id = ?').all(app.id);
    if (!deliverables.length || deliverables.some((d) => d.status !== 'done')) {
      return res.status(409).json({ error: 'All deliverables must be submitted before invoicing' });
    }

    const invoiceId = transaction(() => {
      const invId = id('inv');
      const dueAt = new Date(Date.now() + 14 * 864e5).toISOString();
      db.prepare(
        `INSERT INTO invoices (id, application_id, invoice_no, fee_rate, vat_rate, status, issued_at, due_at)
         VALUES (?,?,?,0.10,0.16,'draft', datetime('now'), ?)`
      ).run(invId, app.id, nextInvoiceNumber(), dueAt);
      const insert = db.prepare(
        `INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price_cents, sort_order) VALUES (?,?,?,?,?,?)`
      );
      deliverables.forEach((d, i) => insert.run(id('iitem'), invId, d.title, d.quantity, d.unit_price_cents, i));
      db.prepare('UPDATE gig_applications SET status = ? WHERE id = ?').run('invoiced', app.id);
      return invId;
    });

    audit(req, req.user.id, 'marketplace.invoice_generated', { applicationId: app.id, invoiceId });
    res.status(201).json({ invoice: loadInvoice(invoiceId, req.user.id) });
  } catch (err) { next(err); }
});

router.get('/invoices/:id', requireAuth, (req, res) => {
  const invoice = loadInvoice(req.params.id, req.user.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  res.json({ invoice });
});

// A real, server-generated PDF (pdfkit, no external CDN) — regenerated on
// every request so a still-draft invoice's edited line items are always
// reflected, rather than serving a stale stored file.
router.get('/invoices/:id/pdf', requireAuth, (req, res, next) => {
  try {
    const invoiceRow = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    if (!invoiceRow) return res.status(404).json({ error: 'Invoice not found' });
    const app = db.prepare('SELECT * FROM gig_applications WHERE id = ?').get(invoiceRow.application_id);
    const owns = app && app.user_id === req.user.id;
    if (!owns && req.user.role !== 'admin') return res.status(404).json({ error: 'Invoice not found' });

    const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order').all(invoiceRow.id);
    const totals = computeInvoiceTotals(items.map((i) => ({ quantity: i.quantity, unit_price_cents: i.unit_price_cents })), invoiceRow.fee_rate, invoiceRow.vat_rate);
    const gig = loadGig(app.gig_id);
    // The invoice's "from" party is always its actual creator, even when an
    // admin is the one downloading it.
    const ownerRow = db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`).get(app.user_id);
    const owner = publicUser(ownerRow);

    invoicePdf.streamInvoicePdf(res, { invoice: invoiceRow, items, totals, gig, user: owner });
  } catch (err) { next(err); }
});

const itemsSchema = z.object({
  items: z.array(z.object({
    description: z.string().min(1).max(200),
    quantity: z.number().int().positive(),
    unitPriceCents: z.number().int().nonnegative(),
  })).min(1),
  bankName: z.string().min(1).max(60).optional(),
  paybill: z.string().min(1).max(30).optional(),
  accountNumber: z.string().min(1).max(30).optional(),
});

router.patch('/invoices/:id', requireAuth, validate(itemsSchema), (req, res, next) => {
  try {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    const owns = db.prepare('SELECT id FROM gig_applications WHERE id = ? AND user_id = ?').get(invoice.application_id, req.user.id);
    if (!owns) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.status !== 'draft') return res.status(409).json({ error: 'Only draft invoices can be edited' });

    transaction(() => {
      db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(invoice.id);
      const insert = db.prepare(
        `INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price_cents, sort_order) VALUES (?,?,?,?,?,?)`
      );
      req.body.items.forEach((it, i) => insert.run(id('iitem'), invoice.id, it.description, it.quantity, it.unitPriceCents, i));

      // Where the brand should actually send payment — editable per invoice
      // since a creator may want a different collection account than the
      // platform default.
      db.prepare('UPDATE invoices SET bank_name = ?, paybill = ?, account_number = ? WHERE id = ?').run(
        req.body.bankName !== undefined ? req.body.bankName : invoice.bank_name,
        req.body.paybill !== undefined ? req.body.paybill : invoice.paybill,
        req.body.accountNumber !== undefined ? req.body.accountNumber : invoice.account_number,
        invoice.id
      );
    });

    res.json({ invoice: loadInvoice(invoice.id, req.user.id) });
  } catch (err) { next(err); }
});

router.post('/invoices/:id/send', requireAuth, (req, res, next) => {
  try {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    const app = db.prepare('SELECT * FROM gig_applications WHERE id = ? AND user_id = ?').get(invoice.application_id, req.user.id);
    if (!app) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.status !== 'draft') return res.status(409).json({ error: 'Invoice already sent' });

    transaction(() => {
      db.prepare('UPDATE invoices SET status = ? WHERE id = ?').run('sent', invoice.id);
      db.prepare('UPDATE gig_applications SET status = ? WHERE id = ?').run('sent', app.id);
    });
    audit(req, req.user.id, 'marketplace.invoice_sent', { invoiceId: invoice.id });
    res.json({ invoice: loadInvoice(invoice.id, req.user.id) });
  } catch (err) { next(err); }
});

// Simulates the brand paying the invoice — credits the creator's Motion Pay
// wallet with the net payout (after the Trybe platform fee) and records the
// fee in the marketplace ledger, mirroring how the ticket/flight checkouts
// record commission in the general revenue ledger.
router.post('/invoices/:id/pay', requireAuth, (req, res, next) => {
  try {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    const app = db.prepare('SELECT * FROM gig_applications WHERE id = ? AND user_id = ?').get(invoice.application_id, req.user.id);
    if (!app) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.status !== 'sent') return res.status(409).json({ error: 'Invoice must be sent before it can be paid' });

    const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(invoice.id);
    const totals = computeInvoiceTotals(items.map((i) => ({ quantity: i.quantity, unit_price_cents: i.unit_price_cents })), invoice.fee_rate, invoice.vat_rate);

    transaction(() => {
      db.prepare('UPDATE invoices SET status = ?, paid_at = datetime(\'now\') WHERE id = ?').run('paid', invoice.id);
      db.prepare('UPDATE gig_applications SET status = ? WHERE id = ?').run('paid', app.id);

      const user = db.prepare('SELECT wallet_balance_cents FROM users WHERE id = ?').get(req.user.id);
      const newBalance = user.wallet_balance_cents + totals.netCents;
      db.prepare('UPDATE users SET wallet_balance_cents = ? WHERE id = ?').run(newBalance, req.user.id);
      db.prepare(
        `INSERT INTO wallet_transactions (id, user_id, type, amount_cents, balance_after_cents, reference, created_at)
         VALUES (?,?, 'credit', ?, ?, ?, datetime('now'))`
      ).run(id('wtx'), req.user.id, totals.netCents, newBalance, invoice.invoice_no);

      // Every shilling that moved is accounted for in one of three buckets:
      // what the creator was paid, what Trybe retained as its platform fee,
      // and the VAT collected on the brand's behalf for remittance to KRA —
      // this is the backend's financial record of the payment, independent
      // of what the invoice PDF says.
      db.prepare(`INSERT INTO marketplace_ledger (id, invoice_id, type, amount_cents, created_at) VALUES (?,?, 'platform_fee', ?, datetime('now'))`)
        .run(id('mkl'), invoice.id, totals.feeCents);
      db.prepare(`INSERT INTO marketplace_ledger (id, invoice_id, type, amount_cents, created_at) VALUES (?,?, 'creator_payout', ?, datetime('now'))`)
        .run(id('mkl'), invoice.id, totals.netCents);
      db.prepare(`INSERT INTO marketplace_ledger (id, invoice_id, type, amount_cents, created_at) VALUES (?,?, 'tax_collected', ?, datetime('now'))`)
        .run(id('mkl'), invoice.id, totals.vatCents);
    });

    // Paper trail for the creator, generated once, outside the DB
    // transaction (file I/O shouldn't hold a lock open).
    const paidInvoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoice.id);
    const gig = loadGig(app.gig_id);
    const deliverables = db.prepare('SELECT * FROM application_deliverables WHERE application_id = ?').all(app.id);
    mkDocs.generateReceipt(paidInvoice, items, totals, gig, req.user);
    mkDocs.generateDeliveryNote(paidInvoice, deliverables, gig, req.user);

    audit(req, req.user.id, 'marketplace.invoice_paid', { invoiceId: invoice.id, netCents: totals.netCents, feeCents: totals.feeCents, vatCents: totals.vatCents });
    res.json({ invoice: loadInvoice(invoice.id, req.user.id) });
  } catch (err) { next(err); }
});

// Admin financial summary: every marketplace payment split into what
// creators were paid, what Trybe retained, and what was collected for tax.
router.get('/admin/summary', requireAuth, requireRole('admin'), (req, res) => {
  const rows = db.prepare(
    `SELECT type, COUNT(*) AS transactions, SUM(amount_cents) AS total_cents FROM marketplace_ledger GROUP BY type`
  ).all();
  const byType = { platform_fee: 0, creator_payout: 0, tax_collected: 0 };
  rows.forEach((r) => { byType[r.type] = r.total_cents; });
  res.json({ byType, lines: rows });
});

router.get('/documents/:id/download', requireAuth, (req, res) => {
  const doc = mkDocs.getDocument(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(doc.invoice_id);
  const owns = invoice && db.prepare('SELECT id FROM gig_applications WHERE id = ? AND user_id = ?').get(invoice.application_id, req.user.id);
  if (!owns && req.user.role !== 'admin') return res.status(403).json({ error: 'Not authorized to access this document' });
  if (!fs.existsSync(doc.file_path)) return res.status(410).json({ error: 'Document file no longer available' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="trybe-${doc.doc_type}-${doc.id}.pdf"`);
  fs.createReadStream(doc.file_path).pipe(res);
});

module.exports = router;
