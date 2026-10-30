# Firebase setup — ABSQU Exec area

A click-by-click guide. It assumes you have **never opened the Firebase console**. Budget about 30–40 minutes, most of it creating the 15 accounts.

> **Cost:** everything here fits Firebase's free **Spark** plan. You will never be asked for a credit card. If a screen ever asks you to "Upgrade" or "Add billing", stop and don't — you don't need it.
>
> **Console wording:** Google redesigns the console from time to time. Button names below are accurate to the best of my knowledge but may be worded slightly differently. The *structure* (Authentication → Users, Firestore → Data / Rules) stays the same.

---

## What you're setting up (30-second version)

| Piece | What it does |
|---|---|
| **Firebase Authentication** (Email/Password) | The login. You create each person's account yourself; nobody can sign themselves up into the team area. |
| **Firestore database** | Stores each person's role (`users` collection), the chat channels and the messages — live-updating. |
| **Security rules** (`firestore.rules`) | The server-side lock. Even if someone edited the website code in their browser, the database still refuses anything their role doesn't allow. |
| **Config file** | A small file telling the website *which* Firebase project to talk to. It is **never committed to git**. |

### How roles work (and why)

Roles are stored in Firestore: one document per person at `users/<their UID>` with four fields:

```
name    (string)   "Philip Radeff"
email   (string)   "philip@example.com"
role    (string)   "admin"  or  "exec"
active  (boolean)  true     (false = deactivated, locked out immediately)
```

I chose this over Firebase *custom claims* because setting custom claims requires running server code (Cloud Functions), which requires the paid Blaze plan. A Firestore role document is free, can be changed by an admin from inside the site, and is enforced by `firestore.rules` on every single read and write.

- **admin** → Philip Radeff and Alexander Jakov only.
- **exec** → everyone else.

---

## Part 1 — Create the Firebase project

1. Go to **https://console.firebase.google.com** and sign in with a Google account. Use one the club will keep long-term (a shared club Gmail is ideal — if only your personal account owns it, hand-over later is harder).
2. Click **Create a project** (or **Add project**).
3. **Name:** type `absqu-exec` → click **Continue**.
4. **Google Analytics:** switch the toggle **off** (you don't need it) → click **Create project**.
5. Wait ~30 seconds for "Your new project is ready" → click **Continue**.

## Part 2 — Register the web app and grab the config

1. On the project's home page ("Project Overview") click the **`</>`** icon (labelled **Web**).
2. **App nickname:** `ABSQU site`.
3. **Do NOT tick** "Also set up Firebase Hosting" (the site lives on GitHub Pages).
4. Click **Register app**.
5. You'll see a code block containing `const firebaseConfig = { apiKey: "...", authDomain: "...", projectId: "...", storageBucket: "...", messagingSenderId: "...", appId: "..." };`
   **Leave this tab open** (or copy the six values into a note) — you'll paste them in Part 7. You can always get them back later: ⚙️ **gear icon → Project settings → General → scroll to "Your apps"**.
6. Click **Continue to console**.

## Part 3 — Turn on Email/Password login

1. Left sidebar → **Build** → **Authentication** → click **Get started**.
2. Open the **Sign-in method** tab.
3. Click **Email/Password**.
4. Switch the **first** toggle ("Email/Password") to **Enabled**. Leave "Email link (passwordless sign-in)" **off**.
5. Click **Save**.
6. Still in Authentication, open **Settings → Authorized domains → Add domain** and add `philipr8.github.io`. (`localhost` is already there for local testing.)

## Part 4 — Create the Firestore database

1. Left sidebar → **Build** → **Firestore Database** → **Create database**.
2. **Edition:** choose **Standard** if asked. **Database ID:** leave as `(default)`.
3. **Location:** pick **`northamerica-northeast2` (Toronto)** — closest to Kingston. (`northamerica-northeast1` Montréal is also fine.) ⚠️ You **cannot change this later**.
4. Click **Next**.
5. **Security rules:** choose **Start in production mode** (this locks everything until you publish the real rules in Part 5).
6. Click **Create**. Wait until the empty database screen appears.

## Part 5 — Publish the security rules

1. In **Firestore Database**, open the **Rules** tab.
2. Click inside the editor, select everything (`Cmd+A` / `Ctrl+A`) and **delete** it.
3. Open **`firestore.rules`** from this repo (in the repo root), copy the entire file and paste it into the editor.
4. Click **Publish**. Confirm the "Last published" time updates and there are no red error banners.

> Do this again any time `firestore.rules` changes in the repo.

What these rules guarantee (checked by an automated suite of 73 tests before this was handed over):

- Nobody who is signed out can read or write anything.
- A signed-in account with **no active profile** can read/write nothing (it can only ask an admin for approval).
- **Execs** can read every channel and post in every channel **except** any channel marked `adminOnly` (that's `#announcements`). They cannot spoof another person's name or role.
- **Admins** can additionally post announcements, create/archive channels, list members, change roles, deactivate members, delete messages and approve new members.
- Admins cannot change their *own* role or deactivate *themselves* (so you can't lock yourself out by accident).

## Part 6 — Create the 15 accounts and assign roles

### 6a. Create the accounts

For **each** person in the table:

1. Left sidebar → **Authentication** → **Users** tab → **Add user**.
2. Type their **email** and a **temporary password** (min. 6 characters; use something strong and unique for each person).
3. Click **Add user**.
4. In the Users list, find that person's row and **copy the "User UID"** (a ~28-character string like `kP3x…`). You'll need it in 6b for the two admins.

| # | Name | Group | Role |
|---|------|-------|------|
| 1 | Philip Radeff | Co-President | **admin** |
| 2 | Alexander Jakov | Co-President | **admin** |
| 3 | Monique Popazu | Marketing | exec |
| 4 | Rovena Qosaj | Marketing | exec |
| 5 | Anastasija Dimovska | Marketing | exec |
| 6 | Nicole Terzieva | Events | exec |
| 7 | Daris Lohja | Events | exec |
| 8 | Katarina Trutina | Events | exec |
| 9 | Angela Projkovska | Finance | exec |
| 10 | Sara Lipo | Finance | exec |
| 11 | Emma Stavre | Finance | exec |
| 12 | Alina Riabova | Student Reps | exec |
| 13 | Ivan Hodgson | Student Reps | exec |
| 14 | Teigan Minas | Communications & Outreach | exec |
| 15 | Maria Diakoloukas | Communications & Outreach | exec |

> That's 2 admins + 13 exec accounts = 15 people. Use each person's real email so the **"Forgot password?"** link on the login page works for them. Send each person their temporary password privately (not in a group chat with outsiders), and tell them to use "Forgot password?" to choose their own.

### 6b. Give the two admins their profile (by hand, once)

You create the **two admin** profiles manually — this is the one thing the website can't do for you, because admins are what unlock everything else.

1. Left sidebar → **Firestore Database** → **Data** tab.
2. Click **Start collection**.
3. **Collection ID:** `users` (exactly, lowercase) → **Next**.
4. **Document ID:** paste **Philip Radeff's User UID** (do *not* use "Auto-ID").
5. Add these four fields (click **Add field** for each):

   | Field | Type | Value |
   |---|---|---|
   | `name` | string | `Philip Radeff` |
   | `email` | string | Philip's login email |
   | `role` | string | `admin` |
   | `active` | **boolean** | `true` |

6. Click **Save**.
7. Back on the `users` collection click **Add document** and repeat for **Alexander Jakov** (his UID, `role` = `admin`).

> ⚠️ Common slips: `active` must be the **boolean** `true` (pick the type from the dropdown), not the text "true". `role` must be lower-case `admin`. The Document ID must be the UID, not the email.

### 6c. Give the 13 execs their role

**Option A — recommended (about 10 seconds each, inside the website):**

1. Each exec visits the exec login page and signs in once with their temporary password. They'll see **"Waiting for approval"**. That sends a request to the admins.
2. Sign in yourself as Philip → click **Admin panel** (bottom-left) → **Approvals** tab.
3. For each person: check their **display name** (it's guessed from their email — fix it to e.g. `Nicole Terzieva`), leave the role on **Exec**, click **Approve**.
4. Their "Waiting for approval" screen unlocks by itself within a second or two — no refresh needed.

**Option B — all by hand in the console:** repeat the steps in 6b for each person with `role` = `exec`. Same four fields, same rules (UID as Document ID, `active` boolean `true`).

### 6d. First sign-in as admin creates the channels

The first time an **admin** signs in, the site automatically creates `#announcements` (admins-post-only), `#general`, `#events`, `#marketing` and `#finance`. You don't create these by hand. Admins can add/archive more later from **Admin panel → Channels**.

## Part 7 — Put the config in the project

### 7a. For testing on your own computer

1. In the repo, copy **`docs/firebase-config.example.js`** to **`docs/firebase-config.js`**.
2. Open the new file and replace each `YOUR_...` placeholder with the matching value from Part 2 (keep the quotes and commas).
3. Run the site locally:
   ```bash
   python3 -m http.server 8000 --directory docs
   ```
4. Open **http://localhost:8000/exec/** and sign in.

`docs/firebase-config.js` is listed in `.gitignore`, so git will never pick it up. (Check with `git status` — it should not appear.)

### 7b. For the live GitHub Pages site (no key in the repo)

A static site can't read a file that isn't in the repo — so a GitHub Action writes the config file **at deploy time** from a secret. This is already set up in `.github/workflows/pages.yml`. You do three one-time things in GitHub:

1. **Add the secret.** Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
   - **Name:** `FIREBASE_CONFIG_JSON`
   - **Secret:** the config as one line of JSON — note the quoted keys:
     ```json
     {"apiKey":"AIza...","authDomain":"absqu-exec.firebaseapp.com","projectId":"absqu-exec","storageBucket":"absqu-exec.firebasestorage.app","messagingSenderId":"123456789","appId":"1:123456789:web:abc123"}
     ```
   - Click **Add secret**.
2. **Switch Pages to deploy from Actions.** Repo → **Settings** → **Pages** → **Build and deployment** → **Source** → choose **GitHub Actions**.
3. **Deploy.** Push to `main` (or go to the **Actions** tab → **Deploy to GitHub Pages** → **Run workflow**). When the run turns green, visit **https://philipr8.github.io/balkan-club/exec/**.

> **Until you do step 2**, the old "deploy from `/docs` on `main`" setting stays in effect: the public site updates normally, but the exec area will say *"isn't switched on yet"* because the config file isn't in the deployed files. Nothing breaks.

#### "Is the config really secret?" — an honest note

A Firebase **web** config (the `apiKey` etc.) is an *identifier*, not a password. Any website that uses Firebase from the browser exposes it to visitors — that's unavoidable and normal. What actually protects your data is **(1)** the security rules and **(2)** that accounts only exist if you created them. Keeping it out of git is good hygiene (and what you asked for), but don't panic if someone sees it in their browser's dev tools.

For extra protection (optional, 2 minutes): Google Cloud Console → **APIs & Services → Credentials** → click the "Browser key" → **Application restrictions → Websites** → add `https://philipr8.github.io/*` and `http://localhost:8000/*` → Save.

---

## Day-to-day

| I want to… | Do this |
|---|---|
| **Add a new exec** | Authentication → Users → **Add user**. They sign in once, then Admin panel → **Approvals** → Approve. |
| **Remove someone / end of term** | Admin panel → **Members** → switch **Active** off. They're signed out and locked out immediately. (Delete their account in Authentication → Users if you want it gone for good.) |
| **Change someone's role** | Admin panel → **Members** → use the role dropdown (you'll be asked to confirm). It takes effect on their screen instantly. |
| **Post an announcement** | Admins only: open `#announcements` and type. Execs see it read-only. |
| **Reset a password** | The person clicks **Forgot password?** on the login page, *or* Authentication → Users → ⋮ on their row → **Reset password**. |
| **Make a new channel** | Admin panel → **Channels** → name it, tick *Only admins can post* if it's announcement-style → **Create**. |

## Troubleshooting

| What you see | Likely cause / fix |
|---|---|
| *"Exec area isn't switched on yet"* | `docs/firebase-config.js` is missing or still has `YOUR_…` placeholders (local), or the GitHub secret / Pages "GitHub Actions" source isn't set (live). Redo Part 7. |
| *"Couldn't read your profile — the Firestore security rules may not be published yet"* | Redo **Part 5** and click **Publish**. |
| *"Couldn't log you in. Please try again."* | Usually Email/Password isn't enabled (Part 3), or the config values are from a different project. |
| **"Incorrect email or password."** | Correct behaviour for a wrong password *or* an unknown email (deliberately the same message). Reset the password in Authentication → Users. |
| Stuck on **"Waiting for approval"** | They have an account but no profile. An admin approves them (Part 6c), or you add their `users/<UID>` document by hand. |
| Signed in but no channels | An **admin** needs to sign in once so the default channels get created. |
| Someone says "I can't post" in `#announcements` | Working as designed — only admins post there. |
| An admin tool vanished | They've been changed to *exec* (or deactivated). Check Admin panel → Members. |
| Strangers in the Approvals list | Email/Password sign-up can't be fully switched off on the free plan, so anyone could create an account; rules give those accounts **zero access**, and the worst outcome is a harmless request in Approvals. Click **Dismiss**. Never approve an email you don't recognise. |

## Optional: test locally without touching your real project

The app can talk to the Firebase **Emulator Suite** instead of the cloud. In `docs/firebase-config.js` add `useEmulators: true` and run `npx firebase-tools emulators:start --only auth,firestore` (needs Node and Java). Don't set `useEmulators` in the real config — it would point the live site at `127.0.0.1`.
