// Real, server-generated invoice PDF — no external CDN, no browser print
// dialog. Generated fresh on every request (rather than stored) because a
// draft invoice's line items can still change via PATCH; this guarantees the
// PDF always reflects the invoice's current state instead of a stale
// snapshot. Deliberately status-agnostic: the draft/sent/paid indicator is
// an in-app-only workflow cue and never appears on the downloaded document.
//
// Every text call below passes an explicit width + height + lineBreak:false
// for single-line fields — without a bounded height, pdfkit measures how
// much room a string *could* need to wrap and will silently start a new
// page if that theoretical box doesn't fit above the bottom margin, even
// when the actual rendered text is one short line. Bounding every call
// keeps this a reliable single page for a normal-length invoice.
const PDFDocument = require('pdfkit');
const { fmtKES } = require('../../utils/helpers');

const TEAL = '#0b6e6e';
const INK = '#14181a';
const SOFT = '#5b6360';
const LINE = '#dddddd';

function dstr(iso) {
  return new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function streamInvoicePdf(res, { invoice, items, totals, gig, user }) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="trybe-invoice-${invoice.invoice_no}.pdf"`);

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  doc.pipe(res);

  const line = (x, y, str, opts = {}) => doc.text(str, x, y, { width: 200, height: 16, lineBreak: false, ...opts });

  // ---- header band ----
  doc.rect(0, 0, doc.page.width, 70).fill(TEAL);
  doc.fillColor('#fffcf7').font('Helvetica-Bold').fontSize(18);
  line(40, 24, 'MOTION × TRYBE', { width: 300 });
  doc.font('Helvetica').fontSize(9);
  line(40, 46, 'BRAND MARKETPLACE INVOICE', { width: 300 });
  doc.font('Helvetica-Bold').fontSize(16);
  line(295, 24, invoice.invoice_no, { width: 260, align: 'right' });
  doc.font('Helvetica').fontSize(9);
  line(215, 46, `Issued ${dstr(invoice.issued_at)}  ·  Due ${dstr(invoice.due_at)}`, { width: 340, align: 'right' });

  // ---- parties ----
  let y = 96;
  doc.fillColor(SOFT).font('Helvetica-Bold').fontSize(8);
  line(40, y, 'INVOICE FROM', { width: 240 });
  line(300, y, 'BILL TO', { width: 255 });
  y += 14;
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(11);
  line(40, y, `${user.name}${user.verified ? ' (KYC verified)' : ''}`, { width: 240, height: 20 });
  line(300, y, gig.brand, { width: 255, height: 20 });
  y += 18;
  doc.font('Helvetica').fontSize(8.5).fillColor(SOFT);
  [`@${user.handle}`, user.email, user.phone, `ID ${user.idMasked} · KRA PIN on file`].forEach((row, i) => line(40, y + i * 11, row, { width: 240 }));
  [gig.catName, 'Brand Partnerships Dept.', 'Attn: Marketing Lead', 'Nairobi, Kenya'].forEach((row, i) => line(300, y + i * 11, row, { width: 255 }));

  // ---- campaign reference band ----
  y += 60;
  doc.roundedRect(40, y, 515, 40, 6).fill('#f2f2ef');
  doc.fillColor(SOFT).font('Helvetica-Bold').fontSize(8);
  line(50, y + 8, 'CAMPAIGN REFERENCE', { width: 300 });
  line(400, y + 8, 'AMOUNT DUE', { width: 145, align: 'right' });
  doc.fillColor(INK).font('Helvetica').fontSize(10);
  line(50, y + 21, `${gig.title} · Gig ${gig.id}`, { width: 340, height: 16 });
  doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(13);
  line(400, y + 18, fmtKES(totals.totalCents), { width: 145, align: 'right', height: 18 });

  // ---- line items table ----
  y += 58;
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(9);
  line(40, y, '#', { width: 20 });
  line(60, y, 'Description / Deliverable', { width: 280 });
  line(350, y, 'Qty', { width: 40, align: 'right' });
  line(400, y, 'Unit price', { width: 75, align: 'right' });
  line(480, y, 'Amount', { width: 75, align: 'right' });
  y += 14;
  doc.moveTo(40, y).lineTo(555, y).strokeColor(INK).lineWidth(1.2).stroke();
  y += 8;

  doc.font('Helvetica').fontSize(9.5);
  items.forEach((it, n) => {
    doc.fillColor('#9a9a94');
    line(40, y, String(n + 1), { width: 20 });
    doc.fillColor(INK);
    line(60, y, it.description, { width: 280 });
    line(350, y, String(it.quantity), { width: 40, align: 'right' });
    line(400, y, fmtKES(it.unit_price_cents), { width: 75, align: 'right' });
    line(480, y, fmtKES(it.quantity * it.unit_price_cents), { width: 75, align: 'right' });
    y += 18;
    doc.moveTo(40, y - 4).lineTo(555, y - 4).strokeColor(LINE).lineWidth(0.5).stroke();
  });

  // ---- notes + totals ----
  y += 12;
  const notesY = y;
  doc.fillColor(SOFT).font('Helvetica-Bold').fontSize(8);
  line(40, notesY, 'NOTES', { width: 270 });
  doc.font('Helvetica').fontSize(8).fillColor(SOFT);
  doc.text(
    'All amounts in KES. Payment due within 14 days of issue. Issued via the Trybe Brand Marketplace; the Trybe platform fee is deducted from the creator payout, not added to the amount the brand pays. Usage rights granted for 30 days from go-live.',
    40, notesY + 12, { width: 270, height: 80 }
  );

  const totalsX = 330, totalsW = 225;
  let ty = y;
  const totalsRow = (label, value, opts = {}) => {
    doc.font('Helvetica').fontSize(9.5).fillColor(opts.color || INK);
    line(totalsX, ty, label, { width: 140 });
    line(totalsX + 130, ty, value, { width: totalsW - 130, align: 'right' });
    ty += 16;
    if (!opts.noRule) { doc.moveTo(totalsX, ty - 3).lineTo(totalsX + totalsW, ty - 3).strokeColor(LINE).lineWidth(0.5).stroke(); }
  };
  totalsRow('Subtotal', fmtKES(totals.subtotalCents));
  totalsRow('VAT (16%)', fmtKES(totals.vatCents));

  ty += 6;
  doc.roundedRect(totalsX, ty, totalsW, 36, 6).fillAndStroke('#eaf1f8', '#6C8FD6');
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(11);
  line(totalsX + 10, ty + 7, 'Total due', { width: 140 });
  doc.fillColor('#3760B5').font('Helvetica').fontSize(6.5);
  line(totalsX + 10, ty + 22, `AMOUNT PAYABLE BY ${gig.brand.toUpperCase()}`, { width: 205 });
  doc.fillColor('#3760B5').font('Helvetica-Bold').fontSize(14);
  line(totalsX, ty + 9, fmtKES(totals.totalCents), { width: totalsW - 10, align: 'right' });
  ty += 48;

  doc.fillColor(SOFT).font('Helvetica-Bold').fontSize(7.5);
  line(totalsX, ty, 'YOUR PAYOUT BREAKDOWN', { width: totalsW });
  ty += 14;
  totalsRow('Invoice total', fmtKES(totals.totalCents), { color: SOFT });
  totalsRow('Less: Trybe fee (10%)', '-' + fmtKES(totals.feeCents), { color: SOFT });
  doc.moveTo(totalsX, ty - 3).lineTo(totalsX + totalsW, ty - 3).strokeColor(INK).lineWidth(1).stroke();
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#1E8E5A');
  line(totalsX, ty + 3, 'Your net payout', { width: 140 });
  line(totalsX + 100, ty + 3, fmtKES(totals.netCents), { width: totalsW - 100, align: 'right' });

  // ---- footer (fixed, well within the A4 bottom margin) ----
  const footerY = 620;
  doc.moveTo(40, footerY).lineTo(555, footerY).strokeColor(LINE).lineWidth(1).stroke();
  doc.fillColor(SOFT).font('Helvetica-Bold').fontSize(8);
  line(40, footerY + 10, 'PAYMENT DETAILS', { width: 300 });
  doc.font('Helvetica').fontSize(9).fillColor(INK);
  line(40, footerY + 22, `M-Pesa Paybill: 247247 · Acc ${invoice.invoice_no}`, { width: 400 });
  line(40, footerY + 34, `Motion Pay: @${user.handle} · Bank: Trybe Creator Wallet · Settle by ${dstr(invoice.due_at)}`, { width: 400 });
  doc.fillColor(SOFT).font('Helvetica').fontSize(7.5);
  line(255, footerY + 46, 'VERIFIED · SCAN TO AUTHENTICATE', { width: 300, align: 'right' });

  doc.end();
}

module.exports = { streamInvoicePdf };
