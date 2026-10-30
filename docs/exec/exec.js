/* ==========================================================================
   ABSQU Exec area — Firebase Auth + Firestore, no build step.

   Roles live in Firestore:  users/{uid} = { name, email, role: 'admin'|'exec', active }
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

const DEFAULT_CHANNELS = [
  { id: 'announcements', description: 'Official updates from the co-presidents. Read-only for execs.', adminOnly: true, order: 0 },
  { id: 'general', description: 'Everything and anything ABSQU.', adminOnly: false, order: 1 },
  { id: 'events', description: 'Planning potlucks, watchparties and bar nights.', adminOnly: false, order: 2 },
  { id: 'marketing', description: 'Posts, posters, Instagram, campaigns.', adminOnly: false, order: 3 },
  { id: 'finance', description: 'Budgets, receipts, sponsorships.', adminOnly: false, order: 4 },
];

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
const roleBadge = role => el('span', { class: 'rolebadge' + (role === 'admin' ? ' is-admin' : ''), text: role });
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
  if ($('#adminDlg').open) $('#adminDlg').close();
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
  'auth/user-disabled': 'This account has been disabled. Contact an admin.',
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
  const r = $('#whoRole'); r.textContent = p.role; r.className = 'rolebadge' + (p.role === 'admin' ? ' is-admin' : '');
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
      S.loginNotice = 'Your exec account has been deactivated. Contact an admin if you think this is a mistake.';
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
  watchChannels();
  if (isAdmin()) watchAdmin();
}
function teardownChat() {
  ['channels', 'messages', 'members', 'pending'].forEach(stop);
  S.chatOn = false; S.channels = []; S.channelId = null; S.msgs = []; S.members = []; S.pendings = []; S.msgsLoaded = false;
  if ($('#adminDlg').open) $('#adminDlg').close();
}
function onRoleChanged() {
  toast(`Your role is now: ${S.profile.role}.`);
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
    if (isAdmin() && snap.empty && !snap.metadata.fromCache && !S.seeded) seedChannels();
    renderChannels(); ensureActive();
    if ($('#adminDlg').open) renderChannelsPane();
  }, err => listenerError('channels', err, "Couldn't load channels."));
}

async function seedChannels() {
  S.seeded = true;
  try {
    const batch = F.writeBatch(db);
    for (const c of DEFAULT_CHANNELS) {
      batch.set(F.doc(db, 'channels', c.id), {
        name: c.id, description: c.description, adminOnly: c.adminOnly, archived: false, order: c.order,
        createdAt: F.serverTimestamp(), createdBy: S.profile.uid,
      });
    }
    await batch.commit();
    toast('Set up the default channels.');
  } catch (err) { console.error(err); S.seeded = false; toast("Couldn't create the default channels.", 'error'); }
}

function renderChannels() {
  const list = $('#chList'); list.replaceChildren();
  const active = visibleChannels().filter(c => !c.archived), archived = visibleChannels().filter(c => c.archived);
  const item = c => el('button', {
    class: 'ch' + (c.archived ? ' is-archived' : ''), type: 'button', 'aria-current': c.id === S.channelId ? 'true' : null,
    onclick: () => selectChannel(c.id),
  }, icon('i-hash'), el('span', { class: 'ch__name', text: c.name || c.id }), c.adminOnly ? icon('i-lock', 'icon ch__lock') : null);
  active.forEach(c => list.append(item(c)));
  if (!active.length && !archived.length) list.append(el('p', { class: 'sec-note', style: 'padding:12px', text: 'No channels yet. An admin needs to sign in once to set them up.' }));
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
  else if (ch?.adminOnly) { tag.hidden = false; tag.textContent = 'Admins post'; tag.classList.add('is-gold'); }
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
        cont ? null : el('div', { class: 'msg__meta' }, el('b', { text: m.senderName || 'Unknown' }), m.senderRole === 'admin' ? roleBadge('admin') : null, el('time', { datetime: when.toISOString(), text: timeFmt.format(when) })),
        el('div', { class: 'msg__text' }, linkify(m.text || ''))),
      isAdmin() && !m.pending ? el('button', { class: 'msg__del', type: 'button', 'aria-label': 'Delete message', title: 'Delete message (admin)', onclick: () => deleteMessage(m) }, icon('i-trash')) : null);
    frag.append(row);
    prev = { m, when };
  }
  box.replaceChildren(frag);
  if (nearBottom) box.scrollTop = box.scrollHeight;
}

async function deleteMessage(m) {
  if (!confirm(`Delete this message from ${m.senderName}? This can't be undone.`)) return;
  try { await F.deleteDoc(F.doc(db, 'channels', S.channelId, 'messages', m.id)); }
  catch (err) { console.error(err); toast("Couldn't delete that message.", 'error'); }
}

/* --------------------------------------------------------------- composer */
const input = $('#msgInput');
function autosize() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 160) + 'px'; }
input.addEventListener('input', autosize);
input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#composer').requestSubmit(); }
});

function updateComposer() {
  const ch = curChannel(), ok = canPost(ch);
  $('#composerRow').hidden = !ok;
  const lock = $('#composerLock'); lock.hidden = ok;
  if (!ok) {
    $('#composerLockTxt').textContent = !ch ? 'Pick a channel to start chatting.'
      : ch.archived ? 'This channel is archived — it’s read-only.'
      : `Only admins can post in #${ch.name || ch.id}. Execs can read it here.`;
  } else input.placeholder = `Message #${ch.name || ch.id}`;
}

$('#composer').addEventListener('submit', async e => {
  e.preventDefault();
  const ch = curChannel(), text = input.value.trim();
  if (!text || !canPost(ch) || !S.profile) return;
  if (text.length > MAX_LEN) { toast(`Messages are limited to ${MAX_LEN} characters.`, 'error'); return; }
  input.value = ''; autosize();
  try {
    await F.addDoc(F.collection(db, 'channels', ch.id, 'messages'), {
      text, uid: S.profile.uid, senderName: S.profile.name, senderRole: S.profile.role, createdAt: F.serverTimestamp(),
    });
  } catch (err) {
    console.error(err);
    if (!input.value) { input.value = text; autosize(); }
    toast(err?.code === 'permission-denied' ? "You don't have permission to post here." : "Message didn't send. Try again.", 'error');
  }
});

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
      onchange: ev => { const v = ev.target.value.trim(); if (!v) { ev.target.value = m.name; return; } if (v !== m.name) guarded(() => F.updateDoc(F.doc(db, 'users', m.uid), { name: v }), 'Name updated.'); } });
    const roleSel = el('select', { 'aria-label': `Role for ${m.name}`, disabled: self,
      onchange: ev => {
        const v = ev.target.value;
        if (!confirm(`Change ${m.name} to ${v}?` + (v === 'admin' ? '\n\nAdmins can manage members, channels and announcements.' : ''))) { ev.target.value = m.role; return; }
        guarded(() => F.updateDoc(F.doc(db, 'users', m.uid), { role: v }), `${m.name} is now ${v}.`);
      } }, el('option', { value: 'exec', text: 'Exec', selected: m.role !== 'admin' }), el('option', { value: 'admin', text: 'Admin', selected: m.role === 'admin' }));
    const act = el('input', { type: 'checkbox', checked: !off, disabled: self, 'aria-label': `Active: ${m.name}`,
      onchange: ev => {
        const v = ev.target.checked;
        if (!v && !confirm(`Deactivate ${m.name}? They'll be signed out and unable to read or post until reactivated.`)) { ev.target.checked = true; return; }
        guarded(() => F.updateDoc(F.doc(db, 'users', m.uid), { active: v }), v ? `${m.name} reactivated.` : `${m.name} deactivated.`);
      } });
    pane.append(el('div', { class: 'row' + (off ? ' is-off' : '') },
      avatar(m.name, m.uid, 40),
      el('div', { class: 'row__main' }, name, el('span', { class: 'row__sub', text: m.email + (self ? ' · you' : '') })),
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
    const role = el('select', { 'aria-label': `Role for ${p.email}` }, el('option', { value: 'exec', text: 'Exec' }), el('option', { value: 'admin', text: 'Admin' }));
    pane.append(el('div', { class: 'row' },
      avatar(guess, p.uid, 40),
      el('div', { class: 'row__main' }, name, el('span', { class: 'row__sub', text: p.email })),
      el('div', { class: 'row__ctl' }, role,
        el('button', { class: 'btn btn--sm', type: 'button', text: 'Approve', onclick: () => {
          const n = name.value.trim(); if (!n) { name.focus(); return; }
          if (role.value === 'admin' && !confirm(`Make ${n} an admin?`)) return;
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
      el('p', { class: 'sec-note', text: 'Create channels, mark them admins-only (like #announcements), or archive ones you no longer need. Archived channels stay readable by admins and are hidden from execs. Channels are archived, never deleted.' }),
      el('form', { id: 'newChForm', class: 'formrow', autocomplete: 'off', onsubmit: onCreateChannel },
        el('label', { class: 'field' }, el('span', { text: 'Name' }), el('input', { id: 'newChName', type: 'text', required: true, maxlength: 30, placeholder: 'e.g. sponsors' })),
        el('label', { class: 'field' }, el('span', { text: 'Description (optional)' }), el('input', { id: 'newChDesc', type: 'text', maxlength: 140, placeholder: 'What is this channel for?' })),
        el('button', { class: 'btn btn--sm', type: 'submit', text: 'Create' }),
        el('label', { class: 'switch' }, el('input', { id: 'newChAdminOnly', type: 'checkbox' }), 'Only admins can post')),
      el('div', { id: 'chanRows' }));
  }
  const rows = $('#chanRows'); rows.replaceChildren();
  rows.style.display = 'grid'; rows.style.gap = '10px';
  for (const c of S.channels) {
    const onlyAdm = el('input', { type: 'checkbox', checked: !!c.adminOnly,
      onchange: ev => guarded(() => F.updateDoc(F.doc(db, 'channels', c.id), { adminOnly: ev.target.checked }), `#${c.name || c.id} is now ${ev.target.checked ? 'admins-only' : 'open to all execs'}.`) });
    rows.append(el('div', { class: 'row' + (c.archived ? ' is-off' : '') },
      el('span', { class: 'avatar c2', 'aria-hidden': 'true', style: '--s:40px' }, icon('i-hash')),
      el('div', { class: 'row__main' }, el('b', { text: '#' + (c.name || c.id) }), el('span', { class: 'row__sub', text: c.description || 'No description' })),
      el('div', { class: 'row__ctl' },
        el('label', { class: 'switch' }, onlyAdm, 'Admins post'),
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
