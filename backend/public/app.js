/* ============ CORE HELPERS ============ */
const $ = (s, e = document) => e.querySelector(s);
const $$ = (s, e = document) => [...e.querySelectorAll(s)];
const fmt = (cents) => 'KES ' + Math.round((cents || 0) / 100).toLocaleString('en-KE');
const initials = (n) => (n || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || 'T';

const TOKEN_KEY = 'trybe_token';
const getToken = () => localStorage.getItem(TOKEN_KEY);
const setToken = (t) => { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); };

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch('/api' + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch (_) { /* empty body */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status; err.details = data && data.details;
    throw err;
  }
  return data;
}

function toast(m) { const t = $('#toast'); t.innerHTML = m; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2800); }
function openSheet(html) { $('#sheet').innerHTML = html; $('#overlay').classList.add('on'); }
function closeSheet() { $('#overlay').classList.remove('on'); }
$('#overlay').addEventListener('click', (e) => { if (e.target === $('#overlay')) closeSheet(); });
function loadingRow(label) { return `<div class="loading-row"><span class="spinner"></span> ${label || 'Loading…'}</div>`; }

function brandLogo(name, color, textColor, size) {
  size = size || 46;
  const parts = (name || '').replace(/[^A-Za-z0-9 ].*/, '').trim().split(/\s+/);
  let mono = parts.length > 1 ? (parts[0][0] + parts[1][0]) : (name || '?').slice(0, 2);
  mono = mono.toUpperCase();
  const fs = Math.round(size * 0.36);
  return `<span class="brand-logo" style="width:${size}px;height:${size}px;background:${color || '#DC3A21'};color:${textColor || '#fff'};font-size:${fs}px">${mono}</span>`;
}

/* ============ PILLARS (static onboarding/nav metadata) ============ */
const PILLARS = [
  { id: 'community', ico: '🫱🏾‍🫲🏿', c: 'var(--red)', name: 'Community Groups', desc: 'Interest-based trybes with tools to organise, plan, and move together.', kw: 'Belonging · Squads' },
  { id: 'creator', ico: '🎬', c: 'var(--blue)', name: 'Creator Monetization', desc: 'Your wallet, payouts and paid gigs in one dashboard.', kw: 'Creator economy · Get paid' },
  { id: 'marketplace', ico: '🛍️', c: 'var(--coral)', name: 'Brand Marketplace', desc: 'Win verified brand gigs, agree scope, deliver & invoice brands directly.', kw: 'Gigs · Invoices · Access' },
  { id: 'commerce', ico: '🔄', c: 'var(--green)', name: 'Social Commerce', desc: 'Peer-to-peer buying & selling with your trybe as the trust layer.', kw: 'P2P · Thrift · Resale' },
  { id: 'events', ico: '🎟️', c: 'var(--teal)', name: 'Digital & Live Events', desc: 'Discover, RSVP, and buy tickets — issued through Motion.', kw: 'Events · Tickets' },
  { id: 'culture', ico: '🌍', c: 'var(--ink)', name: 'Cultural Curation', desc: 'Editorial intelligence on what’s moving across African cities.', kw: 'Insight · Trends · Voice' },
];
const VIEW_META = { hub: { ico: '⌂', name: 'Home' }, marketplace: { ico: '🛍', name: 'Brand Marketplace' }, community: { ico: '🫂', name: 'Community' },
  creator: { ico: '🎬', name: 'Creator' }, commerce: { ico: '🔄', name: 'Commerce' }, events: { ico: '🎟', name: 'Events' }, culture: { ico: '🌍', name: 'Culture' } };

/* ============ STATE ============ */
const state = {
  user: null, view: 'hub',
  authMode: 'signup', authStep: 0, draft: {}, authError: '',
  mkMode: 'categories', mkCat: null, categories: null,
  currentBrand: null, currentGigView: null, myApplications: null,
};

/* ============ AUTH FLOW ============ */
const SIGNUP_STEPS = 4;

function renderAuth() {
  const inner = $('#authInner');
  if (state.authMode === 'signin') { renderSignin(inner); return; }
  const dots = Array.from({ length: SIGNUP_STEPS }, (_, i) => `<i class="${i <= state.authStep ? 'on' : ''}"></i>`).join('');
  const errBanner = state.authError ? `<div class="formerr">${state.authError}</div>` : '';
  let body = '';
  if (state.authStep === 0) {
    body = `
    ${errBanner}
    <h2>Create your account</h2>
    <p class="sub">Join the trybe in under a minute.</p>
    <div class="oauth">
      <button type="button" onclick="toast('Social sign-up isn\\'t wired up in this build — continue with email')">G · Google</button>
      <button type="button" onclick="toast('Social sign-up isn\\'t wired up in this build — continue with email')">⌘ · Apple</button>
    </div>
    <div class="divider">or sign up with email</div>
    <div class="f2">
      <div class="field" id="f-first"><label>First name</label><input id="i-first" placeholder="Wanjiru" value="${state.draft.firstName || ''}"><div class="errmsg">Required</div></div>
      <div class="field" id="f-last"><label>Last name</label><input id="i-last" placeholder="Kamau" value="${state.draft.lastName || ''}"><div class="errmsg">Required</div></div>
    </div>
    <div class="field" id="f-handle"><label>Username</label><input id="i-handle" placeholder="wanjiru" value="${state.draft.handle || ''}"><div class="hint">Your public @handle — like Instagram.</div><div class="errmsg">Pick a handle</div></div>
    <div class="field" id="f-email"><label>Email</label><input id="i-email" type="email" placeholder="you@email.com" value="${state.draft.email || ''}"><div class="errmsg">Enter a valid email</div></div>
    <button class="btn red block" style="margin-top:8px" onclick="signupNext()">Continue →</button>
    <div class="swap">Already in the trybe? <button onclick="switchAuth('signin')">Sign in</button></div>`;
  } else if (state.authStep === 1) {
    body = `
    <h2>Verify it's you</h2>
    <p class="sub">We'd normally text a code to <b>${state.draft.phone || 'your phone'}</b>. This build skips real SMS delivery — enter any 6 digits to continue.</p>
    <div class="field" id="f-phone"><label>Phone / contact</label><input id="i-phone" placeholder="+254 7•• ••• •••" value="${state.draft.phone || '+254'}"><div class="hint">Used for OTP and M-Pesa payouts.</div><div class="errmsg">Enter your phone</div></div>
    <label style="font-size:12.5px;font-weight:700;margin-bottom:6px;display:block">Enter code</label>
    <div class="otp-row" id="otpRow">${[0, 1, 2, 3, 4, 5].map((i) => `<input maxlength="1" inputmode="numeric" data-i="${i}">`).join('')}</div>
    <div class="hint" style="margin-top:8px">Try <b>123456</b>.</div>
    <button class="btn red block" style="margin-top:16px" onclick="signupNext()">Verify & continue →</button>
    <div class="swap"><button onclick="authBack()">← Back</button></div>`;
  } else if (state.authStep === 2) {
    body = `
    <h2>Secure your account</h2>
    <p class="sub">Add a profile photo and set a password.</p>
    <div class="avatar-upload">
      <div class="au-preview" id="auPreview" style="${state.draft.avatar ? `background-image:url(${state.draft.avatar})` : ''}">${state.draft.avatar ? '' : initials((state.draft.firstName || '') + ' ' + (state.draft.lastName || ''))}</div>
      <div><button type="button" class="btn ghost sm" onclick="$('#avatarFile').click()">Upload photo</button>
      <div class="hint">JPG or PNG · shown on your profile & invoices. Optional.</div></div>
      <input type="file" id="avatarFile" accept="image/*" hidden>
    </div>
    <div class="field" id="f-id"><label>National ID / Passport no.</label><input id="i-id" placeholder="e.g. 3••••••" value="${state.draft.idNumber || ''}"><div class="id-note">🔒 Used only for KYC, payouts & age-gating. Never shown on your profile or invoices in full.</div><div class="errmsg">Required for payouts</div></div>
    <div class="field" id="f-pw"><label>Password</label><input id="i-pw" type="password" placeholder="Min 8 characters" oninput="pwMeter(this.value)" value="${state.draft.password || ''}">
      <div class="pw-meter"><i id="pwBar"></i></div><div class="pw-label" id="pwLabel">Use 8+ chars with a number & symbol</div><div class="errmsg">At least 8 characters</div></div>
    <div class="field" id="f-pw2"><label>Confirm password</label><input id="i-pw2" type="password" placeholder="Re-enter password"><div class="errmsg">Passwords must match</div></div>
    <button class="btn red block" style="margin-top:8px" onclick="signupNext()">Create account →</button>
    <div class="swap"><button onclick="authBack()">← Back</button></div>`;
  } else {
    body = `
    <div class="success" style="text-align:center">
      <div class="big">✓</div>
      <h2>Welcome to the trybe, ${state.draft.firstName}!</h2>
      <p class="sub" style="margin-top:8px">Your account <b>@${state.draft.handle}</b> is live. Now let's set up what you're here for.</p>
      <button class="btn red block" style="margin-top:14px" onclick="goOnboard()">Choose your features →</button>
    </div>`;
  }
  inner.innerHTML = `<div class="steps-dots">${dots}</div>${body}`;
  if (state.authStep === 1) wireOtp();
  if (state.authStep === 2) {
    const af = $('#avatarFile');
    if (af) af.onchange = (e) => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { state.draft.avatar = r.result; const pv = $('#auPreview'); pv.style.backgroundImage = `url(${r.result})`; pv.textContent = ''; toast('Photo added ✦'); };
      r.readAsDataURL(f);
    };
  }
}

function renderSignin(inner) {
  const errBanner = state.authError ? `<div class="formerr">${state.authError}</div>` : '';
  inner.innerHTML = `
    <div class="steps-dots"><i class="on"></i><i class="on"></i></div>
    ${errBanner}
    <h2>Welcome back</h2>
    <p class="sub">Sign in to your trybe.</p>
    <div class="field"><label>Email, phone or handle</label><input id="si-id" placeholder="you@email.com or @handle" value="${state.draft.identifier || ''}"></div>
    <div class="field"><label>Password</label><input id="si-pw" type="password" placeholder="Your password"></div>
    <div style="text-align:right;margin:-4px 0 14px"><button style="background:none;border:none;color:var(--red);font-size:12.5px;font-weight:600" onclick="toast('Password reset isn\\'t wired up in this build')">Forgot password?</button></div>
    <button class="btn red block" id="siGo" onclick="doSignin()">Sign in →</button>
    <div class="divider">or</div>
    <button class="btn ghost block" onclick="switchAuth('signup')">Create a new account</button>`;
}

function switchAuth(m) { state.authMode = m; state.authStep = 0; state.authError = ''; renderAuth(); }
function authBack() { state.authStep = Math.max(0, state.authStep - 1); renderAuth(); }
function pwMeter(v) {
  let s = 0; if (v.length >= 8) s++; if (/[0-9]/.test(v)) s++; if (/[^A-Za-z0-9]/.test(v)) s++; if (v.length >= 12) s++;
  const pct = [10, 40, 65, 85, 100][s] || 10, col = ['#DC3A21', '#DC3A21', '#F0713C', '#B5DF8B', '#1E8E5A'][s] || '#DC3A21';
  const lbl = ['Too short', 'Weak', 'Okay', 'Strong', 'Very strong'][s] || 'Weak';
  $('#pwBar').style.width = pct + '%'; $('#pwBar').style.background = col; $('#pwLabel').textContent = lbl;
}
function wireOtp() { $$('#otpRow input').forEach((b, i, arr) => b.addEventListener('input', () => { if (b.value && i < 5) arr[i + 1].focus(); })); }
function err(id) { const f = $('#' + id); if (f) f.classList.add('err'); }
function clr() { $$('.field.err').forEach((f) => f.classList.remove('err')); }

async function signupNext() {
  clr(); state.authError = ''; let ok = true;
  if (state.authStep === 0) {
    const firstName = $('#i-first').value.trim(), lastName = $('#i-last').value.trim(), handle = $('#i-handle').value.trim().replace(/^@/, ''), email = $('#i-email').value.trim();
    if (!firstName) { err('f-first'); ok = false; } if (!lastName) { err('f-last'); ok = false; }
    if (!handle) { err('f-handle'); ok = false; } if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err('f-email'); ok = false; }
    if (ok) Object.assign(state.draft, { firstName, lastName, handle, email });
  } else if (state.authStep === 1) {
    const phone = $('#i-phone').value.trim(); const code = $$('#otpRow input').map((b) => b.value).join('');
    if (phone.length < 7 || phone === '+254') { err('f-phone'); ok = false; }
    if (code.length < 6) { toast('Enter the 6-digit code'); ok = false; }
    if (ok) state.draft.phone = phone;
  } else if (state.authStep === 2) {
    const idNumber = $('#i-id').value.trim(), password = $('#i-pw').value, pw2 = $('#i-pw2').value;
    if (idNumber.length < 4) { err('f-id'); ok = false; } if (password.length < 8) { err('f-pw'); ok = false; }
    if (password !== pw2 || !pw2) { err('f-pw2'); ok = false; }
    if (ok) Object.assign(state.draft, { idNumber, password });
  }
  if (!ok) return;

  if (state.authStep === 2) {
    const btn = event && event.target;
    if (btn) { btn.disabled = true; btn.textContent = 'Creating account…'; }
    try {
      const { token, user } = await api('/auth/register', { method: 'POST', body: {
        firstName: state.draft.firstName, lastName: state.draft.lastName, handle: state.draft.handle,
        email: state.draft.email, phone: state.draft.phone, idNumber: state.draft.idNumber, password: state.draft.password,
        avatar: state.draft.avatar || undefined,
      } });
      setToken(token); state.user = user;
      state.authStep++;
      renderAuth();
    } catch (e) {
      state.authStep = 0; state.authError = e.message; renderAuth();
    }
    return;
  }
  state.authStep++;
  renderAuth();
}

async function doSignin() {
  const identifier = $('#si-id').value.trim(), password = $('#si-pw').value;
  if (!identifier || !password) { toast('Enter your login and password'); return; }
  state.draft.identifier = identifier;
  const btn = $('#siGo'); btn.disabled = true; btn.textContent = 'Signing in…';
  try {
    const { token, user } = await api('/auth/login', { method: 'POST', body: { identifier, password } });
    setToken(token); state.user = user; state.authError = '';
    if (!user.picks || !user.picks.length) goOnboard(); else enterApp();
  } catch (e) {
    state.authError = e.message; renderSignin($('#authInner'));
  }
}

function doLogout() {
  if (!confirm('Log out of Trybe?')) return;
  setToken(null); state.user = null; location.reload();
}

function goOnboard() {
  $('#authScreen').style.display = 'none'; $('#onboardScreen').style.display = 'block';
  $('#obHi').textContent = `what do you want trybe for, ${(state.user.name || '').split(' ')[0].toLowerCase()}?`;
  renderOnboard();
}

/* ============ ONBOARDING ============ */
function renderOnboard() {
  const picks = state.user.picks || [];
  $('#featGrid').innerHTML = PILLARS.map((p) => `
    <button class="feat ${picks.includes(p.id) ? 'on' : ''}" data-p="${p.id}">
      <span class="check">✓</span>
      <span class="ico" style="background:${p.c};color:${p.id === 'culture' ? '#fff' : (p.id === 'commerce' ? 'var(--ink)' : '#fff')}">${p.ico}</span>
      <h3>${p.name}</h3><p>${p.desc}</p><span class="kw">${p.kw}</span>
    </button>`).join('');
  $('#featGrid').onclick = (e) => {
    const c = e.target.closest('[data-p]'); if (!c) return;
    const id = c.dataset.p; const arr = state.user.picks;
    state.user.picks = arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
    renderOnboard();
  };
  updateObBar();
}
function updateObBar() {
  const n = state.user.picks.length;
  $('#obCnt').textContent = n ? `${n} feature${n > 1 ? 's' : ''} selected — home will open on these` : 'Select at least one to continue';
  $('#obGo').disabled = !n;
}
$('#obGo').onclick = async () => {
  $('#obGo').disabled = true; $('#obGo').textContent = 'Saving…';
  try {
    const { user } = await api('/auth/me', { method: 'PATCH', body: { picks: state.user.picks } });
    state.user = user;
  } catch (e) { toast(e.message); }
  enterApp();
};

/* ============ APP SHELL ============ */
function enterApp() {
  if (!state.user.picks || !state.user.picks.length) state.user.picks = ['marketplace', 'creator', 'events'];
  $('#authScreen').style.display = 'none'; $('#onboardScreen').style.display = 'none';
  $('#appShell').classList.add('on');
  const na = $('#navAvatar');
  if (state.user.avatar) { na.style.backgroundImage = `url(${state.user.avatar})`; na.style.backgroundSize = 'cover'; na.textContent = ''; }
  else na.textContent = initials(state.user.name);
  buildTabs(); syncEarn(); nav('hub');
}
function buildTabs() {
  const order = ['marketplace', 'creator', 'community', 'commerce', 'events', 'culture'];
  const picked = order.filter((id) => state.user.picks.includes(id));
  const tabs = ['hub', ...picked];
  $('#tabRow').innerHTML = tabs.map((v) => {
    const m = VIEW_META[v]; const badge = v === 'marketplace' ? `<span class="cnt" id="mkCnt" style="display:none">0</span>` : '';
    return `<button class="atab ${v === 'hub' ? 'on' : ''}" data-v="${v}">${m.ico} ${m.name} ${badge}</button>`;
  }).join('');
  $('#tabRow').onclick = (e) => { const t = e.target.closest('.atab'); if (t) nav(t.dataset.v); };
}
function nav(v) {
  state.view = v;
  $$('.atab').forEach((t) => t.classList.toggle('on', t.dataset.v === v));
  $$('.view').forEach((x) => x.classList.remove('on'));
  $('#v-' + v).classList.add('on');
  RENDER[v] && RENDER[v]();
  window.scrollTo({ top: 0 });
}
async function syncEarn() {
  $('#earnTop').textContent = fmt(state.user.walletBalanceCents);
  try {
    const { applications } = await api('/marketplace/applications');
    state.myApplications = applications;
    const active = applications.filter((a) => ['invoiced', 'sent'].includes(a.status)).length;
    const c = $('#mkCnt'); if (c) { c.textContent = active; c.style.display = active ? 'grid' : 'none'; }
  } catch (_) { /* non-fatal */ }
}
async function refreshWallet() {
  try { const { user } = await api('/auth/me'); state.user = { ...state.user, walletBalanceCents: user.walletBalanceCents }; syncEarn(); } catch (_) {}
}

/* ============ HUB ============ */
function avatarBlock(u, size, cls) {
  const s = size || 64;
  if (u.avatar) return `<div class="${cls}" style="width:${s}px;height:${s}px;background-image:url(${u.avatar});background-size:cover"></div>`;
  return `<div class="${cls}" style="width:${s}px;height:${s}px;font-size:${Math.round(s * 0.4)}px">${initials(u.name)}</div>`;
}
async function renderHub() {
  const u = state.user;
  $('#v-hub').innerHTML = loadingRow('Loading your hub…');
  let posts = [];
  try { posts = (await api('/posts/mine')).posts; } catch (e) { toast(e.message); }
  const order = ['marketplace', 'creator', 'community', 'commerce', 'events', 'culture'];
  $('#v-hub').innerHTML = `
  <div class="profile-strip">
    <div class="av-wrap">
      ${avatarBlock(u, 72, 'av')}
      <button class="av-edit" onclick="$('#profileAvatarFile').click()" title="Change photo">✎</button>
      <input type="file" id="profileAvatarFile" accept="image/*" hidden>
    </div>
    <div class="pmeta"><b>${u.name}</b> ${u.verified ? '<span class="verified">✔ verified</span>' : ''}<div class="h">@${u.handle} · ${u.city}</div>
      <div class="niches">${(u.niches || []).map((n) => `<span class="niche">${n}</span>`).join('')}</div></div>
    <div class="pstats">
      <div class="pstat"><b>${((u.followers || 0) / 1000).toFixed(1)}K</b><span>Followers</span></div>
      <div class="pstat"><b>${u.following || 0}</b><span>Following</span></div>
      <div class="pstat"><b>${posts.length}</b><span>Posts</span></div>
      <div class="pstat"><b>${fmt(u.walletBalanceCents).replace('KES ', '')}</b><span>Earned</span></div>
    </div>
  </div>

  <div class="posts-head">
    <h2>My campaign posts</h2>
    <button class="btn red sm" onclick="openPostComposer()">+ Post photo / video</button>
  </div>
  ${posts.length ? `<div class="posts-grid" id="postsGrid">${posts.map((p) => postTile(p)).join('')}</div>`
    : `<div class="empty" style="margin-bottom:22px"><b>No posts yet</b>Share photos & videos from your brand campaigns — tap "Post photo / video".</div>`}

  <div class="vhead" style="margin-top:26px"><h1>Your trybe hub</h1><p>Jump into what you're here for. Your picks are starred — tap any to open it.</p></div>
  <div class="hub-grid">${order.map((id) => { const p = PILLARS.find((x) => x.id === id);
    return `<button class="hub-card ${u.picks.includes(id) ? 'picked' : ''}" data-go="${id}">
      <span class="ico" style="background:${p.c};color:${id === 'commerce' ? 'var(--ink)' : '#fff'}">${p.ico}</span>
      <h3>${p.name}</h3><p>${p.desc}</p></button>`; }).join('')}
  </div>`;

  const paf = $('#profileAvatarFile');
  paf.onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = async () => {
      try {
        const { user } = await api('/auth/me', { method: 'PATCH', body: { avatar: r.result } });
        state.user = user; renderHub();
        const na = $('#navAvatar'); na.style.backgroundImage = `url(${r.result})`; na.style.backgroundSize = 'cover'; na.textContent = '';
        toast('Profile photo updated ✦');
      } catch (err) { toast(err.message); }
    };
    r.readAsDataURL(f);
  };
  $('#v-hub').onclick = (e) => {
    const del = e.target.closest('[data-delpost]');
    if (del) { e.stopPropagation(); deletePost(del.dataset.delpost); return; }
    const c = e.target.closest('[data-go]'); if (!c) return;
    if (u.picks.includes(c.dataset.go)) nav(c.dataset.go);
    else { u.picks.push(c.dataset.go); api('/auth/me', { method: 'PATCH', body: { picks: u.picks } }).catch(() => {}); buildTabs(); nav(c.dataset.go); toast('Added to your trybe ✦'); }
  };
}
function postTile(p) {
  const media = p.media_data_url ? (p.type === 'video' ? `<video class="pt-media" src="${p.media_data_url}" muted loop playsinline></video>` : `<div class="pt-media" style="background-image:url(${p.media_data_url});background-size:cover"></div>`)
    : `<div class="pt-media" style="background:linear-gradient(135deg,#DC3A21,#F0713C)"></div>`;
  return `<div class="post-tile">
    ${media}
    <span class="pt-type">${p.type === 'video' ? '▶ video' : '◻ photo'}</span>
    ${p.brand ? `<span class="pt-brand">${p.brand}</span>` : ''}
    <button class="pt-del" data-delpost="${p.id}" title="Delete">×</button>
    <div class="pt-info"><span class="pt-likes">♥ ${(p.likes || 0).toLocaleString()}</span><span class="pt-cap">${p.caption || ''}</span></div>
  </div>`;
}
async function deletePost(id) {
  try { await api('/posts/' + id, { method: 'DELETE' }); renderHub(); } catch (e) { toast(e.message); }
}
function openPostComposer() {
  openSheet(`<h2>Post a campaign photo or video</h2><p class="sub">Share your work — it appears on your profile grid.</p>
    <div class="composer-drop" id="composerDrop"><b id="cdLabel">⬆ Choose a photo or video</b><span>JPG, PNG or MP4</span>
      <div class="cd-preview" id="cdPreview"></div></div>
    <input type="file" id="postFile" accept="image/*,video/*" hidden>
    <div class="field" style="margin-top:14px"><label>Caption</label><input id="postCap" placeholder="e.g. Coca-Cola Summer Refresh 🥤 #RealMagic"></div>
    <div class="field"><label>Tag a brand (optional)</label><input id="postBrand" placeholder="e.g. Coca-Cola"></div>
    <button class="btn red block" id="postSubmit" style="margin-top:8px" disabled>Post to profile →</button>`);
  let media = null, mtype = 'image';
  const drop = $('#composerDrop');
  drop.onclick = () => $('#postFile').click();
  $('#postFile').onchange = (e) => {
    const f = e.target.files[0]; if (!f) return; mtype = f.type.startsWith('video') ? 'video' : 'image';
    const r = new FileReader();
    r.onload = () => {
      media = r.result;
      $('#cdPreview').innerHTML = mtype === 'video' ? `<video src="${media}" muted autoplay loop playsinline></video>` : `<img src="${media}">`;
      $('#cdLabel').textContent = mtype === 'video' ? 'Video selected ✓' : 'Photo selected ✓';
      $('#postSubmit').disabled = false;
    };
    r.readAsDataURL(f);
  };
  $('#postSubmit').onclick = async () => {
    if (!media) { toast('Choose a photo or video first'); return; }
    $('#postSubmit').disabled = true; $('#postSubmit').textContent = 'Posting…';
    try {
      await api('/posts', { method: 'POST', body: { type: mtype, mediaDataUrl: media, caption: $('#postCap').value || '', brand: $('#postBrand').value || '' } });
      closeSheet(); renderHub(); toast('Posted to your profile ✦');
    } catch (e) { toast(e.message); $('#postSubmit').disabled = false; $('#postSubmit').textContent = 'Post to profile →'; }
  };
}

/* ============ BRAND MARKETPLACE ============ */
async function renderMarketplace() {
  if (state.currentGigView) { renderGigView(); return; }
  const el = $('#v-marketplace');
  el.innerHTML = `<div class="vhead"><h1>Brand Marketplace</h1><p>Pick a category, choose a brand, and jump on their live campaign — agree the scope, deliver, and invoice with the Motion × Trybe watermark.</p></div>
  <div class="mk-tabs">
    <button class="chip ${state.mkMode === 'categories' ? 'on' : ''}" data-m="categories">Categories</button>
    <button class="chip ${state.mkMode === 'gigs' ? 'on' : ''}" data-m="gigs">Live campaigns</button>
    <button class="chip ${state.mkMode === 'mine' ? 'on' : ''}" data-m="mine">My gigs ${state.myApplications && state.myApplications.length ? `· ${state.myApplications.length}` : ''}</button>
  </div>
  <div id="mkBody">${loadingRow()}</div>`;
  $('.mk-tabs').onclick = (e) => { const c = e.target.closest('[data-m]'); if (c) { state.mkMode = c.dataset.m; state.mkCat = null; state.currentBrand = null; renderMarketplace(); } };
  if (state.mkMode === 'categories') renderCategoryHub();
  else if (state.mkMode === 'gigs') renderOpenGigs();
  else renderMyGigs();
}
async function renderCategoryHub() {
  if (state.currentBrand) { renderBrandGigs(); return; }
  if (state.mkCat) { renderCategoryBrands(state.mkCat); return; }
  if (!state.categories) { try { state.categories = (await api('/marketplace/categories')).categories; } catch (e) { $('#mkBody').innerHTML = `<div class="empty">${e.message}</div>`; return; } }
  $('#mkBody').innerHTML = `<div class="cat-hub">${state.categories.map((c) => `
    <button class="cat-card" data-cat="${c.id}">
      <span class="cat-ico">${c.icon || '🏷️'}</span>
      <div><b>${c.name}</b><span>${c.brandCount} brands · ${c.age ? '18+' : 'open'}</span></div>
      <span class="cat-arrow">→</span>
    </button>`).join('')}</div>`;
  $('.cat-hub').onclick = (e) => { const c = e.target.closest('[data-cat]'); if (c) { state.mkCat = c.dataset.cat; renderCategoryBrands(c.dataset.cat); } };
}
async function renderCategoryBrands(catId) {
  $('#mkBody').innerHTML = loadingRow();
  const { category, brands } = await api(`/marketplace/categories/${catId}/brands`);
  $('#mkBody').innerHTML = `
  <button class="back" onclick="state.mkCat=null;renderCategoryHub()">← All categories</button>
  <div class="cat-banner"><span class="cat-ico big">${category.icon}</span><div><h2>${category.name} ${category.age ? '<span class="age18">18+</span>' : ''}</h2><span class="mono">${brands.length} brands with live campaigns</span></div></div>
  <div class="brand-grid">${brands.map((b) => `
    <button class="brand-card" data-brand="${b.id}">
      ${brandLogo(b.name, b.color, b.textColor, 46)}
      <b>${b.name}${category.age ? '<span class="age18">18+</span>' : ''}</b>
      <span class="bc-camp">🔴 ${b.campaign}</span>
    </button>`).join('')}</div>`;
  $('#mkBody').querySelectorAll('[data-brand]').forEach((bt) => bt.onclick = () => { state.currentBrand = bt.dataset.brand; renderBrandGigs(); });
}
async function renderBrandGigs() {
  const el = $('#v-marketplace');
  el.innerHTML = loadingRow();
  const { brand, category, gigs } = await api(`/marketplace/brands/${state.currentBrand}`);
  el.innerHTML = `<button class="back" onclick="state.currentBrand=null;renderMarketplace()">← Brand Marketplace</button>
  <div class="brand-hero" style="--bc:${brand.color}">
    ${brandLogo(brand.name, brand.color, brand.textColor, 64)}
    <div class="bh-meta"><h1>${brand.name} ${category.age ? '<span class="age18">18+</span>' : ''}</h1>
    <div class="bh-cat">${category.name} · <span class="verified">✔ verified brand partner</span></div>
    <div class="bh-camp">🔴 Live campaign · ${brand.campaign}</div></div>
    <button class="btn ghost sm" onclick="toast('Pitch sent to ${brand.name} ✦')">Pitch to brand</button>
  </div>
  <div style="font-family:var(--mono);font-size:11px;color:#8a8a84;text-transform:uppercase;letter-spacing:.08em;margin:4px 0 12px">${gigs.length} open gigs</div>
  ${gigs.map((g) => gigCardHTML(g)).join('')}`;
  wireGigCards(el, gigs);
}
async function renderOpenGigs() {
  $('#mkBody').innerHTML = loadingRow();
  const { gigs } = await api('/marketplace/gigs');
  $('#mkBody').innerHTML = gigs.length ? gigs.map((g) => gigCardHTML(g)).join('') : `<div class="empty"><b>No open campaigns right now</b>Check back soon.</div>`;
  wireGigCards($('#mkBody'), gigs);
}
async function renderMyGigs() {
  $('#mkBody').innerHTML = loadingRow();
  const { applications } = await api('/marketplace/applications');
  state.myApplications = applications;
  if (!applications.length) { $('#mkBody').innerHTML = `<div class="empty"><b>No gigs yet</b>Pick a category, choose a brand, jump on a live campaign — your active gigs and invoices show here.</div>`; return; }
  $('#mkBody').innerHTML = applications.map((a) => gigCardHTML(a.gig, a)).join('');
  $('#mkBody').querySelectorAll('[data-open]').forEach((b) => b.onclick = () => { state.currentGigView = { mode: 'application', id: b.dataset.open }; renderGigView(); });
}
function gigCardHTML(gig, app) {
  const statusTag = app ? `<span class="gtag status ${app.status}">${app.status.replace('_', ' ')}</span>` : (gig.live ? '<span class="gtag live">● live</span>' : '');
  return `<div class="gig-card" data-gig="${gig.id}">
    <div class="gig-top">
      ${brandLogo(gig.brand, gig.brandColor, gig.brandTextColor, 44)}
      <div><div class="gig-title">${gig.title}</div><div class="gig-brand">${gig.brand}${gig.age ? ' · 18+' : ''} · ${gig.objective}</div></div>
      <div class="gig-budget"><b>${fmt(gig.budgetCents)}</b><span>total budget</span></div>
    </div>
    <div class="gig-tags">${statusTag}${gig.deliverables.slice(0, 3).map((d) => `<span class="gtag">${d.quantity}× ${d.title}</span>`).join('')}${gig.deliverables.length > 3 ? `<span class="gtag">+${gig.deliverables.length - 3}</span>` : ''}</div>
    <div class="gig-foot"><span class="meta">${gig.eligibility}</span>
      <button class="btn ${app ? 'red' : 'ink'} sm" data-open="${app ? app.id : gig.id}">${app ? 'Open gig' : 'View gig →'}</button></div>
  </div>`;
}
function wireGigCards(scope, gigs) {
  scope.querySelectorAll('[data-open]').forEach((b) => {
    if (b.onclick) return; // already wired (my-gigs list)
    b.onclick = () => {
      const g = gigs.find((x) => x.id === b.dataset.open);
      const existing = state.myApplications && state.myApplications.find((a) => a.gig.id === g.id);
      state.currentGigView = existing ? { mode: 'application', id: existing.id } : { mode: 'preview', gig: g };
      renderGigView();
    };
  });
}

async function renderGigView() {
  const el = $('#v-marketplace');
  const view = state.currentGigView;
  el.innerHTML = loadingRow();
  if (view.mode === 'preview') { renderGigPreview(view.gig); return; }
  if (view.mode === 'invoice') { const { invoice } = await api(`/marketplace/invoices/${view.id}`); renderInvoiceView(invoice); return; }
  const { application } = await api(`/marketplace/applications/${view.id}`);
  renderApplicationDetail(application);
}
function closeGig() { state.currentGigView = null; renderMarketplace(); }

function renderGigPreview(g) {
  const el = $('#v-marketplace');
  el.innerHTML = `<button class="back" onclick="closeGig()">← Back</button>
  <div class="panel">
    <div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">
      ${brandLogo(g.brand, g.brandColor, g.brandTextColor, 52)}
      <div style="flex:1;min-width:200px"><h1 style="font-size:22px">${g.title}</h1>
      <div style="font-size:13px;color:#6a6a64;margin-top:2px">${g.brand}${g.age ? ' · 18+ verified only' : ''} · ${g.objective}</div></div>
      <div class="gig-budget"><b style="font-size:18px">${fmt(g.budgetCents)}</b><span>total budget</span></div>
    </div>
    <div class="gig-tags" style="margin-top:14px"><span class="gtag">${g.eligibility}</span></div>
  </div>
  <div class="panel"><h3>Scope of work</h3><div class="scope-box">${g.scope}</div></div>
  <div class="panel"><h3>Deliverables <span class="mono">${g.deliverables.length} items</span></h3>
    ${g.deliverables.map((d) => `<div class="deliv"><div class="dn"><b>${d.quantity}× ${d.title}</b><span>${fmt(d.unitPriceCents)} each</span></div><span class="damt">${fmt(d.quantity * d.unitPriceCents)}</span><span class="dstatus">pending</span></div>`).join('')}
  </div>
  <div class="panel"><h3>Agreement summary</h3>
    <div class="kv"><span>Rate</span><b>${fmt(g.budgetCents)} (fixed)</b></div>
    <div class="kv"><span>Revisions included</span><b>2 rounds</b></div>
    <div class="kv"><span>Usage rights</span><b>30 days, paid media eligible</b></div>
    <div class="kv"><span>Platform fee</span><b>10% (transparent)</b></div>
  </div>
  <div class="panel" style="text-align:center">
    <h3 style="justify-content:center">Ready to pitch?</h3>
    <p style="font-size:13px;color:#6a6a64;margin-bottom:14px">Apply with your rate — the brand awards you instantly so you can run the full flow.</p>
    <button class="btn red" id="applyBtn">Apply & get awarded →</button></div>`;
  $('#applyBtn').onclick = () => applyGig(g.id);
}
async function applyGig(gigId) {
  const btn = $('#applyBtn'); btn.disabled = true; btn.textContent = 'Applying…';
  try {
    const { applicationId } = await api(`/marketplace/gigs/${gigId}/apply`, { method: 'POST' });
    state.myApplications = null; syncEarn();
    openSheet(`<div class="success" style="text-align:center"><div class="big">✓</div>
      <h2>You're awarded!</h2><p class="sub" style="margin-top:8px">Agree the scope, deliver, then invoice them — all in here.</p>
      <button class="btn red block" style="margin-top:12px" id="startGigBtn">Start the gig →</button></div>`);
    $('#startGigBtn').onclick = () => { closeSheet(); state.currentGigView = { mode: 'application', id: applicationId }; renderGigView(); };
  } catch (e) { toast(e.message); btn.disabled = false; btn.textContent = 'Apply & get awarded →'; }
}

function renderApplicationDetail(app) {
  const el = $('#v-marketplace'); const g = app.gig; const status = app.status;
  const timeline = [{ k: '1', t: 'Brief accepted & concept approved', d: 'Day 1–2' }, { k: '2', t: 'Draft content submitted', d: 'Day 5' }, { k: '3', t: 'Revisions & final approval', d: 'Day 7' }, { k: '4', t: 'Go-live & reporting', d: 'Day 8–10' }];
  el.innerHTML = `<button class="back" onclick="closeGig()">← Back</button>
  <div class="panel">
    <div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">
      ${brandLogo(g.brand, g.brandColor, g.brandTextColor, 52)}
      <div style="flex:1;min-width:200px"><h1 style="font-size:22px">${g.title}</h1>
      <div style="font-size:13px;color:#6a6a64;margin-top:2px">${g.brand}${g.age ? ' · 18+ verified only' : ''} · ${g.objective}</div></div>
      <div class="gig-budget"><b style="font-size:18px">${fmt(g.budgetCents)}</b><span>total budget</span></div>
    </div>
    <div class="gig-tags" style="margin-top:14px"><span class="gtag status ${status}">${status.replace('_', ' ')}</span><span class="gtag">${g.eligibility}</span></div>
  </div>
  <div class="panel"><h3>Scope of work</h3><div class="scope-box">${g.scope}</div></div>
  <div class="panel"><h3>Deliverables <span class="mono">${app.deliverables.length} items</span></h3>
    ${app.deliverables.map((d) => `
      <div class="deliv"><div class="dn"><b>${d.quantity}× ${d.title}</b><span>${fmt(d.unitPriceCents)} each</span></div>
        <span class="damt">${fmt(d.quantity * d.unitPriceCents)}</span>
        ${['awarded', 'in_production'].includes(status) ? `<button class="btn tiny ${d.status === 'done' ? 'red' : 'ghost'}" data-deliv="${d.id}">${d.status === 'done' ? '✓ submitted' : 'Mark submitted'}</button>` : `<span class="dstatus ${d.status === 'done' ? 'done' : ''}">${d.status}</span>`}
      </div>`).join('')}
  </div>
  <div class="panel"><h3>Timeline & milestones</h3><ul class="timeline">${timeline.map((t) => `<li><span class="tk">${t.k}</span><div><b style="font-size:13.5px">${t.t}</b><div class="mono" style="font-size:11px;color:#8a8a84">${t.d}</div></div></li>`).join('')}</ul></div>
  <div class="panel"><h3>Agreement summary</h3>
    <div class="kv"><span>Rate</span><b>${fmt(g.budgetCents)} (fixed)</b></div>
    <div class="kv"><span>Revisions included</span><b>2 rounds</b></div>
    <div class="kv"><span>Usage rights</span><b>30 days, paid media eligible</b></div>
    <div class="kv"><span>Platform fee</span><b>10% (transparent)</b></div>
  </div>
  <div id="gigAction"></div>`;

  el.querySelectorAll('[data-deliv]').forEach((b) => b.onclick = async () => {
    b.disabled = true;
    try {
      const { application } = await api(`/marketplace/applications/${app.id}/deliverables/${b.dataset.deliv}`, { method: 'PATCH' });
      renderApplicationDetail(application);
    } catch (e) { toast(e.message); b.disabled = false; }
  });
  renderGigAction(app);
}
function renderGigAction(app) {
  const box = $('#gigAction'); const status = app.status;
  if (status === 'awarded' || status === 'in_production') {
    const done = app.deliverables.every((d) => d.status === 'done');
    box.innerHTML = `<div class="panel" style="text-align:center">
      <h3 style="justify-content:center">${done ? 'All deliverables submitted 🎉' : 'Deliver your work'}</h3>
      <p style="font-size:13px;color:#6a6a64;margin-bottom:14px">${done ? 'Generate your Trybe invoice to get paid.' : 'Mark each deliverable as submitted above. Once all are in, you can invoice.'}</p>
      <button class="btn red" id="invoiceBtn" ${done ? '' : 'disabled'}>Generate Trybe invoice →</button></div>`;
    const btn = $('#invoiceBtn');
    if (btn) btn.onclick = async () => {
      btn.disabled = true; btn.textContent = 'Generating…';
      try {
        const { invoice } = await api(`/marketplace/applications/${app.id}/invoice`, { method: 'POST' });
        state.currentGigView = { mode: 'invoice', id: invoice.id }; renderGigView();
      } catch (e) { toast(e.message); btn.disabled = false; btn.textContent = 'Generate Trybe invoice →'; }
    };
  } else if (['invoiced', 'sent'].includes(status)) {
    box.innerHTML = `<div class="panel" style="text-align:center"><h3 style="justify-content:center">Invoice ${status === 'sent' ? 'sent to ' + app.gig.brand : 'ready'}</h3>
      <p style="font-size:13px;color:#6a6a64;margin-bottom:14px">Open the invoice to send, export a PDF, or simulate the brand paying.</p>
      <button class="btn red" id="openInvBtn">Open invoice →</button></div>`;
    $('#openInvBtn').onclick = () => { state.currentGigView = { mode: 'invoice', id: app.invoiceId }; renderGigView(); };
  } else if (status === 'paid') {
    box.innerHTML = `<div class="panel" style="text-align:center"><div class="success"><div class="big" style="width:56px;height:56px;font-size:26px">✓</div></div>
      <h3 style="justify-content:center">Paid</h3>
      <p style="font-size:13px;color:#6a6a64;margin:8px 0 14px">Funds are in your earnings.</p>
      <button class="btn ghost sm" id="openInvBtn2">View invoice</button></div>`;
    $('#openInvBtn2').onclick = () => { state.currentGigView = { mode: 'invoice', id: app.invoiceId }; renderGigView(); };
  }
}

/* ============ INVOICE ============ */
function invTotalsKES(invoice) {
  const t = invoice.totals;
  return { subtotal: t.subtotalCents / 100, fee: t.feeCents / 100, vat: t.vatCents / 100, total: t.totalCents / 100, net: t.netCents / 100 };
}
function renderInvoiceView(invoice) {
  window._currentInvoice = invoice;
  const g = invoice.gig, u = state.user, t = invoice.totals;
  const el = $('#v-marketplace');
  const dstr = (iso) => new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
  el.innerHTML = `<button class="back" onclick="state.currentGigView={mode:'application',id:'${invoice.application.id}'};renderGigView()">← Back to gig</button>
  <div class="inv-layout">
    <div class="inv-doc" id="invDoc">
      <div class="inv-head">
        <div class="brandmark"><a class="logo"><span>try<span class="dd">••</span>be</span></a></div>
        <div class="rt"><div class="lab">INVOICE</div><div class="no">${invoice.invoiceNo}</div>
          <div class="dates">Issue date: ${dstr(invoice.issuedAt)}<br>Due date: ${dstr(invoice.dueAt)}</div></div>
      </div>
      <div class="inv-body">
        <div class="inv-wm" aria-hidden="true">
          <div class="wm-line"><div class="wm-motion"><span class="disc">M</span><span>MOTION</span></div></div>
          <div class="wm-line"><span class="wm-x">×</span></div>
          <div class="wm-line"><span class="wm-trybe">try••be</span></div>
        </div>
        <div class="inv-status-stamp ${invoice.status}">${invoice.status.toUpperCase()}</div>
        <div class="inv-parties">
          <div><div class="lab">Invoice from</div><b>${u.name} <span class="verified" style="font-size:10px">✔ KYC verified</span></b>
            <p>@${u.handle}<br>${u.email}<br>${u.phone}<br>ID ${u.idMasked} · KRA PIN on file<br>Trybe Creator · Motion Trybe Ventures Corp.</p></div>
          <div><div class="lab">Bill to</div><b>${g.brand}</b>
            <p>${g.catName}<br>Brand Partnerships Dept.<br>Attn: Marketing Lead<br>Nairobi, Kenya</p></div>
        </div>
        <div class="inv-ref">
          <div><div class="lab">Campaign reference</div><b>${g.title}</b><span class="sub">Gig ${g.id} · Agreement accepted · Usage rights 30 days</span></div>
          <div style="text-align:right"><div class="lab">Amount due</div><b style="color:var(--blue-deep);font-size:16px" class="t-total-amt">${fmt(t.totalCents)}</b></div>
        </div>
        <table class="inv-table">
          <thead><tr><th>#</th><th>Description / Deliverable</th><th class="num">Qty</th><th class="num">Unit price (KES)</th><th class="num">Amount (KES)</th></tr></thead>
          <tbody id="invRows">${invoice.items.map((i, n) => `<tr><td class="num" style="text-align:left;color:#9a9a94">${n + 1}</td><td>${i.description}</td><td class="num">${i.quantity}</td><td class="num">${(i.unitPriceCents / 100).toLocaleString()}</td><td class="num">${(i.quantity * i.unitPriceCents / 100).toLocaleString()}</td></tr>`).join('')}</tbody>
        </table>
        <div class="inv-bottom">
          <div class="inv-notes">
            <div class="lab">Notes</div>
            All amounts in Kenya Shillings (KES). Payment due within 14 days of issue. This invoice is issued through the <b>Trybe Brand Marketplace</b>; the <b>Trybe platform fee</b> is deducted from the creator payout, not added to the amount the brand pays. Content usage rights granted for 30 days from go-live.
          </div>
          <div class="inv-totals">
            <div class="row"><span>Subtotal</span><span class="mono t-subtotal">${fmt(t.subtotalCents)}</span></div>
            <div class="row"><span>VAT (16%)</span><span class="mono t-vat">${fmt(t.vatCents)}</span></div>
            <div class="totaldue"><span class="tl">Total due<small>Amount payable by ${g.brand}</small></span><span class="tv t-total">${fmt(t.totalCents)}</span></div>
            <div class="payout">
              <div class="plabel">Your payout breakdown</div>
              <div class="row muted"><span>Invoice total</span><span class="mono t-total2">${fmt(t.totalCents)}</span></div>
              <div class="row muted"><span>Less: Trybe platform fee (10%)</span><span class="mono t-fee">−${fmt(t.feeCents)}</span></div>
              <div class="row net"><span>Your net payout</span><span class="mono t-net">${fmt(t.netCents)}</span></div>
            </div>
          </div>
        </div>
      </div>
      <div class="inv-foot">
        <div class="inv-pay"><div class="lab">Payment details</div>
          <b>M-Pesa Paybill:</b> 247247 · Acc <b>${invoice.invoiceNo}</b><br>
          <b>Motion Pay:</b> @${u.handle} · <b>Bank:</b> Trybe Creator Wallet<br>
          Settle by <b>${dstr(invoice.dueAt)}</b></div>
        <div class="inv-verify">
          <div class="stack">
            <div class="inv-dualmark" title="Motion × Trybe verified"><span class="m">M</span><span class="motion-word">MOTION</span><span class="x">×</span><span class="t">trybe</span></div>
            <div class="vnote">VERIFIED · SCAN TO AUTHENTICATE</div>
          </div>
          <div class="inv-qr" title="Scan to verify authenticity"></div>
        </div>
      </div>
    </div>

    <div class="inv-side">
      <div class="panel">
        <h3 style="font-size:15px">Invoice actions</h3>
        <button class="btn ink" onclick="exportInvoicePDF()">⬇ Export watermarked PDF</button>
        ${invoice.status === 'draft' ? `<button class="btn red" id="sendInvBtn">Send to ${g.brand} →</button>` : ''}
        ${invoice.status === 'sent' ? `<button class="btn red" id="payInvBtn">Simulate brand payment</button>` : ''}
        ${invoice.status === 'paid' ? `<div style="text-align:center;color:var(--ok);font-weight:700;padding:8px">✓ Paid · ${fmt(t.netCents)} in your earnings</div>` : ''}
      </div>
      ${invoice.status === 'paid' ? `<div class="panel">
        <h3 style="font-size:15px">Payment records</h3>
        <p style="font-size:12px;color:#6a6a64;margin-bottom:10px">Auto-generated the moment this invoice was paid.</p>
        ${invoice.documents.receiptId ? `<button class="btn ghost sm" style="width:100%;margin-bottom:8px" id="dlReceiptBtn">⬇ Payment receipt</button>` : ''}
        ${invoice.documents.deliveryNoteId ? `<button class="btn ghost sm" style="width:100%" id="dlDeliveryBtn">⬇ Delivery note</button>` : ''}
      </div>` : ''}
      ${invoice.status === 'draft' ? `<div class="panel">
        <h3 style="font-size:15px">Edit line items</h3>
        <div id="liEditor">${invoice.items.map((i, ix) => liRow(i, ix)).join('')}</div>
        <button class="addli" id="addLiBtn">+ Add line item</button>
        <p style="font-size:11px;color:#8a8a84;margin-top:10px">Save to recalc totals, VAT, fee and net payout.</p>
        <button class="btn ink sm" id="saveLiBtn" style="margin-top:8px;width:100%">Save line items</button>
      </div>` : ''}
      <div class="panel" style="font-size:12px;color:#6a6a64">
        <h3 style="font-size:14px">Authenticity</h3>
        This invoice carries the <b>Motion × Trybe watermark</b> (both marks) and a verification QR — so the brand can confirm it's genuinely Trybe-issued and unaltered.
      </div>
    </div>
  </div>`;

  if (invoice.status === 'draft') {
    $('#addLiBtn').onclick = () => { invoice.items.push({ description: 'New deliverable', quantity: 1, unitPriceCents: 500000 }); renderInvoiceView(invoice); };
    $('#saveLiBtn').onclick = () => saveInvoiceItems(invoice.id);
    el.querySelectorAll('[data-delli]').forEach((b) => b.onclick = () => { invoice.items.splice(+b.dataset.delli, 1); renderInvoiceView(invoice); });
  }
  if ($('#sendInvBtn')) $('#sendInvBtn').onclick = () => sendInvoice(invoice.id);
  if ($('#payInvBtn')) $('#payInvBtn').onclick = () => markPaid(invoice.id);
  if ($('#dlReceiptBtn')) $('#dlReceiptBtn').onclick = () => downloadDocument(invoice.documents.receiptId, `${invoice.invoiceNo}-receipt.pdf`);
  if ($('#dlDeliveryBtn')) $('#dlDeliveryBtn').onclick = () => downloadDocument(invoice.documents.deliveryNoteId, `${invoice.invoiceNo}-delivery-note.pdf`);
}
async function downloadDocument(docId, filename) {
  try {
    const res = await fetch(`/api/marketplace/documents/${docId}/download`, { headers: { Authorization: 'Bearer ' + getToken() } });
    if (!res.ok) throw new Error('Could not download document');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  } catch (e) { toast(e.message); }
}
function liRow(i, ix) { return `<div class="li-editor">
  <input data-li="${ix}" data-f="description" value="${i.description}" placeholder="Deliverable">
  <input data-li="${ix}" data-f="quantity" type="number" min="1" value="${i.quantity}">
  <input data-li="${ix}" data-f="unitPriceKES" type="number" min="0" value="${i.unitPriceCents / 100}">
  <button class="del" data-delli="${ix}" aria-label="remove">×</button></div>`; }
async function saveInvoiceItems(invoiceId) {
  const items = $$('#liEditor .li-editor').map((row) => {
    const desc = row.querySelector('[data-f="description"]').value;
    const qty = +row.querySelector('[data-f="quantity"]').value || 1;
    const kes = +row.querySelector('[data-f="unitPriceKES"]').value || 0;
    return { description: desc, quantity: qty, unitPriceCents: Math.round(kes * 100) };
  });
  try {
    const { invoice } = await api(`/marketplace/invoices/${invoiceId}`, { method: 'PATCH', body: { items } });
    renderInvoiceView(invoice); toast('Line items saved ✦');
  } catch (e) { toast(e.message); }
}
async function sendInvoice(invoiceId) {
  try {
    const { invoice } = await api(`/marketplace/invoices/${invoiceId}/send`, { method: 'POST' });
    syncEarn();
    openSheet(`<div class="success" style="text-align:center"><div class="big">✈</div><h2>Invoice sent</h2>
      <p class="sub" style="margin-top:8px">${invoice.invoiceNo} was sent to <b>${invoice.gig.brand}</b> for payment.</p>
      <button class="btn red block" style="margin-top:12px" id="viewInvBtn">View invoice</button></div>`);
    $('#viewInvBtn').onclick = () => { closeSheet(); renderInvoiceView(invoice); };
  } catch (e) { toast(e.message); }
}
async function markPaid(invoiceId) {
  try {
    const { invoice } = await api(`/marketplace/invoices/${invoiceId}/pay`, { method: 'POST' });
    await refreshWallet();
    openSheet(`<div class="success" style="text-align:center"><div class="big">✓</div><h2>Payment received!</h2>
      <p class="sub" style="margin-top:8px">${invoice.gig.brand} paid ${invoice.invoiceNo}. <b>${fmt(invoice.totals.netCents)}</b> (net of fee) landed in your earnings.</p>
      <button class="btn red block" style="margin-top:12px" id="doneInvBtn">Done</button></div>`);
    $('#doneInvBtn').onclick = () => { closeSheet(); renderInvoiceView(invoice); };
  } catch (e) { toast(e.message); }
}

/* ---- PDF export with watermark ---- */
function exportInvoicePDF() {
  if (window.jspdf && window.jspdf.jsPDF) { try { exportViaJsPDF(); return; } catch (e) { console.warn('jsPDF failed, falling back to print', e); } }
  exportViaPrint();
}
function exportViaPrint() {
  const invoice = window._currentInvoice, g = invoice.gig, u = state.user;
  const dstr = (iso) => new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
  const rows = invoice.items.map((i, n) => `<tr><td style="color:#9a9a94">${n + 1}</td><td>${i.description}</td><td class="n">${i.quantity}</td><td class="n">${(i.unitPriceCents / 100).toLocaleString()}</td><td class="n">${(i.quantity * i.unitPriceCents / 100).toLocaleString()}</td></tr>`).join('');
  // The draft/sent/paid status stamp is an in-app-only indicator — the
  // downloaded/printed document is the same regardless of workflow status.
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${invoice.invoiceNo}</title>
  <style>
  @page{size:A4;margin:0} *{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif} body{margin:0;color:#141414;background:#fff}
  .doc{width:100%;max-width:780px;margin:0 auto;background:#fff}
  .head{background:#fff;color:#141414;padding:30px 36px 22px;display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #6C8FD6}
  .head .lg{font-weight:800;font-size:28px}.head .dd{color:#6C8FD6}
  .head .iss{font-size:10px;color:#8a8a84;margin-top:6px;line-height:1.6;font-family:monospace}
  .head .lab{font-weight:800;font-size:26px;letter-spacing:.02em}
  .head .no{color:#3760B5;font-size:12px;font-family:monospace;margin-top:4px}
  .head .dt{font-size:10.5px;color:#6a6a64;font-family:monospace;margin-top:8px;line-height:1.7}
  .body{padding:30px 36px;position:relative}
  .wm{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;pointer-events:none}
  .wm .l{display:flex;align-items:center;gap:14px;transform:rotate(-16deg);opacity:.05}
  .wm .disc{width:46px;height:46px;border-radius:50%;background:#0C7378;color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700}
  .wm .mo{letter-spacing:.3em;font-size:26px;font-weight:600} .wm .x{font-size:30px}.wm .tr{font-weight:800;font-size:56px}
  .parties{display:flex;gap:34px;position:relative} .parties>div{flex:1}.lab{font-size:9px;letter-spacing:.1em;color:#8a8a84;font-family:monospace;text-transform:uppercase}
  .parties b{font-size:14px;display:block;margin:4px 0}.parties p{font-size:12px;color:#5a5a5a;line-height:1.7;margin:0}
  .ref{margin:20px 0;position:relative;background:#F4F3EE;border-radius:10px;padding:12px 16px;display:flex;justify-content:space-between;gap:16px}
  .ref b{font-size:13px}.ref .amt{color:#3760B5;font-size:16px}
  table{width:100%;border-collapse:collapse;margin-top:6px;position:relative;font-size:12px}
  th{text-align:left;font-size:9px;font-family:monospace;letter-spacing:.06em;color:#6a6a64;padding:9px 8px;border-bottom:2px solid #141414;text-transform:uppercase;background:#F4F3EE}
  td{padding:10px 8px;border-bottom:1px solid #e6e4dc}.n{text-align:right;font-family:monospace;white-space:nowrap}
  .bottom{display:flex;gap:24px;margin-top:16px;position:relative}
  .notes{flex:1;font-size:11px;color:#6a6a64;line-height:1.7} .tot{width:290px}
  .tot .r{display:flex;justify-content:space-between;padding:7px 0;font-size:12.5px;border-bottom:1px solid #e6e4dc} .tot .muted{color:#8a8a84}
  .tot .totaldue{background:#EDF2FC;border:2px solid #6C8FD6;border-radius:10px;padding:11px 14px;display:flex;justify-content:space-between;align-items:center;margin:12px 0 4px}
  .tot .totaldue .tl{font-weight:800;font-size:13px}.tot .totaldue .tl small{display:block;font-size:8px;color:#3760B5;font-family:monospace;letter-spacing:.06em;margin-top:2px}
  .tot .totaldue .tv{font-weight:800;font-size:19px;color:#3760B5}
  .tot .plabel{font-size:8px;font-family:monospace;text-transform:uppercase;letter-spacing:.1em;color:#8a8a84;margin:10px 0 2px}
  .tot .net{color:#1E8E5A;border-bottom:none;font-weight:700;border-top:1px solid #e6e4dc;padding-top:6px}
  .foot{border-top:1px solid #e6e4dc;padding:20px 36px;display:flex;justify-content:space-between;align-items:flex-end;gap:14px}
  .pay{font-size:11px;color:#5a5a5a;line-height:1.7}.pay b{color:#141414}
  .verify{display:flex;align-items:flex-end;gap:12px} .dm{display:flex;align-items:center;gap:6px;justify-content:flex-end}
  .dm .m{width:20px;height:20px;border-radius:50%;background:#0C7378;color:#fff;display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:700}
  .dm .mw{letter-spacing:.16em;font-size:11px;font-weight:700;color:#0C7378} .dm .x{color:#9a9a94;font-family:monospace}
  .dm .t{font-weight:800;font-size:15px;position:relative}.dm .t::after{content:"";position:absolute;width:5px;height:5px;border-radius:50%;background:#DC3A21;top:-1px;right:-6px}
  .vn{font-size:8.5px;color:#8a8a84;font-family:monospace;text-align:right;margin-top:5px;letter-spacing:.04em}
  .qr{width:56px;height:56px;background:repeating-linear-gradient(90deg,#141414 0 4px,#fff 4px 8px),repeating-linear-gradient(0deg,#141414 0 4px,#fff 4px 8px);border:3px solid #fff;outline:2px solid #141414}
  </style></head><body><div class="doc">
    <div class="head">
      <div><div class="lg">try<span class="dd">••</span>be</div><div class="iss">Trybe · Motion Trybe Ventures Corporation<br>Nairobi, Kenya · hello@trybe.africa</div></div>
      <div style="text-align:right"><div class="lab">INVOICE</div><div class="no">${invoice.invoiceNo}</div><div class="dt">Issue date: ${dstr(invoice.issuedAt)}<br>Due date: ${dstr(invoice.dueAt)}</div></div>
    </div>
    <div class="body">
      <div class="wm"><div class="l"><span class="disc">M</span><span class="mo">MOTION</span></div><div class="l"><span class="x">×</span></div><div class="l"><span class="tr">try••be</span></div></div>
      <div class="parties">
        <div><div class="lab">Invoice from</div><b>${u.name} (KYC verified)</b><p>@${u.handle}<br>${u.email}<br>${u.phone}<br>ID ${u.idMasked} · KRA PIN on file<br>Trybe Creator</p></div>
        <div><div class="lab">Bill to</div><b>${g.brand}</b><p>${g.catName}<br>Brand Partnerships Dept.<br>Attn: Marketing Lead<br>Nairobi, Kenya</p></div>
      </div>
      <div class="ref"><div><div class="lab">Campaign reference</div><b>${g.title}</b><div style="font-size:11px;color:#6a6a64">Gig ${g.id} · Agreement accepted · Usage rights 30 days</div></div>
        <div style="text-align:right"><div class="lab">Amount due</div><b class="amt">${fmt(invoice.totals.totalCents)}</b></div></div>
      <table><thead><tr><th>#</th><th>Description / Deliverable</th><th class="n">Qty</th><th class="n">Unit price (KES)</th><th class="n">Amount (KES)</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="bottom">
        <div class="notes"><div class="lab">Notes</div>All amounts in Kenya Shillings (KES). Payment due within 14 days of issue. Issued via the Trybe Brand Marketplace; the Trybe platform fee is deducted from the creator payout, not added to the brand's amount. Usage rights 30 days from go-live.</div>
        <div class="tot"><div class="r"><span>Subtotal</span><span>${fmt(invoice.totals.subtotalCents)}</span></div>
          <div class="r"><span>VAT (16%)</span><span>${fmt(invoice.totals.vatCents)}</span></div>
          <div class="totaldue"><span class="tl">Total due<small>Amount payable by ${g.brand}</small></span><span class="tv">${fmt(invoice.totals.totalCents)}</span></div>
          <div class="plabel">Your payout breakdown</div>
          <div class="r muted"><span>Invoice total</span><span>${fmt(invoice.totals.totalCents)}</span></div>
          <div class="r muted"><span>Less: Trybe platform fee (10%)</span><span>−${fmt(invoice.totals.feeCents)}</span></div>
          <div class="r net"><span>Your net payout</span><span>${fmt(invoice.totals.netCents)}</span></div></div>
      </div>
    </div>
    <div class="foot">
      <div class="pay"><div class="lab">Payment details</div><b>M-Pesa Paybill:</b> 247247 · Acc <b>${invoice.invoiceNo}</b><br><b>Motion Pay:</b> @${u.handle} · <b>Bank:</b> Trybe Creator Wallet<br>Settle by <b>${dstr(invoice.dueAt)}</b></div>
      <div class="verify"><div><div class="dm"><span class="m">M</span><span class="mw">MOTION</span><span class="x">×</span><span class="t">trybe</span></div><div class="vn">VERIFIED · SCAN TO AUTHENTICATE</div></div><div class="qr"></div></div>
    </div>
  </div><script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups to export the PDF, or use your browser Print → Save as PDF'); return; }
  w.document.write(html); w.document.close();
  toast('Opening print dialog — choose <b>Save as PDF</b>');
}
function exportViaJsPDF() {
  const invoice = window._currentInvoice, g = invoice.gig, u = state.user;
  const { jsPDF } = window.jspdf; const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = 595, M = 44; let y = 54;
  const dstr = (iso) => new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
  doc.setTextColor(20, 20, 20); doc.setFont('helvetica', 'bold'); doc.setFontSize(28); doc.text('try••be', M, 58);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(138, 138, 132);
  doc.text('Trybe · Motion Trybe Ventures Corporation', M, 74);
  doc.text('Nairobi, Kenya · hello@trybe.africa', M, 86);
  doc.setTextColor(20, 20, 20); doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.text('INVOICE', W - M, 52, { align: 'right' });
  doc.setTextColor(55, 96, 181); doc.setFontSize(11); doc.text(invoice.invoiceNo, W - M, 68, { align: 'right' });
  doc.setTextColor(106, 106, 100); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text('Issue date: ' + dstr(invoice.issuedAt), W - M, 82, { align: 'right' });
  doc.text('Due date: ' + dstr(invoice.dueAt), W - M, 94, { align: 'right' });
  doc.setDrawColor(108, 143, 214); doc.setLineWidth(2.4); doc.line(M, 104, W - M, 104);
  doc.setTextColor(240, 240, 236);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(30); doc.text('M O T I O N', W / 2, 392, { align: 'center', angle: 16 });
  doc.setFontSize(30); doc.text('×', W / 2, 432, { align: 'center', angle: 16 });
  doc.setFontSize(70); doc.text('try••be', W / 2, 486, { align: 'center', angle: 16 });
  y = 140; doc.setTextColor(138, 138, 132); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.text('INVOICE FROM', M, y); doc.text('BILL TO', W / 2, y);
  doc.setTextColor(20, 20, 20); doc.setFontSize(12);
  doc.text(u.name + '  (KYC verified)', M, y + 16); doc.text(g.brand, W / 2, y + 16);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90, 90, 90);
  doc.text(['@' + u.handle, u.email, u.phone, 'ID ' + u.idMasked + ' · KRA PIN on file'], M, y + 32);
  doc.text([g.catName, 'Brand Partnerships Dept.', 'Attn: Marketing Lead', 'Nairobi, Kenya'], W / 2, y + 32);
  y = y + 90; doc.setFillColor(244, 243, 238); doc.roundedRect(M, y - 14, W - 2 * M, 42, 6, 6, 'F');
  doc.setTextColor(138, 138, 132); doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.text('CAMPAIGN REFERENCE', M + 12, y);
  doc.text('AMOUNT DUE', W - M - 12, y, { align: 'right' });
  doc.setTextColor(20, 20, 20); doc.setFontSize(11); doc.text(g.title, M + 12, y + 16);
  doc.setTextColor(55, 96, 181); doc.setFontSize(13); doc.text(fmt(invoice.totals.totalCents), W - M - 12, y + 16, { align: 'right' });
  y = y + 52; doc.setFillColor(244, 243, 238); doc.rect(M, y - 14, W - 2 * M, 22, 'F');
  doc.setDrawColor(20, 20, 20); doc.setLineWidth(1.4); doc.line(M, y + 8, W - M, y + 8);
  doc.setTextColor(106, 106, 100); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.text('#', M + 4, y); doc.text('DESCRIPTION / DELIVERABLE', M + 26, y); doc.text('QTY', 350, y, { align: 'right' }); doc.text('UNIT PRICE', 445, y, { align: 'right' }); doc.text('AMOUNT', W - M - 4, y, { align: 'right' });
  y += 8; doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  invoice.items.forEach((i, n) => {
    y += 20; doc.setTextColor(154, 154, 148); doc.text(String(n + 1), M + 4, y);
    doc.setTextColor(30, 30, 30); doc.text(i.description, M + 26, y); doc.text(String(i.quantity), 350, y, { align: 'right' });
    doc.text((i.unitPriceCents / 100).toLocaleString(), 445, y, { align: 'right' }); doc.text((i.quantity * i.unitPriceCents / 100).toLocaleString(), W - M - 4, y, { align: 'right' });
    doc.setDrawColor(230, 228, 220); doc.setLineWidth(.5); doc.line(M, y + 6, W - M, y + 6);
  });
  const notesY = y + 24;
  doc.setTextColor(138, 138, 132); doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.text('NOTES', M, notesY);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(106, 106, 100);
  doc.text(doc.splitTextToSize('All amounts in KES. Payment due within 14 days of issue. Issued via the Trybe Brand Marketplace; the Trybe platform fee is deducted from the creator payout, not added to the brand’s amount. Usage rights 30 days from go-live.', 250), M, notesY + 14);
  y += 24; const lx = W - M - 220, rx = W - M;
  const line = (lab, val, col) => { doc.setFont('helvetica', 'normal'); doc.setTextColor(...(col || [70, 70, 70])); doc.setFontSize(10.5); doc.text(lab, lx, y); doc.text(val, rx, y, { align: 'right' }); doc.setDrawColor(230, 228, 220); doc.setLineWidth(.5); doc.line(lx, y + 5, rx, y + 5); y += 17; };
  line('Subtotal', fmt(invoice.totals.subtotalCents));
  line('VAT (16%)', fmt(invoice.totals.vatCents));
  y += 6; doc.setFillColor(237, 242, 252); doc.setDrawColor(108, 143, 214); doc.setLineWidth(1.4);
  doc.roundedRect(lx, y - 4, rx - lx, 34, 5, 5, 'FD');
  doc.setTextColor(20, 20, 20); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('Total due', lx + 10, y + 12);
  doc.setTextColor(55, 96, 181); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.text('AMOUNT PAYABLE BY ' + g.brand.toUpperCase(), lx + 10, y + 22);
  doc.setTextColor(55, 96, 181); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(fmt(invoice.totals.totalCents), rx - 10, y + 16, { align: 'right' });
  y += 48;
  doc.setTextColor(138, 138, 132); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.text('YOUR PAYOUT BREAKDOWN', lx, y); y += 14;
  line('Invoice total', fmt(invoice.totals.totalCents), [138, 138, 132]);
  line('Less: Trybe platform fee (10%)', '-' + fmt(invoice.totals.feeCents), [138, 138, 132]);
  doc.setDrawColor(20, 20, 20); doc.setLineWidth(1); doc.line(lx, y - 4, rx, y - 4); y += 4;
  doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 142, 90); doc.setFontSize(12);
  doc.text('Your net payout', lx, y + 8); doc.text(fmt(invoice.totals.netCents), rx, y + 8, { align: 'right' });
  y = 792; doc.setDrawColor(230, 228, 220); doc.setLineWidth(1); doc.line(M, y, W - M, y); y += 16;
  doc.setTextColor(138, 138, 132); doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.text('PAYMENT DETAILS', M, y);
  doc.setTextColor(90, 90, 90); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text('M-Pesa Paybill: 247247 · Acc ' + invoice.invoiceNo, M, y + 13);
  doc.text('Motion Pay: @' + u.handle + ' · Bank: Trybe Creator Wallet · Settle by ' + dstr(invoice.dueAt), M, y + 25);
  const mx = W - M - 150;
  doc.setFillColor(12, 115, 120); doc.circle(mx, y + 2, 7, 'F'); doc.setTextColor(255, 255, 255); doc.setFontSize(6); doc.setFont('helvetica', 'bold'); doc.text('M', mx - 2, y + 4.5);
  doc.setTextColor(12, 115, 120); doc.setFontSize(10); doc.text('MOTION', mx + 12, y + 5);
  doc.setTextColor(150, 150, 148); doc.text('×', mx + 62, y + 5);
  doc.setTextColor(20, 20, 20); doc.setFontSize(12); doc.text('trybe', mx + 74, y + 6);
  doc.setFillColor(220, 58, 33); doc.circle(mx + 106, y - 1, 2, 'F');
  doc.setTextColor(138, 138, 132); doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.text('VERIFIED · SCAN TO AUTHENTICATE', W - M, y + 22, { align: 'right' });
  doc.save(invoice.invoiceNo + '.pdf');
  toast('PDF exported — <b>' + invoice.invoiceNo + '.pdf</b> · Motion × Trybe watermarked');
}

/* ============ COMMUNITY ============ */
async function renderCommunity() {
  const p = PILLARS.find((x) => x.id === 'community');
  $('#v-community').innerHTML = `<div class="vhead"><h1>${p.name}</h1><p>${p.desc}</p></div><div class="simple-grid" id="groupGrid">${loadingRow()}</div>`;
  const { groups } = await api('/community/groups');
  const grads = ['linear-gradient(140deg,#DC3A21,#F0713C)', 'linear-gradient(140deg,#6C8FD6,#B5DF8B)', 'linear-gradient(140deg,#0C7378,#141414)', 'linear-gradient(140deg,#F0713C,#43213c)', 'linear-gradient(140deg,#B5DF8B,#0C7378)', 'linear-gradient(140deg,#141414,#DC3A21)'];
  $('#groupGrid').innerHTML = groups.map((g, i) => `
    <div class="simple-card"><div class="sv" style="background:${g.gradient || grads[i % grads.length]}"></div>
    <div class="sb"><h3>${g.name}</h3><p>${g.member_count.toLocaleString()} members · ${g.description}</p><span class="tagm">${g.category}</span>
    <button class="btn ${g.joined ? 'ghost' : 'red'} sm joinbtn" data-group="${g.id}" data-joined="${g.joined ? 1 : 0}">${g.joined ? '✓ Joined' : 'Join group'}</button>
    </div></div>`).join('');
  $('#groupGrid').querySelectorAll('[data-group]').forEach((b) => b.onclick = async () => {
    const joined = b.dataset.joined === '1';
    try {
      await api(`/community/groups/${b.dataset.group}/${joined ? 'leave' : 'join'}`, { method: 'POST' });
      renderCommunity();
    } catch (e) { toast(e.message); }
  });
}

/* ============ CREATOR (real wallet + gigs dashboard) ============ */
async function renderCreator() {
  const p = PILLARS.find((x) => x.id === 'creator');
  $('#v-creator').innerHTML = `<div class="vhead"><h1>${p.name}</h1><p>${p.desc}</p></div><div id="creatorBody">${loadingRow()}</div>`;
  const [wallet, apps] = await Promise.all([api('/wallet'), api('/marketplace/applications')]);
  const paid = apps.applications.filter((a) => a.status === 'paid');
  const pending = apps.applications.filter((a) => ['invoiced', 'sent'].includes(a.status));
  const inProgress = apps.applications.filter((a) => ['awarded', 'in_production'].includes(a.status));
  $('#creatorBody').innerHTML = `
  <div class="profile-strip" style="margin-bottom:22px">
    <div class="pmeta"><b style="font-family:var(--display);font-size:22px">${fmt(wallet.balanceCents)}</b><div class="h">Motion Pay wallet balance</div></div>
    <div class="pstats"><div class="pstat"><b>${inProgress.length}</b><span>In progress</span></div><div class="pstat"><b>${pending.length}</b><span>Awaiting payment</span></div><div class="pstat"><b>${paid.length}</b><span>Paid gigs</span></div></div>
  </div>
  <div class="vhead"><h1 style="font-size:19px">Wallet history</h1></div>
  ${wallet.history.length ? `<div class="panel">${wallet.history.map((h) => `<div class="kv"><span>${h.type} · ${new Date(h.created_at).toLocaleDateString('en-KE')}${h.reference ? ' · ' + h.reference : ''}</span><b style="color:${h.amount_cents < 0 ? 'var(--red)' : 'var(--ok)'}">${h.amount_cents < 0 ? '−' : '+'}${fmt(Math.abs(h.amount_cents))}</b></div>`).join('')}</div>`
    : `<div class="empty"><b>No wallet activity yet</b>Get awarded a gig and get paid — it'll show here.</div>`}
  <div class="vhead" style="margin-top:26px"><h1 style="font-size:19px">Your gigs</h1><p>Managed in the Brand Marketplace — shown here for your creator dashboard.</p></div>
  <button class="btn ink sm" onclick="nav('marketplace')">Open Brand Marketplace →</button>`;
}

/* ============ COMMERCE ============ */
async function renderCommerce() {
  const p = PILLARS.find((x) => x.id === 'commerce');
  $('#v-commerce').innerHTML = `<div class="vhead"><h1>${p.name}</h1><p>${p.desc}</p></div>
    <button class="btn red sm" id="sellBtn" style="margin-bottom:16px">+ Sell an item</button>
    <div class="simple-grid" id="listingGrid">${loadingRow()}</div>`;
  $('#sellBtn').onclick = openSellSheet;
  const { listings } = await api('/commerce/listings');
  const grads = ['linear-gradient(140deg,#DC3A21,#F0713C)', 'linear-gradient(140deg,#6C8FD6,#B5DF8B)', 'linear-gradient(140deg,#0C7378,#141414)', 'linear-gradient(140deg,#F0713C,#43213c)', 'linear-gradient(140deg,#B5DF8B,#0C7378)', 'linear-gradient(140deg,#141414,#DC3A21)'];
  $('#listingGrid').innerHTML = listings.length ? listings.map((l, i) => `
    <div class="simple-card"><div class="sv" style="${l.image_data_url ? `background-image:url(${l.image_data_url});background-size:cover` : `background:${grads[i % grads.length]}`}"></div>
    <div class="sb"><h3>${l.title}</h3><p>${fmt(l.price_cents)} · @${l.seller_handle}</p><span class="tagm">${l.category} →</span></div></div>`).join('')
    : `<div class="empty"><b>No listings yet</b>Be the first to sell something to your trybe.</div>`;
}
function openSellSheet() {
  openSheet(`<h2>Sell an item</h2><p class="sub">List it for your trybe to buy peer-to-peer.</p>
    <div class="composer-drop" id="listingDrop"><b id="ldLabel">⬆ Add a photo (optional)</b><span>JPG or PNG</span><div class="cd-preview" id="ldPreview"></div></div>
    <input type="file" id="listingFile" accept="image/*" hidden>
    <div class="field" style="margin-top:14px"><label>Item title</label><input id="lTitle" placeholder="e.g. Vintage Levi's 501"></div>
    <div class="f2"><div class="field"><label>Price (KES)</label><input id="lPrice" type="number" min="1" placeholder="3500"></div>
    <div class="field"><label>Category</label><input id="lCat" placeholder="Fashion"></div></div>
    <button class="btn red block" id="lSubmit">List item →</button>`);
  let image = null;
  $('#listingDrop').onclick = () => $('#listingFile').click();
  $('#listingFile').onchange = (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { image = r.result; $('#ldPreview').innerHTML = `<img src="${image}">`; $('#ldLabel').textContent = 'Photo selected ✓'; }; r.readAsDataURL(f); };
  $('#lSubmit').onclick = async () => {
    const title = $('#lTitle').value.trim(), price = +$('#lPrice').value, category = $('#lCat').value.trim() || 'General';
    if (!title || !price) { toast('Add a title and price'); return; }
    $('#lSubmit').disabled = true;
    try {
      await api('/commerce/listings', { method: 'POST', body: { title, priceCents: Math.round(price * 100), category, imageDataUrl: image || undefined } });
      closeSheet(); renderCommerce(); toast('Listed ✦');
    } catch (e) { toast(e.message); $('#lSubmit').disabled = false; }
  };
}

/* ============ CULTURE ============ */
async function renderCulture() {
  const p = PILLARS.find((x) => x.id === 'culture');
  $('#v-culture').innerHTML = `<div class="vhead"><h1>${p.name}</h1><p>${p.desc}</p></div><div class="simple-grid" id="cultureGrid">${loadingRow()}</div>`;
  const { posts } = await api('/culture/posts');
  $('#cultureGrid').innerHTML = posts.map((c) => `
    <div class="simple-card"><div class="sv" style="background:${c.gradient}"></div>
    <div class="sb"><h3>${c.title}</h3><p>${c.subtitle}</p><span class="tagm">${c.tag} →</span></div></div>`).join('');
}

/* ============ EVENTS ============ */
async function renderEvents() {
  const p = PILLARS.find((x) => x.id === 'events');
  $('#v-events').innerHTML = `<div class="vhead"><h1>${p.name}</h1><p>${p.desc}</p></div>
    <div class="scope-box" style="margin-bottom:18px">🎟 Tickets you buy here are issued through <b>Motion</b> — watermarked with the Motion × Trybe mark, each independently verifiable.</div>
    <div class="simple-grid" id="eventGrid">${loadingRow()}</div>`;
  const { events } = await api('/events');
  const grads = ['linear-gradient(140deg,#DC3A21,#F0713C)', 'linear-gradient(140deg,#6C8FD6,#B5DF8B)', 'linear-gradient(140deg,#0C7378,#141414)', 'linear-gradient(140deg,#F0713C,#43213c)', 'linear-gradient(140deg,#B5DF8B,#0C7378)', 'linear-gradient(140deg,#141414,#DC3A21)'];
  $('#eventGrid').innerHTML = events.map((e, i) => {
    const cheapest = Math.min(...e.tiers.map((t) => t.price_cents));
    return `<button class="simple-card sellbtn" data-event="${e.id}"><div class="sv" style="background:${grads[i % grads.length]}"></div>
    <div class="sb"><h3>${e.name}</h3><p>${e.venue}, ${e.city} · ${new Date(e.event_date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })} · from ${fmt(cheapest)}</p><span class="tagm">${e.category} →</span></div></button>`;
  }).join('');
  $('#eventGrid').querySelectorAll('[data-event]').forEach((b) => b.onclick = () => openEventSheet(events.find((e) => e.id === b.dataset.event)));
}
function openEventSheet(ev) {
  openSheet(`<h2>${ev.name}</h2><p class="sub">${ev.venue}, ${ev.city} · ${new Date(ev.event_date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })} · Gates ${ev.gate_time}</p>
    <div class="scope-box" style="margin-bottom:14px">${ev.description || ''}</div>
    <div class="field"><label>Ticket type</label><select id="tierSelect">${ev.tiers.map((t) => `<option value="${t.id}" ${t.quantity_sold >= t.quantity_total ? 'disabled' : ''}>${t.name} — ${fmt(t.price_cents)} ${t.quantity_sold >= t.quantity_total ? '(sold out)' : ''}</option>`).join('')}</select></div>
    <button class="btn red block" id="buyBtn">Buy ticket (M-Pesa) →</button>`);
  $('#buyBtn').onclick = async () => {
    $('#buyBtn').disabled = true; $('#buyBtn').textContent = 'Processing…';
    try {
      await api('/tickets/checkout', { method: 'POST', body: { eventId: ev.id, items: [{ tierId: $('#tierSelect').value, quantity: 1 }], paymentMethod: 'mpesa', payerRef: state.user.phone || '+254700000000' } });
      openSheet(`<div class="success" style="text-align:center"><div class="big">✓</div><h2>Ticket booked!</h2><p class="sub" style="margin-top:8px">Your ticket for <b>${ev.name}</b> is confirmed and watermarked with the Motion × Trybe mark.</p><button class="btn red block" style="margin-top:12px" onclick="closeSheet()">Done</button></div>`);
    } catch (e) { toast(e.message); $('#buyBtn').disabled = false; $('#buyBtn').textContent = 'Buy ticket (M-Pesa) →'; }
  };
}

/* ============ RENDER MAP + BOOT ============ */
const RENDER = { hub: renderHub, marketplace: renderMarketplace, community: renderCommunity, creator: renderCreator, commerce: renderCommerce, events: renderEvents, culture: renderCulture };

(async function boot() {
  const token = getToken();
  if (token) {
    try {
      const { user } = await api('/auth/me');
      state.user = user;
      if (!user.picks || !user.picks.length) goOnboard(); else enterApp();
      return;
    } catch (e) { setToken(null); }
  }
  renderAuth();
})();
