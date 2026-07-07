// Auto-generated the moment a brand's payment on an invoice is simulated:
// a payment receipt (proof of payment) and a delivery note (proof the
// deliverables were submitted and accepted) — the paper trail a creator
// needs for their own records once money has actually moved.
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { db } = require('../../config/db');
const { id, fmtKES } = require('../../utils/helpers');

const OUT_DIR = path.join(__dirname, '..', '..', '..', 'generated', 'marketplace');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const TEAL = '#0b6e6e';
const INK = '#14181a';
const SOFT = '#5b6360';

function header(doc, title, subtitle) {
  doc.rect(0, 0, doc.page.width, 70).fill(TEAL);
  doc.fillColor('#fffcf7').fontSize(18).font('Helvetica-Bold').text('MOTION × TRYBE', 40, 24);
  doc.fontSize(9).font('Helvetica').text(subtitle, 40, 46);
  doc.fillColor(INK).fontSize(16).font('Helvetica-Bold').text(title, 40, 90);
}

function generateReceipt(invoice, items, totals, gig, user) {
  const docId = id('mdoc');
  const filePath = path.join(OUT_DIR, `${docId}.pdf`);
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  doc.pipe(fs.createWriteStream(filePath));

  header(doc, 'Payment Receipt', 'ISSUED VIA MOTION × TRYBE BRAND MARKETPLACE');

  doc.moveDown(2);
  doc.fillColor(SOFT).fontSize(10).font('Helvetica');
  doc.text(`Receipt for invoice  ${invoice.invoice_no}`, 40, 130);
  doc.text(`Date paid            ${new Date(invoice.paid_at || Date.now()).toLocaleString('en-KE')}`, 40, 145);
  doc.text(`Paid by              ${gig.brand}`, 40, 160);
  doc.text(`Paid to              ${user.name} <${user.email}>`, 40, 175);
  doc.text(`Campaign             ${gig.title}`, 40, 190);

  let y = 225;
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(10);
  doc.text('Description', 40, y);
  doc.text('Qty', 340, y);
  doc.text('Unit price', 400, y);
  doc.text('Line total', 480, y);
  y += 16;
  doc.moveTo(40, y).lineTo(555, y).strokeColor('#dddddd').stroke();
  y += 10;

  doc.font('Helvetica').fontSize(10).fillColor(INK);
  items.forEach((it) => {
    doc.text(it.description, 40, y, { width: 280 });
    doc.text(String(it.quantity), 340, y);
    doc.text(fmtKES(it.unit_price_cents), 400, y);
    doc.text(fmtKES(it.quantity * it.unit_price_cents), 480, y);
    y += 20;
  });

  y += 10;
  doc.moveTo(40, y).lineTo(555, y).strokeColor('#dddddd').stroke();
  y += 14;
  doc.font('Helvetica').fillColor(INK).text('Subtotal', 400, y);
  doc.text(fmtKES(totals.subtotalCents), 480, y);
  y += 16;
  doc.text('VAT (16%)', 400, y);
  doc.text(fmtKES(totals.vatCents), 480, y);
  y += 20;
  doc.font('Helvetica-Bold').fontSize(12).fillColor(TEAL);
  doc.text('Total paid', 400, y);
  doc.text(fmtKES(totals.totalCents), 480, y);

  doc.fontSize(8).fillColor(SOFT).font('Helvetica')
    .text('This receipt confirms payment of the invoice above in full. Motion Trybe Ventures Corporation, Nairobi, Kenya.', 40, 780, { width: 515 });

  doc.end();

  db.prepare('INSERT INTO marketplace_documents (id, invoice_id, doc_type, file_path, created_at) VALUES (?,?,?,?,datetime(\'now\'))')
    .run(docId, invoice.id, 'receipt', filePath);

  return { id: docId, filePath };
}

function generateDeliveryNote(invoice, deliverables, gig, user) {
  const docId = id('mdoc');
  const filePath = path.join(OUT_DIR, `${docId}.pdf`);
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  doc.pipe(fs.createWriteStream(filePath));

  header(doc, 'Delivery Note', 'CONFIRMS DELIVERABLES SUBMITTED & ACCEPTED');

  doc.moveDown(2);
  doc.fillColor(SOFT).fontSize(10).font('Helvetica');
  doc.text(`Delivery note for invoice  ${invoice.invoice_no}`, 40, 130);
  doc.text(`Campaign                   ${gig.title}`, 40, 145);
  doc.text(`Brand                      ${gig.brand}`, 40, 160);
  doc.text(`Creator                    ${user.name} (@${user.handle})`, 40, 175);
  doc.text(`Delivered by               ${new Date(invoice.paid_at || Date.now()).toLocaleDateString('en-KE')}`, 40, 190);

  let y = 225;
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(10);
  doc.text('Deliverable', 40, y);
  doc.text('Qty', 400, y);
  doc.text('Status', 480, y);
  y += 16;
  doc.moveTo(40, y).lineTo(555, y).strokeColor('#dddddd').stroke();
  y += 10;

  doc.font('Helvetica').fontSize(10).fillColor(INK);
  deliverables.forEach((d) => {
    doc.text(d.title, 40, y, { width: 330 });
    doc.text(String(d.quantity), 400, y);
    doc.fillColor(TEAL).text('Accepted', 480, y);
    doc.fillColor(INK);
    y += 20;
  });

  doc.fontSize(8).fillColor(SOFT).font('Helvetica')
    .text('All deliverables listed above were submitted by the creator and accepted as complete prior to invoicing. Motion Trybe Ventures Corporation, Nairobi, Kenya.', 40, 780, { width: 515 });

  doc.end();

  db.prepare('INSERT INTO marketplace_documents (id, invoice_id, doc_type, file_path, created_at) VALUES (?,?,?,?,datetime(\'now\'))')
    .run(docId, invoice.id, 'delivery_note', filePath);

  return { id: docId, filePath };
}

function getDocument(docId) {
  return db.prepare('SELECT * FROM marketplace_documents WHERE id = ?').get(docId);
}

function documentsForInvoice(invoiceId) {
  const rows = db.prepare('SELECT * FROM marketplace_documents WHERE invoice_id = ?').all(invoiceId);
  return {
    receiptId: (rows.find((r) => r.doc_type === 'receipt') || {}).id || null,
    deliveryNoteId: (rows.find((r) => r.doc_type === 'delivery_note') || {}).id || null,
  };
}

module.exports = { generateReceipt, generateDeliveryNote, getDocument, documentsForInvoice };
