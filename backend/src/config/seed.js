const { db, transaction } = require('./db');
const { id } = require('../utils/helpers');
const { hashPassword } = require('../utils/auth-crypto');
const revenue = require('../modules/revenue/revenue.service');
const { CATEGORIES, DELIV_POOL, COMMUNITY_GROUPS, COMMERCE_LISTINGS, CULTURE_POSTS, SAMPLE_EVENTS } = require('./trybe-seed-data');

// Deterministic per-brand campaign generator (same shape as the product
// design's client-side prototype, ported server-side so gigs persist and
// don't reshuffle on every request). Seeded from the brand name so re-runs
// are stable even though this only fires once (guarded by the empty-table
// check in seedMarketplace).
function gigsForBrand(name, catName, ageRestricted) {
  let seed = 0;
  for (const ch of name) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  const shuffled = (arr) => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const objectives = ['Always-on content', 'Product seeding', 'Event activation', 'Brand ambassador push', 'Seasonal push', 'Campaign amplification'];
  const cities = ['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret'];
  const count = 2 + Math.floor(rnd() * 3); // 2-4 gigs per brand
  const gigs = [];

  for (let i = 0; i < count; i++) {
    const isLive = i === 0;
    const nd = 2 + Math.floor(rnd() * 3); // 2-4 deliverables
    const picks = shuffled(DELIV_POOL).slice(0, nd);
    const deliverables = picks.map((p) => ({ title: p.t, quantity: 1 + Math.floor(rnd() * 2), unitPriceCents: p.u * 100 }));
    const budgetCents = deliverables.reduce((s, d) => s + d.quantity * d.unitPriceCents, 0);
    const objective = isLive ? 'Live campaign — creators wanted now' : objectives[Math.floor(rnd() * objectives.length)];
    gigs.push({
      title: isLive ? name : `${name} — ${objectives[Math.floor(rnd() * objectives.length)]}`,
      objective,
      scope: `Create authentic, culture-first content for ${name}${isLive ? ' as part of the ongoing brand campaign' : ''}, tailored to a Gen-Z Kenyan audience. Content must align with ${name}'s brand guidelines, feature the product naturally, and drive measurable engagement across your channels.`,
      eligibility: `Min 5K followers · ${catName.split(/[ ,&]/)[0]} / lifestyle niche · ${cities[Math.floor(rnd() * cities.length)]}${ageRestricted ? ' · 18+ verified' : ''}`,
      budgetCents,
      isLive,
      deliverables,
    });
  }
  return gigs;
}

function seedMarketplace() {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM brand_categories').get().n;
  if (existing > 0) return;

  transaction(() => {
    CATEGORIES.forEach((cat, catIdx) => {
      const categoryId = id('cat');
      db.prepare('INSERT INTO brand_categories (id, name, icon, age_restricted, sort_order) VALUES (?,?,?,?,?)')
        .run(categoryId, cat.name, cat.ico, cat.age ? 1 : 0, catIdx);

      cat.brands.forEach((brand, brandIdx) => {
        const brandId = id('brand');
        db.prepare('INSERT INTO brands (id, category_id, name, color, text_color, campaign, sort_order) VALUES (?,?,?,?,?,?,?)')
          .run(brandId, categoryId, brand.n, brand.c, brand.t, brand.camp, brandIdx);

        const gigs = gigsForBrand(brand.n, cat.name, cat.age);
        gigs.forEach((g) => {
          const gigId = id('gig');
          db.prepare(
            `INSERT INTO gigs (id, brand_id, title, objective, scope, eligibility, budget_cents, is_live, status, created_at)
             VALUES (?,?,?,?,?,?,?,?, 'open', datetime('now'))`
          ).run(gigId, brandId, g.title, g.objective, g.scope, g.eligibility, g.budgetCents, g.isLive ? 1 : 0);
          const insertDeliverable = db.prepare(
            'INSERT INTO gig_deliverables (id, gig_id, title, quantity, unit_price_cents, sort_order) VALUES (?,?,?,?,?,?)'
          );
          g.deliverables.forEach((d, i) => insertDeliverable.run(id('gdel'), gigId, d.title, d.quantity, d.unitPriceCents, i));
        });
      });
    });
  });
}

function seedCommunity() {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM community_groups').get().n;
  if (existing > 0) return;
  COMMUNITY_GROUPS.forEach((g) => {
    db.prepare('INSERT INTO community_groups (id, name, description, category, member_count, gradient) VALUES (?,?,?,?,?,?)')
      .run(id('grp'), g.name, g.description, g.category, g.memberCount, g.gradient);
  });
}

function seedCommerce() {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM commerce_listings').get().n;
  if (existing > 0) return;
  COMMERCE_LISTINGS.forEach((l) => {
    db.prepare(
      `INSERT INTO commerce_listings (id, seller_id, seller_handle, title, price_cents, category, status, created_at)
       VALUES (?,NULL,?,?,?,?, 'active', datetime('now'))`
    ).run(id('list'), l.sellerHandle, l.title, l.priceKES * 100, l.category);
  });
}

function seedCulture() {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM culture_posts').get().n;
  if (existing > 0) return;
  CULTURE_POSTS.forEach((p) => {
    db.prepare('INSERT INTO culture_posts (id, title, subtitle, tag, gradient, created_at) VALUES (?,?,?,?,?,datetime(\'now\'))')
      .run(id('cul'), p.title, p.subtitle, p.tag, p.gradient);
  });
}

function seedEvents(organizerId) {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM events').get().n;
  if (existing > 0) return;
  SAMPLE_EVENTS.forEach((e) => {
    const eventId = id('evt');
    db.prepare(
      `INSERT INTO events (id, organizer_id, name, category, venue, city, event_date, gate_time, description, status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?, 'published', datetime('now'))`
    ).run(eventId, organizerId, e.name, e.category, e.venue, e.city, e.event_date, e.gate_time, e.description);
    const insertTier = db.prepare('INSERT INTO ticket_tiers (id, event_id, name, price_cents, quantity_total, quantity_sold) VALUES (?,?,?,?,?,0)');
    e.tiers.forEach((t) => insertTier.run(id('tier'), eventId, t.name, t.price * 100, 300));
  });
}

function buildSeats(flightId, rows, cols, businessRows, letters) {
  const insert = db.prepare('INSERT INTO flight_seats (id, flight_id, row_no, letter, cabin_class, status) VALUES (?,?,?,?,?,?)');
  let seatIndex = 0;
  for (let r = 1; r <= rows; r++) {
    const isBiz = r <= businessRows;
    for (let c = 0; c < cols; c++) {
      seatIndex++;
      // deterministic "already booked" pattern so the demo always looks realistic
      const status = seatIndex % 4 === 0 ? 'booked' : 'available';
      insert.run(id('seat'), flightId, r, letters[c], isBiz ? 'business' : 'economy', status);
    }
  }
}

async function seed() {
  revenue.seedRules();

  const flightCount = db.prepare('SELECT COUNT(*) AS n FROM flights').get().n;
  if (flightCount === 0) {
    const f1 = id('flt');
    db.prepare(`INSERT INTO flights (id, airline, flight_no, origin, destination, flight_date, departs_at, duration_minutes, economy_fare_cents, business_fare_cents)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(f1, 'Safarilink', 'FL 1204', 'Nairobi Wilson', 'Ukunda (Diani)', '2026-09-12', '07:20', 65, 650000, null);
    buildSeats(f1, 12, 4, 0, ['A', 'B', 'C', 'D']);

    const f2 = id('flt');
    db.prepare(`INSERT INTO flights (id, airline, flight_no, origin, destination, flight_date, departs_at, duration_minutes, economy_fare_cents, business_fare_cents)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(f2, 'Jambojet', 'JM 220', 'Nairobi JKIA', 'Mombasa Moi', '2026-09-12', '08:10', 70, 520000, null);
    buildSeats(f2, 15, 6, 0, ['A', 'B', 'C', 'D', 'E', 'F']);

    const f3 = id('flt');
    db.prepare(`INSERT INTO flights (id, airline, flight_no, origin, destination, flight_date, departs_at, duration_minutes, economy_fare_cents, business_fare_cents)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(f3, 'Kenya Airways', 'KQ 610', 'Nairobi JKIA', 'Mombasa Moi', '2026-09-12', '09:00', 65, 780000, 1850000);
    buildSeats(f3, 15, 6, 3, ['A', 'B', 'C', 'D', 'E', 'F']);
  }

  const propCount = db.prepare('SELECT COUNT(*) AS n FROM properties').get().n;
  if (propCount === 0) {
    const properties = [
      { name: 'Diani Sands Villa', location: 'Diani Beach', rooms: [
        { name: 'Garden Standard', price: 650000, cap: 2, tags: ['Fan', 'Garden view', 'Breakfast'] },
        { name: 'Ocean Deluxe', price: 1120000, cap: 3, tags: ['AC', 'Sea view', 'Breakfast'] },
        { name: 'Beachfront Suite', price: 1890000, cap: 4, tags: ['AC', 'Private deck', 'Butler'] },
      ]},
      { name: 'Lamu Beach House', location: 'Lamu Old Town', rooms: [
        { name: 'Swahili Room', price: 540000, cap: 2, tags: ['Fan', 'Courtyard'] },
        { name: 'Rooftop Room', price: 980000, cap: 2, tags: ['AC', 'Rooftop access'] },
        { name: 'Family Wing', price: 1560000, cap: 5, tags: ['AC', '2 bedrooms', 'Kitchen'] },
      ]},
      { name: 'Nairobi Loft', location: 'Westlands', rooms: [
        { name: 'City Studio', price: 720000, cap: 2, tags: ['AC', 'Workspace', 'Wifi'] },
        { name: 'Executive Loft', price: 1250000, cap: 2, tags: ['AC', 'Skyline view', 'Wifi'] },
        { name: 'Penthouse', price: 2400000, cap: 4, tags: ['AC', 'Rooftop', 'Parking'] },
      ]},
    ];
    properties.forEach((p) => {
      const propId = id('prop');
      db.prepare('INSERT INTO properties (id, name, location) VALUES (?,?,?)').run(propId, p.name, p.location);
      p.rooms.forEach((r) => {
        db.prepare('INSERT INTO rooms (id, property_id, name, price_cents, capacity, tags) VALUES (?,?,?,?,?,?)')
          .run(id('room'), propId, r.name, r.price, r.cap, JSON.stringify(r.tags));
      });
    });
  }

  const adminEmail = 'admin@motion.africa';
  let admin = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (!admin) {
    const passwordHash = await hashPassword('ChangeMe123!');
    const adminId = id('usr');
    db.prepare(`INSERT INTO users (id, name, email, password_hash, role, wallet_balance_cents, created_at) VALUES (?,?,?,?,?,0,datetime('now'))`)
      .run(adminId, 'Motion Admin', adminEmail, passwordHash, 'admin');
    admin = { id: adminId };
    console.log(`Seeded admin account: ${adminEmail} / ChangeMe123!  (change this immediately in any real deployment)`);
  }

  seedMarketplace();
  seedCommunity();
  seedCommerce();
  seedCulture();
  seedEvents(admin.id);
}

module.exports = { seed };
