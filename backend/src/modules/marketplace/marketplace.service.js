const { db } = require('../../config/db');

function computeInvoiceTotals(items, feeRate, vatRate) {
  const subtotalCents = items.reduce((s, i) => s + i.quantity * i.unit_price_cents, 0);
  const feeCents = Math.round(subtotalCents * feeRate);
  const vatCents = Math.round(subtotalCents * vatRate);
  // The brand pays subtotal + VAT; the platform fee is deducted from the creator's payout, not added on top.
  const totalCents = subtotalCents + vatCents;
  const netCents = subtotalCents - feeCents;
  return { subtotalCents, feeCents, vatCents, totalCents, netCents };
}

function nextInvoiceNumber() {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM invoices').get();
  const year = new Date().getFullYear();
  return `TRB-INV-${year}-${String(841 + n).padStart(5, '0')}`;
}

function serializeGig(gigRow, brandRow, categoryRow, deliverables) {
  return {
    id: gigRow.id,
    brand: brandRow.name,
    brandColor: brandRow.color,
    brandTextColor: brandRow.text_color,
    catId: categoryRow.id,
    catName: categoryRow.name,
    age: !!categoryRow.age_restricted,
    live: !!gigRow.is_live,
    title: gigRow.title,
    objective: gigRow.objective,
    scope: gigRow.scope,
    eligibility: gigRow.eligibility,
    budgetCents: gigRow.budget_cents,
    status: gigRow.status,
    deliverables: deliverables.map((d) => ({ id: d.id, title: d.title, quantity: d.quantity, unitPriceCents: d.unit_price_cents })),
  };
}

module.exports = { computeInvoiceTotals, nextInvoiceNumber, serializeGig };
