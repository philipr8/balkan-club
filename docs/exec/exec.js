/* ==========================================================================
   ABSQU Exec area — Firebase Auth + Firestore, no build step.

   Roles live in Firestore:  users/{uid} = { name, email, role: 'admin'|'exec', active }
   Flags (public):           team/{uid}  = { name, countries: ['rs','mk'], updatedAt }
   Attachments:              messages/{mid}.file = { name, mime, size, chunks, kind, thumb? }
                             messages/{mid}/chunks/{i} = { i, data: <base64 piece> }   (no paid Storage)
   Every permission shown in this UI is ALSO enforced by firestore.rules — the UI
   only hides what the server would reject anyway.

   The Firebase config is loaded at runtime from ../firebase-config.js, which is
   gitignored (see firebase-config.example.js and FIREBASE_SETUP.md).
   ========================================================================== */

const FIREBASE_VERSION = '10.14.1';
const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
const HINT_KEY = 'absqu.execHint';
const MAX_LEN = 2000;
const GROUP_MS = 5 * 60 * 1000;

// Channels every admin sign-in makes sure exist (missing ones are created; nothing is ever overwritten).
const DEFAULT_CHANNELS = [
  { id: 'announcements', description: 'Official updates from the co-presidents. Read-only for execs.', adminOnly: true, order: 0 },
  { id: 'general', description: 'Everything and anything ABSQU.', adminOnly: false, order: 1 },
  { id: 'events', description: 'Planning potlucks, watchparties and bar nights.', adminOnly: false, order: 2 },
  { id: 'marketing', description: 'Posts, posters, Instagram, campaigns.', adminOnly: false, order: 3 },
  { id: 'finance', description: 'Budgets, receipts, sponsorships.', adminOnly: false, order: 4 },
  { id: 'student-reps', description: 'Student representatives: feedback, concerns, club-wide questions.', adminOnly: false, order: 5 },
  { id: 'communications', description: 'Communications & outreach: emails, partners, other clubs.', adminOnly: false, order: 6 },
  { id: 'resources', description: 'Flyers, templates, forms and documents worth keeping. (For big photo sets, share a Drive/Dropbox link.)', adminOnly: false, order: 7 },
];
// How the sidebar groups channels (display only — rules don't care).
const CHANNEL_GROUPS = [
  { label: 'Club', ids: ['announcements', 'general', 'resources'] },
  { label: 'Teams', ids: ['events', 'marketing', 'finance', 'student-reps', 'communications'] },
];

// Countries offered for the website flag (the 11 on the public site, plus Georgia). Codes are validated by firestore.rules too.
const COUNTRIES = [
  ['al', 'Albania'], ['ba', 'Bosnia & Herzegovina'], ['bg', 'Bulgaria'], ['hr', 'Croatia'], ['ge', 'Georgia'], ['gr', 'Greece'], ['xk', 'Kosovo'],
  ['me', 'Montenegro'], ['mk', 'North Macedonia'], ['ro', 'Romania'], ['rs', 'Serbia'], ['si', 'Slovenia'],
].map(([code, name]) => ({ code, name }));
const COUNTRY_NAME = Object.fromEntries(COUNTRIES.map(c => [c.code, c.name]));

// Attachments: stored in Firestore as base64 pieces (Firebase Storage would need the paid plan).
const MAX_FILE = 2_000_000;          // bytes, after photo shrinking
const CHUNK_CHARS = 600_000;         // base64 chars per chunk doc (rules allow 700k, Firestore doc limit ~1 MiB)
const MAX_CHUNKS = 5;
const FILE_EXT = /\.(pdf|docx?|xlsx?|pptx?|txt|csv|rtf|md|odt|ods|odp|key|pages|numbers|zip|gif|jpe?g|png|webp|heic|heif)$/i;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const VIEWS = ['boot', 'config', 'login', 'pending', 'chat'];
const show = v => VIEWS.forEach(n => { $('#v-' + n).hidden = n !== v; });

/* ---------------------------------------------------------------- helpers */
function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach(c => c != null && n.append(c.nodeType ? c : document.createTextNode(c)));
  return n;
}
const icon = (id, cls = 'icon') => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('class', cls); s.setAttribute('aria-hidden', 'true'); const u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', '#' + id); s.append(u); return s; };
const initials = name => (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const colorOf = str => { let h = 0; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return 'c' + (h % 4); };
const avatar = (name, key, size) => { const a = el('span', { class: `avatar ${colorOf(key || name)}`, 'aria-hidden': 'true', text: initials(name) }); if (size) a.style.setProperty('--s', size + 'px'); return a; };
// The database value stays 'admin' (existing profiles + rules keep working); people only ever see "Co-President".
const ROLE_LABEL = { admin: 'Co-President', exec: 'Exec' };
const roleBadge = role => el('span', { class: 'rolebadge' + (role === 'admin' ? ' is-admin' : ''), text: ROLE_LABEL[role] || 'Exec' });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
function dayLabel(d) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(d); that.setHours(0, 0, 0, 0);
  const diff = Math.round((today - that) / 864e5);
  return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : dayFmt.format(d);
}
function toast(msg, kind) {
  const t = el('div', { class: 'toast' + (kind === 'error' ? ' is-error' : ''), role: kind === 'error' ? 'alert' : 'status', text: msg });
  $('#toasts').append(t);
  setTimeout(() => t.remove(), kind === 'error' ? 6000 : 3800);
}
function linkify(text) {
  const frag = document.createDocumentFragment();
  const re = /https?:\/\/[^\s<>"']+/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    let url = m[0], trail = '';
    const t = url.match(/[.,;:!?)\]]+$/); if (t) { trail = t[0]; url = url.slice(0, -trail.length); }
    frag.append(text.slice(last, m.index));
    frag.append(el('a', { href: url, target: '_blank', rel: 'noopener noreferrer nofollow', text: url }));
    if (trail) frag.append(trail);
    last = m.index + m[0].length;
  }
  frag.append(text.slice(last));
  return frag;
}
const flagImg = code => el('img', { class: 'flag', src: `https://flagcdn.com/w40/${code}.png`, srcset: `https://flagcdn.com/w80/${code}.png 2x`, alt: COUNTRY_NAME[code] || '', title: COUNTRY_NAME[code] || '', width: 20, height: 15, loading: 'lazy', decoding: 'async' });
const flagsFor = uid => (S.team.get(uid)?.countries || []).filter(c => COUNTRY_NAME[c]);
const flagsSpan = uid => { const f = flagsFor(uid); return f.length ? el('span', { class: 'flags' }, f.map(flagImg)) : null; };
const fmtSize = n => n < 1000 ? `${n} B` : n < 1e6 ? `${Math.round(n / 1000)} KB` : `${(n / 1e6).toFixed(1)} MB`;   // decimal, like Finder/Explorer
const store = {
  get() { try { return JSON.parse(localStorage.getItem(HINT_KEY) || 'null'); } catch { return null; } },
  set(v) { try { localStorage.setItem(HINT_KEY, JSON.stringify(v)); } catch { /* storage blocked */ } },
  clear() { try { localStorage.removeItem(HINT_KEY); } catch { /* storage blocked */ } },
};

/* ------------------------------------------------------------------ state */
const S = {
  user: null, profile: null, chatOn: false,
  channels: [], channelId: null, msgs: [], firstRender: true, msgsLoaded: false,
  members: [], pendings: [], seeded: false, pendingSent: null, loginNotice: '',
  team: new Map(), teamReady: false, flagSkipped: false, att: null, sending: false,
  unsubs: {},
};
let auth, db, F; // F = firebase function namespace
const stop = k => { if (S.unsubs[k]) { S.unsubs[k](); delete S.unsubs[k]; } };
const isAdmin = () => S.profile?.role === 'admin';
const visibleChannels = () => S.channels.filter(c => !c.archived || isAdmin());
const curChannel = () => S.channels.find(c => c.id === S.channelId) || null;
const canPost = ch => !!ch && !ch.archived && (!ch.adminOnly || isAdmin());

/* ------------------------------------------------------------------- boot */
function fatal(title, body) {
  $('#v-config h1').textContent = title;
  $('#v-config p.muted').textContent = body;
  show('config');
}

async function init() {
  let cfg;
  try { cfg = (await import('../firebase-config.js')).default; } catch { cfg = null; }
  if (!cfg || !cfg.apiKey || !cfg.projectId || /YOUR_/.test(`${cfg.apiKey}${cfg.projectId}`)) { show('config'); return; }

  let appM, authM, fsM;
  try {
    [appM, authM, fsM] = await Promise.all([
      import(`${CDN}/firebase-app.js`), import(`${CDN}/firebase-auth.js`), import(`${CDN}/firebase-firestore.js`),
    ]);
  } catch (e) {
    fatal("Couldn't load the team area", 'Firebase could not be reached. Check your connection and refresh.'); return;
  }
  F = { ...authM, ...fsM };
  const app = appM.initializeApp(cfg);
  auth = authM.getAuth(app);
  db = fsM.getFirestore(app);
  if (cfg.useEmulators) { // local testing only — see FIREBASE_SETUP.md
    authM.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    fsM.connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  try { await F.setPersistence(auth, F.browserLocalPersistence); } catch { /* falls back to default persistence */ }
  F.onAuthStateChanged(auth, onAuth);
}

function teardown() {
  Object.keys(S.unsubs).forEach(stop);
  S.chatOn = false; S.profile = null; S.channels = []; S.channelId = null; S.msgs = []; S.msgsLoaded = false;
  S.members = []; S.pendings = []; S.seeded = false; S.firstRender = true;
  S.team = new Map(); S.teamReady = false; S.flagSkipped = false; clearAttachment(true);
  for (const d of ['adminDlg', 'flagDlg', 'viewDlg']) if ($('#' + d).open) $('#' + d).close();
}

function onAuth(user) {
  teardown();
  S.user = user;
  renderWho();
  if (!user) {
    store.clear();
    S.pendingSent = null;
    const n = $('#loginNotice');
    n.hidden = !S.loginNotice; n.textContent = S.loginNotice; S.loginNotice = '';
    show('login');
    return;
  }
  show('boot');
  watchProfile(user);
}

/* ------------------------------------------------------------------ login */
const authMessage = err => ({
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/user-not-found': 'Incorrect email or password.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/missing-password': 'Enter your password.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes, or use “Forgot password?”.',
  'auth/user-disabled': 'This account has been disabled. Contact a Co-President.',
  'auth/network-request-failed': 'Network problem — check your connection and try again.',
}[err?.code] || "Couldn't log you in. Please try again.");

const setLoginError = msg => { const e = $('#loginError'); e.hidden = !msg; e.textContent = msg || ''; };

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!auth) return;
  setLoginError('');
  const email = $('#loginEmail').value.trim(), pw = $('#loginPw').value;
  if (!email || !pw) { setLoginError('Enter your email and password.'); return; }
  const btn = $('#loginBtn'); btn.disabled = true; btn.textContent = 'Logging in…';
  try { await F.signInWithEmailAndPassword(auth, email, pw); }
  catch (err) { setLoginError(authMessage(err)); $('#loginPw').value = ''; $('#loginPw').focus(); }
  finally { btn.disabled = false; btn.textContent = 'Log in'; }
});

$('#pwToggle').addEventListener('click', e => {
  const i = $('#loginPw'), on = i.type === 'password';
  i.type = on ? 'text' : 'password';
  e.currentTarget.setAttribute('aria-pressed', String(on));
  e.currentTarget.setAttribute('aria-label', on ? 'Hide password' : 'Show password');
});

$('#resetBtn').addEventListener('click', async () => {
  const email = $('#loginEmail').value.trim();
  setLoginError('');
  if (!email) { setLoginError('Type your email above first, then press “Forgot password?”.'); $('#loginEmail').focus(); return; }
  try { await F.sendPasswordResetEmail(auth, email); } catch (err) { if (err?.code === 'auth/network-request-failed') { setLoginError(authMessage(err)); return; } }
  const n = $('#loginNotice'); n.hidden = false;
  n.textContent = 'If that email has an exec account, a password-reset link is on its way. Check your inbox (and spam).';
});

$('#logoutBtn').addEventListener('click', () => { if (auth) F.signOut(auth).catch(() => toast('Could not log out. Try again.', 'error')); });

/* ---------------------------------------------------------------- profile */
function renderWho() {
  const p = S.profile;
  $('#who').hidden = !p;
  if (!p) return;
  const a = $('#whoAv'); a.textContent = initials(p.name); a.className = `avatar ${colorOf(p.uid)}`;
  $('#whoName').textContent = p.name;
  $('#whoFlags').replaceChildren(...flagsFor(p.uid).map(flagImg));
  const r = $('#whoRole'); r.textContent = ROLE_LABEL[p.role]; r.className = 'rolebadge' + (p.role === 'admin' ? ' is-admin' : '');
}

function watchProfile(user) {
  stop('profile');
  S.unsubs.profile = F.onSnapshot(F.doc(db, 'users', user.uid), snap => {
    if (!snap.exists()) { // signed in, but no profile yet
      const had = S.chatOn;
      if (had) teardownChat();
      S.profile = null; renderWho(); store.clear();
      enterPending(user);
      return;
    }
    const p = snap.data();
    if (p.active !== true) {
      S.loginNotice = 'Your exec account has been deactivated. Contact a Co-President if you think this is a mistake.';
      F.signOut(auth);
      return;
    }
    const prev = S.profile;
    S.profile = { uid: user.uid, name: p.name || user.email, email: p.email || user.email, role: p.role === 'admin' ? 'admin' : 'exec' };
    renderWho();
    store.set({ name: S.profile.name, role: S.profile.role });
    if (!S.chatOn) startChat();
    else if (prev && prev.role !== S.profile.role) onRoleChanged();
  }, err => {
    console.error('profile listener', err);
    S.loginNotice = err?.code === 'permission-denied'
      ? "Couldn't read your profile — the Firestore security rules may not be published yet (see FIREBASE_SETUP.md)."
      : "Couldn't load your profile. Check your connection and try again.";
    F.signOut(auth);
  });
}

async function enterPending(user) {
  $('#pendEmail').textContent = user.email || '';
  $('#pendUid').textContent = user.uid;
  show('pending');
  if (S.pendingSent === user.uid) return;
  S.pendingSent = user.uid;
  try { await F.setDoc(F.doc(db, 'pending', user.uid), { email: user.email, requestedAt: F.serverTimestamp() }); }
  catch (err) { console.warn('could not file approval request', err); }
}

/* ------------------------------------------------------------------- chat */
function startChat() {
  S.chatOn = true;
  show('chat');
  $('#adminBox').hidden = !isAdmin();
  watchTeam();
  watchChannels();
  if (isAdmin()) watchAdmin();
}
function teardownChat() {
  ['channels', 'messages', 'members', 'pending', 'team'].forEach(stop);
  S.chatOn = false; S.channels = []; S.channelId = null; S.msgs = []; S.members = []; S.pendings = []; S.msgsLoaded = false;
  S.team = new Map(); S.teamReady = false;
  if ($('#adminDlg').open) $('#adminDlg').close();
}
function onRoleChanged() {
  toast(`You're now ${S.profile.role === 'admin' ? 'a Co-President' : 'an Exec'}.`);
  $('#adminBox').hidden = !isAdmin();
  if (isAdmin()) watchAdmin(); else { stop('members'); stop('pending'); S.members = []; S.pendings = []; if ($('#adminDlg').open) $('#adminDlg').close(); }
  renderChannels(); ensureActive(); updateComposer();
}

// A realtime listener can fail with permission-denied for a moment when someone's role or
// status changes (the profile listener then reacts: tools disappear, or they're signed out).
// That's expected, so don't shout about it; surface only unexpected failures.
function listenerError(name, err, msg) {
  stop(name);
  if (err?.code === 'permission-denied') { console.warn(`${name} listener stopped (permission denied)`); return; }
  console.error(`${name} listener`, err);
  if (msg) toast(msg, 'error');
}

function watchChannels() {
  stop('channels');
  S.unsubs.channels = F.onSnapshot(F.collection(db, 'channels'), snap => {
    S.channels = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.id.localeCompare(b.id));
    if (isAdmin() && !snap.metadata.fromCache && !S.seeded) {
      const have = new Set(snap.docs.map(d => d.id)), missing = DEFAULT_CHANNELS.filter(c => !have.has(c.id));
      if (missing.length) seedChannels(missing);
    }
    renderChannels(); ensureActive();
    if ($('#adminDlg').open) renderChannelsPane();
  }, err => listenerError('channels', err, "Couldn't load channels."));
}

async function seedChannels(list) {
  S.seeded = true;
  try {
    const batch = F.writeBatch(db);
    for (const c of list) {
      batch.set(F.doc(db, 'channels', c.id), {
        name: c.id, description: c.description, adminOnly: c.adminOnly, archived: false, order: c.order,
        createdAt: F.serverTimestamp(), createdBy: S.profile.uid,
      });
    }
    await batch.commit();
    toast(list.length === DEFAULT_CHANNELS.length ? 'Set up the default channels.' : `Added ${list.length} new channel${list.length === 1 ? '' : 's'}.`);
  } catch (err) { console.error(err); S.seeded = false; toast("Couldn't create the default channels.", 'error'); }
}

function renderChannels() {
  const list = $('#chList'); list.replaceChildren();
  const live = visibleChannels().filter(c => !c.archived), archived = visibleChannels().filter(c => c.archived);
  const item = c => el('button', {
    class: 'ch' + (c.archived ? ' is-archived' : ''), type: 'button', 'aria-current': c.id === S.channelId ? 'true' : null,
    onclick: () => selectChannel(c.id),
  }, icon('i-hash'), el('span', { class: 'ch__name', text: c.name || c.id }), c.adminOnly ? icon('i-lock', 'icon ch__lock') : null);
  const used = new Set();
  for (const g of CHANNEL_GROUPS) {
    const here = live.filter(c => g.ids.includes(c.id)); here.forEach(c => used.add(c.id));
    if (here.length) { list.append(el('h3', { text: g.label })); here.forEach(c => list.append(item(c))); }
  }
  const more = live.filter(c => !used.has(c.id));
  if (more.length) { list.append(el('h3', { text: used.size ? 'More' : 'Channels' })); more.forEach(c => list.append(item(c))); }
  if (!live.length && !archived.length) list.append(el('p', { class: 'sec-note', style: 'padding:12px', text: 'No channels yet. A Co-President needs to sign in once to set them up.' }));
  if (archived.length) { list.append(el('h3', { text: 'Archived' })); archived.forEach(c => list.append(item(c))); }
}

function ensureActive() {
  const vis = visibleChannels();
  const fromHash = decodeURIComponent(location.hash.slice(1));
  let id = vis.find(c => c.id === S.channelId)?.id;
  if (!id && fromHash) id = vis.find(c => c.id === fromHash)?.id;
  if (!id) id = (vis.find(c => !c.archived) || vis[0])?.id || null;
  if (id !== S.channelId || !S.unsubs.messages) selectChannel(id, { quiet: true });
  else { renderRoomHead(); updateComposer(); }
}

function selectChannel(id, { quiet } = {}) {
  closeDrawer();
  const changed = id !== S.channelId;
  S.channelId = id;
  if (changed || !S.unsubs.messages) { S.msgs = []; S.firstRender = true; S.msgsLoaded = false; watchMessages(id); }
  if (id && !quiet) history.replaceState(null, '', '#' + encodeURIComponent(id));
  renderChannels(); renderRoomHead(); updateComposer(); renderMessages();
  if (changed && !quiet) $('#msgInput').focus({ preventScroll: true });
}
window.addEventListener('hashchange', () => { if (S.chatOn) { const id = decodeURIComponent(location.hash.slice(1)); if (id && id !== S.channelId && visibleChannels().some(c => c.id === id)) selectChannel(id, { quiet: true }); } });

function renderRoomHead() {
  const ch = curChannel();
  $('#roomName').textContent = ch ? '# ' + (ch.name || ch.id) : '# —';
  $('#roomDesc').textContent = ch?.description || '';
  const tag = $('#roomTag');
  if (ch?.archived) { tag.hidden = false; tag.textContent = 'Archived'; tag.classList.remove('is-gold'); }
  else if (ch?.adminOnly) { tag.hidden = false; tag.textContent = 'Co-Presidents post'; tag.classList.add('is-gold'); }
  else tag.hidden = true;
}

/* --------------------------------------------------------------- messages */
function watchMessages(id) {
  stop('messages');
  if (!id) return;
  const q = F.query(F.collection(db, 'channels', id, 'messages'), F.orderBy('createdAt', 'desc'), F.limit(150));
  S.unsubs.messages = F.onSnapshot(q, snap => {
    if (id !== S.channelId) return;
    S.msgs = snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }), pending: d.metadata.hasPendingWrites })).reverse();
    S.msgsLoaded = true;
    renderMessages();
    S.firstRender = false;
  }, err => listenerError('messages', err, "Couldn't load messages."));
}

function renderMessages() {
  const box = $('#msgs');
  const nearBottom = S.firstRender || box.scrollHeight - box.scrollTop - box.clientHeight < 140;
  const frag = document.createDocumentFragment();
  if (!S.msgsLoaded && curChannel()) {
    frag.append(el('div', { class: 'empty', text: 'Loading messages…' }));
  } else if (!S.msgs.length) {
    const ch = curChannel();
    frag.append(el('div', { class: 'empty' }, el('b', { text: ch ? `Welcome to #${ch.name || ch.id}` : 'No channel selected' }), ch ? 'No messages yet — say something!' : 'Pick a channel from the list.'));
  }
  let prev = null;
  for (const m of S.msgs) {
    const when = m.createdAt?.toDate ? m.createdAt.toDate() : new Date();
    if (!prev || dayLabel(when) !== dayLabel(prev.when)) frag.append(el('div', { class: 'day', role: 'separator', text: dayLabel(when) }));
    const cont = prev && prev.m.uid === m.uid && when - prev.when < GROUP_MS && dayLabel(when) === dayLabel(prev.when);
    const row = el('article', { class: 'msg' + (cont ? ' is-cont' : '') + (m.pending ? ' is-pending' : '') },
      avatar(m.senderName, m.uid),
      el('div', {},
        cont ? null : el('div', { class: 'msg__meta' }, el('b', { text: m.senderName || 'Unknown' }), flagsSpan(m.uid), m.senderRole === 'admin' ? roleBadge('admin') : null, el('time', { datetime: when.toISOString(), text: timeFmt.format(when) })),
        m.text ? el('div', { class: 'msg__text' }, linkify(m.text)) : null,
        m.file ? attachmentEl(m) : null),
      isAdmin() && !m.pending ? el('button', { class: 'msg__del', type: 'button', 'aria-label': 'Delete message', title: 'Delete message (Co-President)', onclick: () => deleteMessage(m) }, icon('i-trash')) : null);
    frag.append(row);
    prev = { m, when };
  }
  box.replaceChildren(frag);
  if (nearBottom) box.scrollTop = box.scrollHeight;
}

async function deleteMessage(m) {
  if (!confirm(`Delete this message from ${m.senderName}? This can't be undone.`)) return;
  try {
    const b = F.writeBatch(db);
    for (let i = 0; m.file && i < (m.file.chunks || 0); i++) b.delete(F.doc(db, 'channels', S.channelId, 'messages', m.id, 'chunks', String(i)));
    b.delete(F.doc(db, 'channels', S.channelId, 'messages', m.id));
    await b.commit();
  } catch (err) { console.error(err); toast("Couldn't delete that message.", 'error'); }
}

/* ------------------------------------------------------------ attachments */
const input = $('#msgInput');
const blobCache = new Map(); // messageId -> Blob (so reopening a file doesn't re-read it)

function readAsDataURL(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
}
const dataUrlToBase64 = u => u.slice(u.indexOf(',') + 1);
function loadImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('decode')); };
    img.src = url;
  });
}
function drawJpeg(img, maxSide, quality) {
  const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
  return new Promise(res => c.toBlob(res, 'image/jpeg', quality));
}
// Shrink a photo until it fits comfortably (re-encoding also strips location/EXIF data).
async function prepareImage(file) {
  const img = await loadImage(file);
  let blob = null;
  for (const [side, q] of [[1600, 0.85], [1600, 0.72], [1280, 0.72], [1024, 0.7], [800, 0.65]]) {
    blob = await drawJpeg(img, side, q);
    if (blob && blob.size <= 1_400_000) break;
  }
  if (!blob || blob.size > MAX_FILE) throw new Error('toobig');
  let thumb = '';
  for (const [side, q] of [[360, 0.7], [280, 0.6], [200, 0.5]]) {
    thumb = await readAsDataURL(await drawJpeg(img, side, q));
    if (thumb.length <= 30_000) break;
  }
  const name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
  return { kind: 'image', blob, name, mime: 'image/jpeg', thumb };
}

async function prepareAttachment(file) {
  if (!file) return null;
  const name = (file.name || 'file').split(/[\\/]/).pop().slice(0, 120) || 'file';
  const isImg = /^image\//.test(file.type) && !/gif$/.test(file.type);
  if (!isImg && !FILE_EXT.test(name)) throw new Error('type');
  if (isImg) {
    try { const a = await prepareImage(file); return a; }
    catch (e) { if (e.message === 'toobig') throw e; throw new Error('decode'); }
  }
  if (file.size > MAX_FILE) throw new Error('toobig');
  if (file.size === 0) throw new Error('empty');
  return { kind: 'file', blob: file, name, mime: (file.type || 'application/octet-stream').slice(0, 100) };
}

async function toChunks(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  const b64 = btoa(bin), out = [];
  for (let i = 0; i < b64.length; i += CHUNK_CHARS) out.push(b64.slice(i, i + CHUNK_CHARS));
  return out;
}

const attErrors = {
  type: "That file type isn't supported. Try PDF, Word/Excel/PowerPoint, text, zip or a photo.",
  toobig: 'That file is too big — the limit is 2 MB. Share larger files with a Drive/Dropbox link instead.',
  decode: "Couldn't read that photo. Try a JPEG or PNG.",
  empty: 'That file is empty.',
};

function renderAttachment() {
  const chip = $('#attChip'), a = S.att;
  chip.hidden = !a; chip.replaceChildren();
  if (!a) return;
  const lead = a.thumb ? el('img', { class: 'chip__thumb', src: a.thumb, alt: '' }) : el('span', { class: 'chip__ico' }, icon('i-file'));
  chip.append(lead, el('span', { class: 'chip__txt' }, el('b', { text: a.name }), el('span', { text: a.busy ? 'Preparing…' : fmtSize(a.blob.size) })),
    el('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Remove attachment', onclick: () => clearAttachment(), disabled: S.sending }, icon('i-close')));
}
function clearAttachment(silent) { S.att = null; $('#fileInput').value = ''; if (!silent) renderAttachment(); else $('#attChip').hidden = true; }

async function attachFile(file) {
  if (!file || S.sending || !canPost(curChannel())) return;
  S.att = { name: file.name || 'file', blob: file, busy: true }; renderAttachment();
  try { S.att = await prepareAttachment(file); }
  catch (e) { S.att = null; toast(attErrors[e.message] || "Couldn't attach that file.", 'error'); }
  renderAttachment(); updateSend();
}
$('#attachBtn').addEventListener('click', () => $('#fileInput').click());
$('#fileInput').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; attachFile(f); });
input.addEventListener('paste', e => { const f = [...(e.clipboardData?.files || [])][0]; if (f) { e.preventDefault(); attachFile(f); } });

// Drag & drop anywhere on the conversation
{
  const room = $('.room'), dz = $('#dropzone'); let depth = 0;
  const has = e => [...(e.dataTransfer?.types || [])].includes('Files');
  room.addEventListener('dragenter', e => { if (has(e) && canPost(curChannel())) { depth++; dz.hidden = false; e.preventDefault(); } });
  room.addEventListener('dragover', e => { if (has(e)) e.preventDefault(); });
  room.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) dz.hidden = true; });
  room.addEventListener('drop', e => { if (!has(e)) return; e.preventDefault(); depth = 0; dz.hidden = true; attachFile(e.dataTransfer.files[0]); });
}

function attachmentEl(m) {
  const f = m.file, uploading = m.pending;
  const open = () => openAttachment(m);
  if (f.kind === 'image' && f.thumb) {
    return el('button', { class: 'att att--img', type: 'button', onclick: open, 'aria-label': `View photo ${f.name}`, disabled: uploading },
      el('img', { src: f.thumb, alt: f.name }), el('span', { class: 'att__cap', text: f.name }));
  }
  return el('button', { class: 'att att--file', type: 'button', onclick: open, 'aria-label': `Download ${f.name}`, disabled: uploading },
    el('span', { class: 'att__ico' }, icon('i-file')),
    el('span', { class: 'att__meta' }, el('b', { text: f.name }), el('span', { text: uploading ? 'Uploading…' : `${fmtSize(f.size)} · tap to download` })),
    icon('i-down', 'icon att__dl'));
}

async function fetchBlob(m) {
  if (blobCache.has(m.id)) return blobCache.get(m.id);
  const q = F.query(F.collection(db, 'channels', S.channelId, 'messages', m.id, 'chunks'), F.orderBy('i'));
  const snap = await F.getDocs(q);
  const parts = snap.docs.map(d => d.data().data);
  if (parts.length !== m.file.chunks) throw new Error('incomplete');
  const bin = atob(parts.join('')), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  // Images are re-encoded JPEGs we made ourselves. Everything else is served as an opaque download,
  // so a pasted .html/.svg can never run inside this site.
  const blob = new Blob([bytes], { type: m.file.kind === 'image' ? 'image/jpeg' : 'application/octet-stream' });
  if (blobCache.size > 12) blobCache.delete(blobCache.keys().next().value);
  blobCache.set(m.id, blob);
  return blob;
}
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob), a = el('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
}
let viewing = null; // { blob, name, url }
async function openAttachment(m) {
  const btn = document.activeElement;
  btn?.classList?.add('is-loading');
  try {
    const blob = await fetchBlob(m);
    if (m.file.kind === 'image') {
      if (viewing?.url) URL.revokeObjectURL(viewing.url);
      viewing = { blob, name: m.file.name, url: URL.createObjectURL(blob) };
      $('#viewImg').src = viewing.url; $('#viewImg').alt = m.file.name; $('#viewName').textContent = m.file.name;
      $('#viewDlg').showModal();
    } else { saveBlob(blob, m.file.name); }
  } catch (err) {
    console.error(err);
    toast(err.message === 'incomplete' ? 'That file is still uploading — try again in a moment.' : "Couldn't load that file.", 'error');
  } finally { btn?.classList?.remove('is-loading'); }
}
$('#viewClose').addEventListener('click', () => $('#viewDlg').close());
$('#viewDlg').addEventListener('click', e => { if (e.target === $('#viewDlg') || e.target.classList.contains('viewer__stage')) $('#viewDlg').close(); });
$('#viewDl').addEventListener('click', () => viewing && saveBlob(viewing.blob, viewing.name));
$('#viewDlg').addEventListener('close', () => { if (viewing?.url) URL.revokeObjectURL(viewing.url); viewing = null; $('#viewImg').removeAttribute('src'); });

/* --------------------------------------------------------------- composer */
function autosize() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 160) + 'px'; }
function updateSend() { $('#sendBtn').disabled = S.sending || (S.att?.busy) || (!input.value.trim() && !S.att); }
input.addEventListener('input', () => { autosize(); updateSend(); });
input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#composer').requestSubmit(); }
});

function updateComposer() {
  const ch = curChannel(), ok = canPost(ch);
  $('#composerRow').hidden = !ok;
  if (!ok) clearAttachment();
  const lock = $('#composerLock'); lock.hidden = ok;
  if (!ok) {
    $('#composerLockTxt').textContent = !ch ? 'Pick a channel to start chatting.'
      : ch.archived ? 'This channel is archived — it’s read-only.'
      : `Only the Co-Presidents can post in #${ch.name || ch.id}. Everyone else can read it here.`;
  } else input.placeholder = `Message #${ch.name || ch.id}`;
  updateSend();
}

$('#composer').addEventListener('submit', async e => {
  e.preventDefault();
  const ch = curChannel(), text = input.value.trim(), att = S.att;
  if ((!text && !att) || att?.busy || S.sending || !canPost(ch) || !S.profile) return;
  if (text.length > MAX_LEN) { toast(`Messages are limited to ${MAX_LEN} characters.`, 'error'); return; }
  const data = { text, uid: S.profile.uid, senderName: S.profile.name, senderRole: S.profile.role, createdAt: F.serverTimestamp() };
  S.sending = true; $('#sendBtn').disabled = true;
  try {
    if (att) {
      const parts = await toChunks(att.blob);
      if (parts.length > MAX_CHUNKS) throw Object.assign(new Error('toobig'), { local: true });
      data.file = { name: att.name, mime: att.mime, size: att.blob.size, chunks: parts.length, kind: att.kind };
      if (att.thumb) data.file.thumb = att.thumb;
      const ref = F.doc(F.collection(db, 'channels', ch.id, 'messages'));
      const b = F.writeBatch(db);
      b.set(ref, data);
      parts.forEach((d, i) => b.set(F.doc(db, 'channels', ch.id, 'messages', ref.id, 'chunks', String(i)), { i, data: d }));
      input.value = ''; autosize(); clearAttachment();
      await b.commit();
    } else {
      input.value = ''; autosize();
      await F.addDoc(F.collection(db, 'channels', ch.id, 'messages'), data);
    }
  } catch (err) {
    console.error(err);
    if (!input.value) { input.value = text; autosize(); }
    if (att && !S.att) { S.att = att; renderAttachment(); }
    toast(err.local ? attErrors.toobig : err?.code === 'permission-denied' ? "You don't have permission to post here." : "Message didn't send. Try again.", 'error');
  } finally { S.sending = false; updateSend(); }
});

/* ------------------------------------------------------------- flags */
function watchTeam() {
  stop('team');
  S.unsubs.team = F.onSnapshot(F.collection(db, 'team'), snap => {
    S.team = new Map(snap.docs.map(d => [d.id, d.data()]));
    renderWho();
    if (S.msgsLoaded) renderMessages();
    if (dlg.open) renderAdmin('members');
    if (!snap.metadata.fromCache) {
      S.teamReady = true;
      if (S.profile && !S.team.has(S.profile.uid) && !S.flagSkipped && !$('#flagDlg').open) openFlagDialog(true);
    }
  }, err => listenerError('team', err));
}

const flagDlg = $('#flagDlg');
let flagPicked = [];
function renderFlagPick() {
  const box = $('#flagPick'); box.replaceChildren();
  for (const c of COUNTRIES) {
    const on = flagPicked.includes(c.code);
    box.append(el('button', { class: 'flagopt', type: 'button', 'aria-pressed': String(on), onclick: () => {
      flagPicked = on ? flagPicked.filter(x => x !== c.code) : flagPicked.length >= 2 ? [...flagPicked.slice(1), c.code] : [...flagPicked, c.code];
      renderFlagPick();
    } }, flagImg(c.code), el('span', { text: c.name })));
  }
  $('#flagSave').disabled = !flagPicked.length;
  $('#flagNote').textContent = flagPicked.length === 2 ? 'Two flags selected. Tap another to swap the oldest.' : flagPicked.length ? 'Tap a second country if you’re mixed.' : 'Pick one or two.';
}
function openFlagDialog(first) {
  flagPicked = flagsFor(S.profile.uid).slice(0, 2);
  $('#flagLater').textContent = first ? 'Ask me later' : 'Cancel';
  renderFlagPick();
  if (!flagDlg.open) flagDlg.showModal();
}
async function saveFlags(countries) {
  try {
    await F.setDoc(F.doc(db, 'team', S.profile.uid), { name: S.profile.name, countries, updatedAt: F.serverTimestamp() });
    flagDlg.close();
    toast(countries.length ? 'Flag saved — it’ll show on the website team page.' : 'Okay — no flag will be shown.');
  } catch (err) { console.error(err); toast("Couldn't save that. Try again.", 'error'); }
}
$('#flagForm').addEventListener('submit', e => { e.preventDefault(); if (flagPicked.length) saveFlags(flagPicked); });
$('#flagNone').addEventListener('click', () => saveFlags([]));
$('#flagLater').addEventListener('click', () => { S.flagSkipped = true; flagDlg.close(); });
$('#flagClose').addEventListener('click', () => { S.flagSkipped = true; flagDlg.close(); });
flagDlg.addEventListener('click', e => { if (e.target === flagDlg) { S.flagSkipped = true; flagDlg.close(); } });
flagDlg.addEventListener('cancel', () => { S.flagSkipped = true; });
$('#flagBtn').addEventListener('click', () => S.profile && openFlagDialog(false));

/* -------------------------------------------------------- mobile drawer */
const openDrawer = () => { $('#side').classList.add('is-open'); $('#scrim').hidden = false; };
function closeDrawer() { $('#side').classList.remove('is-open'); $('#scrim').hidden = true; }
$('#sideOpen').addEventListener('click', openDrawer);
$('#sideClose').addEventListener('click', closeDrawer);
$('#scrim').addEventListener('click', closeDrawer);

/* ------------------------------------------------------------ admin panel */
function watchAdmin() {
  stop('members'); stop('pending');
  S.unsubs.members = F.onSnapshot(F.collection(db, 'users'), snap => {
    S.members = snap.docs.map(d => ({ uid: d.id, ...d.data() }))
      .sort((a, b) => (a.role === 'admin' ? 0 : 1) - (b.role === 'admin' ? 0 : 1) || (a.name || '').localeCompare(b.name || ''));
    renderAdmin('members');
  }, err => listenerError('members', err));
  S.unsubs.pending = F.onSnapshot(F.collection(db, 'pending'), snap => {
    S.pendings = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    updatePendBadges(); renderAdmin('pending');
  }, err => listenerError('pending', err));
}
function updatePendBadges() {
  for (const id of ['pendCount', 'pendCount2']) { const b = $('#' + id); b.hidden = !S.pendings.length; b.textContent = S.pendings.length; }
}

const dlg = $('#adminDlg');
$('#adminBtn').addEventListener('click', () => { renderAdmin(); dlg.showModal(); });
$('#adminClose').addEventListener('click', () => dlg.close());
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
function setPane(name) {
  $$('.tabs [role="tab"]').forEach(t => { const on = t.dataset.pane === name; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
  ['members', 'pending', 'channels'].forEach(p => { $('#pane-' + p).hidden = p !== name; });
  renderAdmin(name);
}
$$('.tabs [role="tab"]').forEach((t, i, all) => {
  t.addEventListener('click', () => setPane(t.dataset.pane));
  t.addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const n = all[(i + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length]; n.focus(); setPane(n.dataset.pane);
  });
});

function renderAdmin(which) {
  if (!dlg.open && which) return;
  const panes = which ? [which] : ['members', 'pending', 'channels'];
  // don't clobber a field someone is typing in
  const ae = document.activeElement;
  if (panes.some(p => $('#pane-' + p).contains(ae)) && ae.tagName === 'INPUT' && ae.type === 'text') { S.adminDirty = true; return; }
  if (panes.includes('members')) renderMembersPane();
  if (panes.includes('pending')) renderPendingPane();
  if (panes.includes('channels')) renderChannelsPane();
}
dlg.addEventListener('focusout', () => { if (S.adminDirty) setTimeout(() => { if (!dlg.contains(document.activeElement) || document.activeElement.tagName !== 'INPUT') { S.adminDirty = false; renderAdmin(); } }, 50); });

async function guarded(fn, okMsg) {
  try { await fn(); if (okMsg) toast(okMsg); }
  catch (err) { console.error(err); toast(err?.code === 'permission-denied' ? "You don't have permission to do that." : 'Something went wrong. Try again.', 'error'); renderAdmin(); }
}

function renderMembersPane() {
  const pane = $('#pane-members'); pane.replaceChildren();
  pane.append(el('p', { class: 'sec-note', text: `${S.members.length} member${S.members.length === 1 ? '' : 's'}. Change roles, rename, or deactivate. Deactivated members are signed out and locked out immediately. You can't change your own role or status.` }));
  if (!S.members.length) pane.append(el('p', { class: 'empty', text: 'No members yet.' }));
  for (const m of S.members) {
    const self = m.uid === S.profile.uid, off = m.active !== true;
    const name = el('input', { type: 'text', value: m.name || '', maxlength: 80, 'aria-label': `Name for ${m.email}`,
      onchange: ev => { const v = ev.target.value.trim(); if (!v) { ev.target.value = m.name; return; } if (v !== m.name) guarded(async () => {
        const b = F.writeBatch(db);
        b.update(F.doc(db, 'users', m.uid), { name: v });
        if (S.team.has(m.uid)) b.update(F.doc(db, 'team', m.uid), { name: v }); // keep the website flag matched to the new name
        await b.commit();
      }, 'Name updated.'); } });
    const roleSel = el('select', { 'aria-label': `Role for ${m.name}`, disabled: self,
      onchange: ev => {
        const v = ev.target.value;
        if (!confirm(`Make ${m.name} ${v === 'admin' ? 'a Co-President' : 'an Exec'}?` + (v === 'admin' ? '\n\nCo-Presidents can manage members, channels and announcements.' : ''))) { ev.target.value = m.role; return; }
        guarded(() => F.updateDoc(F.doc(db, 'users', m.uid), { role: v }), `${m.name} is now ${v === 'admin' ? 'a Co-President' : 'an Exec'}.`);
      } }, el('option', { value: 'exec', text: 'Exec', selected: m.role !== 'admin' }), el('option', { value: 'admin', text: 'Co-President', selected: m.role === 'admin' }));
    const act = el('input', { type: 'checkbox', checked: !off, disabled: self, 'aria-label': `Active: ${m.name}`,
      onchange: ev => {
        const v = ev.target.checked;
        if (!v && !confirm(`Deactivate ${m.name}? They'll be signed out and unable to read or post until reactivated.`)) { ev.target.checked = true; return; }
        guarded(() => F.updateDoc(F.doc(db, 'users', m.uid), { active: v }), v ? `${m.name} reactivated.` : `${m.name} deactivated.`);
      } });
    pane.append(el('div', { class: 'row' + (off ? ' is-off' : '') },
      avatar(m.name, m.uid, 40),
      el('div', { class: 'row__main' }, name, el('span', { class: 'row__sub' }, flagsSpan(m.uid), m.email + (self ? ' · you' : ''))),
      el('div', { class: 'row__ctl' }, roleSel, el('label', { class: 'switch' }, act, off ? 'Inactive' : 'Active'))));
  }
}

function renderPendingPane() {
  const pane = $('#pane-pending'); pane.replaceChildren();
  pane.append(el('p', { class: 'sec-note', text: 'People who have signed in but don’t have an exec profile yet appear here. Approving creates their profile and unlocks the team area for them instantly.' }));
  if (!S.pendings.length) { pane.append(el('p', { class: 'empty', text: 'Nobody is waiting for approval.' })); return; }
  for (const p of S.pendings) {
    const guess = (p.email || '').split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const name = el('input', { type: 'text', value: guess, maxlength: 80, 'aria-label': `Display name for ${p.email}` });
    const role = el('select', { 'aria-label': `Role for ${p.email}` }, el('option', { value: 'exec', text: 'Exec' }), el('option', { value: 'admin', text: 'Co-President' }));
    pane.append(el('div', { class: 'row' },
      avatar(guess, p.uid, 40),
      el('div', { class: 'row__main' }, name, el('span', { class: 'row__sub', text: p.email })),
      el('div', { class: 'row__ctl' }, role,
        el('button', { class: 'btn btn--sm', type: 'button', text: 'Approve', onclick: () => {
          const n = name.value.trim(); if (!n) { name.focus(); return; }
          if (role.value === 'admin' && !confirm(`Make ${n} a Co-President?`)) return;
          guarded(async () => {
            const b = F.writeBatch(db);
            b.set(F.doc(db, 'users', p.uid), { name: n, email: p.email, role: role.value, active: true, createdAt: F.serverTimestamp() });
            b.delete(F.doc(db, 'pending', p.uid));
            await b.commit();
          }, `${n} approved.`);
        } }),
        el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Dismiss', onclick: () => { if (confirm(`Dismiss the request from ${p.email}?`)) guarded(() => F.deleteDoc(F.doc(db, 'pending', p.uid)), 'Request dismissed.'); } }))));
  }
}

function renderChannelsPane() {
  const pane = $('#pane-channels');
  if (!$('#newChForm', pane)) {
    pane.replaceChildren(
      el('p', { class: 'sec-note', text: 'Create channels, mark them Co-Presidents-only (like #announcements), or archive ones you no longer need. Archived channels stay readable by Co-Presidents and are hidden from everyone else. Channels are archived, never deleted.' }),
      el('form', { id: 'newChForm', class: 'formrow', autocomplete: 'off', onsubmit: onCreateChannel },
        el('label', { class: 'field' }, el('span', { text: 'Name' }), el('input', { id: 'newChName', type: 'text', required: true, maxlength: 30, placeholder: 'e.g. sponsors' })),
        el('label', { class: 'field' }, el('span', { text: 'Description (optional)' }), el('input', { id: 'newChDesc', type: 'text', maxlength: 140, placeholder: 'What is this channel for?' })),
        el('button', { class: 'btn btn--sm', type: 'submit', text: 'Create' }),
        el('label', { class: 'switch' }, el('input', { id: 'newChAdminOnly', type: 'checkbox' }), 'Only Co-Presidents can post')),
      el('div', { id: 'chanRows' }));
  }
  const rows = $('#chanRows'); rows.replaceChildren();
  rows.style.display = 'grid'; rows.style.gap = '10px';
  for (const c of S.channels) {
    const onlyAdm = el('input', { type: 'checkbox', checked: !!c.adminOnly,
      onchange: ev => guarded(() => F.updateDoc(F.doc(db, 'channels', c.id), { adminOnly: ev.target.checked }), `#${c.name || c.id} is now ${ev.target.checked ? 'Co-Presidents-only' : 'open to everyone'}.`) });
    rows.append(el('div', { class: 'row' + (c.archived ? ' is-off' : '') },
      el('span', { class: 'avatar c2', 'aria-hidden': 'true', style: '--s:40px' }, icon('i-hash')),
      el('div', { class: 'row__main' }, el('b', { text: '#' + (c.name || c.id) }), el('span', { class: 'row__sub', text: c.description || 'No description' })),
      el('div', { class: 'row__ctl' },
        el('label', { class: 'switch' }, onlyAdm, 'Co-Presidents post'),
        el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: c.archived ? 'Unarchive' : 'Archive',
          onclick: () => { if (!c.archived && !confirm(`Archive #${c.name || c.id}? Execs will no longer see it.`)) return; guarded(() => F.updateDoc(F.doc(db, 'channels', c.id), { archived: !c.archived }), c.archived ? 'Channel restored.' : 'Channel archived.'); } }))));
  }
}

async function onCreateChannel(e) {
  e.preventDefault();
  const name = $('#newChName').value.trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '');
  if (!/^[a-z0-9-]{2,30}$/.test(name)) { toast('Channel names need 2–30 letters, numbers or dashes.', 'error'); return; }
  if (S.channels.some(c => c.id === name)) { toast(`#${name} already exists.`, 'error'); return; }
  const order = S.channels.reduce((m, c) => Math.max(m, c.order ?? 0), 0) + 1;
  await guarded(() => F.setDoc(F.doc(db, 'channels', name), {
    name, description: $('#newChDesc').value.trim(), adminOnly: $('#newChAdminOnly').checked, archived: false, order,
    createdAt: F.serverTimestamp(), createdBy: S.profile.uid,
  }), `#${name} created.`);
  e.target.reset();
}

init();
