// Shared shape for "the current user" as returned to the frontend and
// attached to req.user by the auth middleware — one place defines the
// public projection of the users row so every module agrees on field names.
const PUBLIC_COLUMNS = `id, name, email, role, wallet_balance_cents, handle, phone, id_masked,
  avatar_data_url, city, niches_json, picks_json, followers, following, verified, created_at`;

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    walletBalanceCents: row.wallet_balance_cents,
    handle: row.handle,
    phone: row.phone,
    idMasked: row.id_masked,
    avatar: row.avatar_data_url,
    city: row.city,
    niches: JSON.parse(row.niches_json || '[]'),
    picks: JSON.parse(row.picks_json || '[]'),
    followers: row.followers,
    following: row.following,
    verified: !!row.verified,
    createdAt: row.created_at,
  };
}

module.exports = { publicUser, PUBLIC_COLUMNS };
