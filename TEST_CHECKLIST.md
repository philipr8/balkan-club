# Test checklist — ABSQU site + Exec area

Work through this after setup (`FIREBASE_SETUP.md`) and again after any change to the site, `exec/` code, or `firestore.rules`. Tick each box. You need **two different browsers or profiles** (e.g. Chrome + a private window, or Chrome + Safari) for the real-time tests, and one admin + one exec account.

Test on the live URL **https://philipr8.github.io/balkan-club/** and, if you've changed code, locally too (`python3 -m http.server 8000 --directory docs`).

---

## 1. Public site works with NO login

- [ ] Open the site in a private window. The page loads; no login prompt appears anywhere.
- [ ] Scroll the whole page: hero expands, flag ribbon scrolls, About, What we do, Events, Team, Gallery, Contact all appear.
- [ ] Team section shows **exactly** the 2026–27 roster, grouped: Co-Presidents (Philip Radeff, Alexander Jakov); Marketing (Monique Popazu, Rovena Qosaj, Anastasija Dimovska); Events (Nicole Terzieva, Daris Lohja, Katarina Trutina); Finance (Angela Projkovska, Sara Lipo, Emma Stavre); Student Reps (Alina Riabova, Ivan Hodgson); Communications & Outreach (Teigan Minas, Maria Diakoloukas).
- [ ] **Thomas Veljanovski** and **Emily Staroselski** appear nowhere (try `Ctrl/Cmd+F` for each).
- [ ] Motto "Because at ABSQU, everyone is family!" shows in the hero and the contact section; all 11 countries are listed.
- [ ] Links work: `@abs_qu` → https://www.instagram.com/abs_qu/ · `QueensABSQU@gmail.com` opens a mail draft · `linktr.ee/absqu` opens Linktree.
- [ ] Old hash links still land correctly: `…/balkan-club/#about`, `#countries`, `#events`, `#team`, `#gallery`, `#instagram`, `#contact`.
- [ ] Phone (or browser dev tools at 390 px wide): no sideways scrolling, menu button opens a full-screen menu, text is readable.
- [ ] Dev tools → **Network** tab, reload: **no requests** to `gstatic.com/firebasejs`, `firestore.googleapis.com` or `identitytoolkit` on the public page (Firebase only loads on `/exec/`).
- [ ] The nav shows an **Exec Login** button.

## 2. Login & logout

- [ ] Click **Exec Login** → the login page (`/exec/`) opens.
- [ ] Log in as an **exec** → team area opens; the top bar shows their **name** and an **EXEC** badge.
- [ ] Refresh the page → still logged in (session persists).
- [ ] Close the tab, reopen `/exec/` → still logged in.
- [ ] Go back to the public site → the nav button now shows their first name + role instead of "Exec Login".
- [ ] Click **Log out** → returns to the login screen; the nav button on the public site goes back to "Exec Login"; refreshing `/exec/` stays on the login screen.
- [ ] Log in as an **admin** → badge says **ADMIN** (gold) and an **Admin panel** button is visible in the sidebar.
- [ ] While logged out, open `/exec/#general` directly → you get the login form, never any messages.

## 3. Wrong password & bad logins

- [ ] Correct email + **wrong password** → red message "Incorrect email or password." ; password box is cleared; you stay on the login screen.
- [ ] **Unknown email** + any password → the **same** message (it must not reveal whether the email exists).
- [ ] Empty fields → "Enter your email and password."
- [ ] Try several wrong passwords in a row → Firebase may eventually show "Too many attempts…" (its built-in rate limit, timing varies); a correct password works again after a short wait or via **Forgot password?**.
- [ ] **Forgot password?** with an email typed → neutral "If that email has an exec account, a reset link is on its way." and the email arrives (check spam).
- [ ] A **deactivated** member (Admin panel → Members → Active off) trying to log in is bounced with "…has been deactivated".
- [ ] An account that exists in Authentication but has **no** `users` profile sees "Waiting for approval" — and **no** channels or messages.

## 4. Exec is blocked from admin actions

Log in as an **exec** and confirm:

- [ ] **No Admin panel** button anywhere.
- [ ] In `#announcements`: messages are visible, but the message box is replaced by "Only admins can post in #announcements…". You cannot type or send.
- [ ] No delete (trash) icon appears when hovering messages.
- [ ] Can read and post in `#general`, `#events`, `#marketing`, `#finance`.
- [ ] *(Optional, technical)* This is enforced by the database, not just hidden in the UI: in dev tools → Elements, un-hide the message box in `#announcements` and try to send as an exec — you should get a red "You don't have permission to post here" toast and the message must never appear.
- [ ] Open the URL `/exec/#nonexistent-channel` → falls back to a real channel, no error.

## 5. Admin-only announcement posting

Log in as an **admin**:

- [ ] Open `#announcements` → the message box is available (lock tag says "Admins post"). Post "Test announcement".
- [ ] It appears with your name, an **ADMIN** badge and a time.
- [ ] Log in as an exec in the other browser → the announcement is visible there, read-only.
- [ ] Admin panel → **Channels** → create `#sponsors` (leave "Only admins can post" off) → exec can see and post in it. Toggle "Admins post" on → exec's message box turns into the read-only notice **live**.
- [ ] Archive `#sponsors` → it disappears from the exec's list (admins still see it under "Archived", read-only).
- [ ] Admin panel → **Members**: change an exec to admin (confirm dialog) → on *their* screen the Admin panel button and admin badge appear immediately; change back → they disappear.
- [ ] Deactivate a logged-in exec → on their screen they are signed out within seconds with the deactivation notice.
- [ ] You **cannot** change your own role or deactivate yourself (the controls are greyed out on your own row).
- [ ] **Approvals** tab: have a brand-new account sign in → it appears here → Approve → their screen unlocks without a refresh.
- [ ] Delete a message as admin (hover → trash → confirm) → it disappears for everyone.

## 6. Real-time messaging across two sessions

Browser A = admin, Browser B = exec (different browsers/profiles, same channel e.g. `#general`):

- [ ] A types a message and presses **Enter** → it appears in B within ~1 second **without refreshing**.
- [ ] B replies → appears in A the same way.
- [ ] Every message shows the **sender's name** and a **timestamp**; admin messages carry the ADMIN badge.
- [ ] **Shift+Enter** inserts a new line; **Enter** sends.
- [ ] Pasted `https://…` links become clickable and open in a new tab.
- [ ] Switching channels in A doesn't disturb B; a message posted in `#events` doesn't show in `#general`.
- [ ] Messages containing `<script>` or HTML show as plain text (type `<b>hi</b>` — it must display literally).
- [ ] On a phone: the ☰ button opens the channel list; the keyboard doesn't hide the message box; the send button is visible.

## 7. Firebase config is NOT committed

Run these in the repo root; each should behave as described:

```bash
git check-ignore -v docs/firebase-config.js      # prints the .gitignore rule that ignores it
git ls-files | grep -i firebase-config           # only: docs/firebase-config.example.js
git log --all --oneline -- docs/firebase-config.js   # prints nothing (never committed)
git grep -n -E "AIza[0-9A-Za-z_-]{35}"           # prints nothing (no real API key in any tracked file)
git status --short                               # firebase-config.js must NOT be listed, even after you create it
```

- [ ] All five behave as described.
- [ ] `docs/firebase-config.example.js` contains only `YOUR_…` placeholders.
- [ ] GitHub → repo → **Settings → Secrets and variables → Actions** shows `FIREBASE_CONFIG_JSON`.
- [ ] Rename your local `docs/firebase-config.js` away and reload `/exec/` locally → shows "Exec area isn't switched on yet" and the **public site still works**. Rename it back.
- [ ] On the live site, view source of `/exec/exec.js` — it contains no keys (the config is only in the separately generated `firebase-config.js`).

---

### What was already tested automatically (before hand-over)

Against the Firebase emulators — not part of the repo, so they don't add any dependency:

- **73 security-rule checks** (all pass): signed-out, exec, admin, deactivated, and profile-less accounts, including attack attempts — spoofing another sender's name/role/uid, backdating timestamps, extra fields, 2,000+ character messages, self-promotion to admin, creating one's own profile, reading others' profiles, posting in archived/non-existent channels, editing/deleting messages, and renaming/deleting channels.
- **51 end-to-end browser checks** (all pass): login/wrong password/no account enumeration, first-run channel setup, announcements read-only for execs, real-time delivery between two live sessions, persistence across reload, logout, admin panel (create/archive channel, approve, role change, deactivate — each reflected live on the other person's screen), and mobile layout.

Not tested (needs your real accounts/inboxes): the password-reset email, the live GitHub Pages deploy with your secret, and the look on your own phone/browsers.
