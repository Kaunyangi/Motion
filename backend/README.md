# Motion × Trybe — Backend + Integrated Frontend

A working full-stack implementation of **Trybe**, the Motion Trybe Ventures
Corporation youth-culture app: account creation with onboarding, a **Brand
Marketplace** where creators apply to real brand campaigns, submit
deliverables, and generate Motion × Trybe watermarked invoices, a wallet
("Motion Pay"), community groups, peer-to-peer commerce listings, an
editorial culture feed, and Motion-issued event tickets — all served by one
Node.js process, all backed by a real SQL database (no mock arrays, no
`localStorage`-only state).

This is real, running code, not a mockup — start it and every workflow in the
UI is backed by an API call: sign up, pick your pillars, browse 220+ seeded
brands across 11 categories, apply to a gig, mark deliverables done, generate
an invoice, edit its line items, send it, simulate the brand paying it, and
watch the net payout land in your wallet. The one deliberate seam is
payments: this sandbox has no route to Safaricom's Daraja API or a card
network and no live merchant credentials, so the payment layer is a
swappable **provider interface** with mock M-Pesa/card providers behind it.
See "Going live with real payments" below for exactly what to change.

## Quick start

```bash
npm install
npm start          # http://localhost:4000 — frontend + API, same process
```

On first boot the server seeds:
- 11 brand categories (Aviation, Drinks, QSR, FMCG, Fashion, Beauty, Tech,
  Finance, Auto, Retail, Media) with 220 real-world brand names, each with
  2–4 procedurally-generated gigs and deliverables
- 6 community groups, 6 commerce listings, 6 culture editorial posts
- 6 sample events (with ticket tiers) issued through the existing Motion
  ticketing engine
- Commission rules (ticketing 8%, flights 5%, stays 12%, marketplace fee 10%)
- 3 sample flights and 3 sample properties (legacy Motion travel modules —
  not surfaced in the Trybe UI, but still live under `/api`)
- An admin account: `admin@motion.africa` / `ChangeMe123!` — **rotate this
  immediately in any real deployment.**

Open `http://localhost:4000` and sign up as a creator — the UI is the actual
product, not a demo shell.

## Architecture

```
src/
  config/
    db.js               — the only file that touches the database driver
    seed.js              — demo data seeding, orchestrates every seed function
    trybe-seed-data.js    — the brand/category/community/commerce/culture/event catalogue
  middleware/
    auth.js              — JWT verification, attaches the full public user shape to req.user
    validate.js           — zod request validation
    idempotency.js         — Idempotency-Key header handling for checkout endpoints
    errorHandler.js
  modules/
    auth/                — register (handle/phone/ID/avatar), login by email/phone/handle, /me profile
    posts/                — campaign photo/video posts on a creator's profile
    marketplace/          — categories → brands → gigs → applications → invoices (the core feature)
    community/            — groups + membership
    commerce/             — P2P listings
    culture/              — editorial feed
    wallet/               — balance, top-up, transaction history
    events/, tickets/      — event catalogue + inventory-safe ticket checkout (issues Trybe's event tickets)
    flights/, stays/       — legacy Motion travel modules (unused by the Trybe UI, still functional)
    payments/             — provider interface (mock M-Pesa / card / wallet)
    revenue/              — commission rule engine + admin endpoints
    documents/             — PDF receipt/invoice generation for ticket orders + secured download
  routes/index.js          — mounts every module under /api
  server.js                — security middleware stack (CSP tuned for the inline-handler frontend) + static frontend
public/
  index.html, styles.css, app.js — the Trybe UI: signup/onboarding, hub, marketplace,
    community, creator dashboard, commerce, events, culture — every screen talks to
    the API via fetch(), JWT held in localStorage
```

Each domain is isolated behind its own routes file and only touches the
database through `db.prepare(...)` with parameterized queries — no string-built
SQL anywhere. Adding a new domain (e.g. sponsorship marketplace, Pay Later)
means adding a new folder under `modules/` and mounting it in `routes/index.js`;
nothing else needs to change.

## The Brand Marketplace flow, end to end

1. `GET /api/marketplace/categories` → `/categories/:id/brands` → `/brands/:id`
   walks a creator from category to brand to that brand's open gigs (seeded
   once at boot with a deterministic per-brand generator, so gigs persist
   instead of re-rolling on every request).
2. `POST /api/marketplace/gigs/:id/apply` awards the gig instantly (matches
   the product's "apply → awarded" flow) and copies the gig's deliverable
   template into a per-application `application_deliverables` row set.
3. `PATCH /api/marketplace/applications/:id/deliverables/:deliverableId`
   toggles each deliverable submitted; once all are done the application
   flips to `in_production` and invoicing unlocks.
4. `POST /api/marketplace/applications/:id/invoice` generates a real invoice
   (sequential `TRB-INV-<year>-NNNNN` numbering, 10% platform fee, 16% VAT)
   with line items copied from the submitted deliverables — editable via
   `PATCH /api/marketplace/invoices/:id` while still a draft.
5. `POST /api/marketplace/invoices/:id/send` → `.../pay` simulates the brand
   paying: the creator's `wallet_balance_cents` is credited with the **net**
   payout (subtotal minus the 10% fee) inside the same DB transaction that
   marks the invoice paid, and the full three-way split — creator payout,
   platform fee retained, VAT collected — is recorded in `marketplace_ledger`,
   one row per bucket, so the sum of the three always equals the total the
   brand paid. `GET /api/marketplace/admin/summary` (admin-only) totals each
   bucket across every invoice ever paid — the backend's financial record of
   the marketplace, independent of any single invoice document.
6. The same `pay` call auto-generates a **payment receipt** and a **delivery
   note** (`marketplace-documents.service.js`, pdfkit) and stores them in
   `marketplace_documents`; the invoice response's `documents.receiptId` /
   `documents.deliveryNoteId` let the frontend offer them for download via
   `GET /api/marketplace/documents/:id/download` (owner or admin only).

7. `GET /api/marketplace/invoices/:id/pdf` generates the invoice itself as a
   real PDF server-side (`marketplace-invoice-pdf.service.js`, pdfkit — no
   external CDN, no browser print dialog). It's regenerated fresh on every
   request rather than stored, so a still-draft invoice's edited line items
   are always reflected instead of serving a stale file. This is the
   frontend's primary "⬇ Download PDF invoice" button; the older client-side
   jsPDF/browser-print export is kept alongside as a "🖨 Branded print
   preview" for the closer-to-the-app-design visual, with jsPDF itself
   falling back to a print dialog if its CDN doesn't load.

Every one of these documents is deliberately status-agnostic: the
draft/sent/paid stamp is an **in-app-only** workflow indicator and never
appears on a downloaded or printed invoice, receipt, or delivery note.

## Why node:sqlite instead of Postgres/MySQL

This sandbox cannot compile native modules (no network route to fetch
node-gyp's Node headers) or reach an external database host. Node 22 ships
an experimental built-in `node:sqlite` module, which gives real SQL,
transactions, and prepared statements with zero native dependencies. `db.js`
is the only file that imports it — swapping to Postgres for production means
replacing that one file with a `pg` pool that exposes the same
`{ db, transaction }` shape; every route file is unaffected.

## Money safety — how double-booking/double-charging is prevented

- **Ticket inventory**: `quantity_sold` is incremented inside the same
  write transaction that checks remaining stock, so two simultaneous buyers
  can't oversell a tier (tested — see "Overselling protection" below).
- **Flight seats**: a seat's `status` flips to `booked` inside the same
  transaction that validates it was `available`.
- **Room bookings**: a date-range overlap query runs inside the booking
  transaction, so two guests can't book the same room for overlapping dates.
- **Idempotency-Key header**: every checkout endpoint accepts one. A retried
  request with the same key returns the original order instead of charging
  twice — this matters on the flaky mobile networks the product doc calls out.
- **External payment call happens outside the DB transaction.** If the
  charge fails, the reserved inventory is released in a follow-up
  transaction rather than holding a DB lock open during network I/O.

## Revenue engine — "cut our commission"

`commission_rules` is a live-editable table, not a constant in code:

```
PATCH /api/revenue/rules/ticketing_fee   { "rate_percent": 3 }
PATCH /api/revenue/rules/flight_commission { "active": false }   # fully waive
```

Every new order picks up the current rate at the moment of sale; past
orders/invoices are untouched, so a rate change is auditable rather than
silently rewriting history. `GET /api/revenue/summary` gives an all-time
total per revenue line. This was tested live: cutting the ticketing fee from
8% to 3% took effect on the next order with no restart.

## Invoices & receipts

Every paid order generates:
- A **buyer receipt** (proof of payment, itemized, PDF)
- An **organizer invoice** for ticket sales (gross sale → commission line(s)
  → net payout, PDF) — this is what makes a commission change auditable to
  the person actually being paid out.

Both are real PDFs (via `pdfkit`), stored on disk, and served through
`GET /api/documents/:id/download`, which checks that the requester is the
buyer, the payee organizer, or an admin before streaming the file.

## Security measures implemented

- `helmet()` for standard security headers (HSTS, no-sniff, frameguard, etc.)
- JWT auth (`jsonwebtoken`) with a 12h expiry; passwords hashed with `bcryptjs`
  (cost factor 11), never stored or logged in plaintext
- Role-based access control (`buyer` / `organizer` / `admin`) enforced per route
- `zod` schema validation on every request body — bad input never reaches
  business logic
- Global rate limiting (300 req/min) plus a stricter limiter (20 req/min) on
  auth and every checkout/top-up endpoint, to blunt credential-stuffing and
  payment-spam attempts
- Parameterized SQL everywhere — no string-concatenated queries, so standard
  SQL injection is not applicable
- `audit_log` table recording register/login, event publishing, purchases,
  and every commission-rule change, with actor, action, metadata, and IP
- Generic auth error messages ("Invalid email or password") that don't
  reveal whether an email is registered
- Document access control checked per request, not assumed from a URL

### What's not done yet — be honest about the gap
This is a strong foundation, not a completed security audit. Before real
money moves through this, you'd still want: HTTPS/TLS termination (typically
at a reverse proxy, not in Node), refresh-token rotation instead of a single
12h JWT, request logging shipped to a SIEM, dependency vulnerability
scanning in CI, secrets pulled from a vault instead of `.env`, and a real
penetration test. The architecture doesn't fight any of these — there's just
more to add.

## Going live with real payments

Replace `MpesaMockProvider` / `CardMockProvider` in
`src/modules/payments/providers.js` with real adapters that implement the
same `charge({ amountCents, payerRef, description })` interface:

```js
class DarajaMpesaProvider {
  async charge({ amountCents, payerRef, description }) {
    // call Safaricom's Daraja STK Push endpoint, poll/await the callback,
    // return { status: 'success'|'failed', providerRef, raw }
  }
}
```

No other file changes — `PROVIDERS.mpesa = new DarajaMpesaProvider()` and the
whole order/ticket/flight/stay flow starts moving real money through the
same commission, ledger, and document pipeline already built.

## API reference (short form)

| Method & path | Auth | Purpose |
|---|---|---|
| POST /api/auth/register | — | create account (handle/phone/ID/avatar) |
| POST /api/auth/login | — | login by email, phone, or handle |
| GET/PATCH /api/auth/me | creator+ | profile, onboarding picks, avatar |
| GET /api/posts/mine, POST /api/posts, DELETE /api/posts/:id | creator+ | profile campaign posts |
| GET /api/marketplace/categories, /categories/:id/brands, /brands/:id | — | browse the marketplace |
| GET /api/marketplace/gigs, /gigs/:id | — | open gig feed / detail |
| POST /api/marketplace/gigs/:id/apply | creator+ | apply & get awarded |
| GET /api/marketplace/applications, /applications/:id | creator+ | "my gigs" |
| PATCH /api/marketplace/applications/:id/deliverables/:id | creator+ | mark a deliverable submitted |
| POST /api/marketplace/applications/:id/invoice | creator+ | generate invoice |
| GET/PATCH /api/marketplace/invoices/:id | creator+ | view / edit line items |
| GET /api/marketplace/invoices/:id/pdf | owner/admin | the invoice itself as a real PDF, generated fresh each request |
| POST /api/marketplace/invoices/:id/send, /pay | creator+ | send invoice, simulate brand payment (auto-generates receipt + delivery note) |
| GET /api/marketplace/documents/:id/download | owner/admin | payment receipt / delivery note PDF |
| GET /api/marketplace/admin/summary | admin | creator payouts vs. platform fees vs. tax collected, all-time |
| GET /api/community/groups, POST /groups/:id/join, /leave | creator+ (browse is public) | community groups |
| GET /api/commerce/listings, POST /listings, PATCH /listings/:id/sold | creator+ (browse is public) | P2P marketplace |
| GET /api/culture/posts | — | editorial feed |
| GET/POST /api/wallet, /wallet/topup | creator+ | balance, top-up |
| GET /api/events, /api/events/:id | — | public catalogue |
| POST /api/tickets/checkout, GET /tickets/mine | creator+ | buy / list tickets |
| GET/PATCH /api/revenue/rules, GET /summary | admin | commission control |
| GET /api/documents/:id/download | owner/payee/admin | PDF ticket receipt/invoice |

## Extending further

- New revenue line (e.g. sponsorship placement fee): add a row to
  `commission_rules`, a `revenue.computeCommission('sponsorship', ...)` call
  at the relevant checkout point — the admin panel picks it up automatically.
- Trip bundling (event + flight + stay in one checkout): add an `orders`
  row with `order_type = 'bundle'` and multiple `order_items` referencing
  each domain — the ledger and document generators already work per line item.
- Cyber hardening: add `express-mongo-sanitize`-style input scrubbing, CSRF
  tokens if you move off pure bearer-token auth, and a WAF in front of this
  in production.
