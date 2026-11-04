# ABSQU — Association Of Balkan Students at Queen's University

Website for the Association Of Balkan Students at Queen's University, plus an optional private **Exec area** (team chat) for the club's executive.

**Live site:** `https://<project-id>.web.app` (Firebase Hosting)  
**Exec area:** `https://<project-id>.web.app/exec/`  
**Instagram:** https://www.instagram.com/abs_qu/ · **Linktree:** https://linktr.ee/absqu  
**Email:** QueensABSQU@outlook.com

---

## Tech stack

- Plain HTML5, CSS3, vanilla JavaScript — **no framework, no build step**
- Fonts: Baloo 2 Bold (headings) + Poppins (body) via Google Fonts
- Public site: no libraries. Outside services: Google Fonts, [flagcdn](https://flagcdn.com) flag images, [Behold](https://behold.so) for the Instagram cards (optional, see `INSTAGRAM_SETUP.md`), and one read-only Firestore request (country flags) when the Team section scrolls into view
- Exec area: Firebase Authentication + Cloud Firestore (free **Spark** plan), loaded from Google's CDN **only on `/exec/`** — the public site never loads the Firebase SDK
- Hosting: Firebase Hosting, serving `/docs` (`firebase.json`)

## Brand

The site is **cream first, with red, blue and yellow** (no green, no black backgrounds); the opening hero slide is red-led. Pages are warm cream (`--cream`), alternating with a slightly deeper cream (`--cream-2`); cards and inputs are white.

| Colour | Hex | | Colour | Hex |
|---|---|---|---|---|
| Warm Cream (main) | `#FFF8ED` | | Sun Gold (yellow) | `#F2C230` |
| Balkan Red | `#C8102E` | | White (cards, inputs) | `#FFFFFF` |
| Balkan Blue | `#0F4C81` | | Ink (text, navy) | `#0D2B4C` / `#111111` |

The logo (`docs/images/logo.jpg`) is only ever placed on white or cream, never recoloured or stretched. Tokens live at the top of `docs/style.css` (`:root`). The first slide (hero) is red in the middle with blue, yellow and white gathering around the edges; the "ABSQU" title is white. Everything below it is cream-first.

## Project structure

```
balkan-club/
├── README.md
├── FIREBASE_SETUP.md              ← click-by-click Firebase guide (start here for the Exec area)
├── INSTAGRAM_SETUP.md             ← connect the live Instagram cards (Behold)
├── TEST_CHECKLIST.md              ← manual QA list
├── firestore.rules                ← Firestore security rules (publish in the Firebase console)
├── firebase.json                  ← Hosting + Firestore rules config
├── netlify.toml                   ← legacy; not used
├── .gitignore                     ← ignores docs/firebase-config.js
└── docs/                          ← site root (what gets deployed)
    ├── index.html                 ← the whole public single-page site
    ├── style.css
    ├── script.js
    ├── firebase-config.example.js ← template (committed)
    ├── firebase-config.js         ← your real config (NOT committed)
    ├── exec/
    │   ├── index.html             ← login + team chat + Co-President tools
    │   ├── exec.css
    │   └── exec.js
    └── images/
        ├── logo.jpg
        ├── hero-banner.jpg  (+ hero-banner-900.jpg for phones)
        └── …
```

## Local development

```bash
python3 -m http.server 8000 --directory docs
# public site:  http://localhost:8000
# exec area:    http://localhost:8000/exec/   (needs docs/firebase-config.js — see FIREBASE_SETUP.md)
```

## Updating content

Everything public is in `docs/index.html`; find sections by their `id`:

| Section | `id` | Notes |
|---|---|---|
| Hero | `home` | Name, motto, CTA buttons |
| Flags ribbon | — | Under the hero; two identical lists (the 2nd is for the seamless loop — edit both) |
| About + countries | `about`, `countries` | Stats tiles use `data-count="…"` |
| What we do | `pillars` | The three pillars |
| Events | `events` | Three cards: `event--red / blue / green` |
| **Team** | `team` | One `<article class="dept">` per group; co-presidents are `.president` |
| Gallery + Instagram | `gallery`, `instagram` | See below |
| Contact | `contact` | Email, Instagram, Linktree |

**Changing the team next year:** edit the `#team` section — names, initials (inside `.avatar`), and the count in `.dept__head span`. Then update who has a login (see *Exec area* below).

**Adding gallery photos:** drop the image in `docs/images/`, copy a `<figure class="shot">…</figure>` block in the `.gallery` grid (use `shot--hero` for a big tile, plain `shot` for a small one), and set `src`, `alt` and the caption.

**Instagram posts:** shown automatically from a Behold feed — paste its URL into `data-feed` on `#feed` (steps in [INSTAGRAM_SETUP.md](INSTAGRAM_SETUP.md)). With no feed URL, a "Follow @abs_qu" card shows.

**Team flags:** each name in `#team` has its flag in the HTML (`<span class="flags">` right after the `.pname`). Execs can also pick their own in the exec area; that replaces the default (matched by name, so keep names spelled the same as in the exec Members list). To change someone's default, edit the `<img>` after their name: `src`, `srcset` (`flagcdn.com/w40/<code>.png`) and `alt`.

## Exec area

A private, optional team area at `/exec/` — login is never required to view the public site.

- **Login:** Firebase Email/Password. Accounts are created by you in the Firebase console; there's no public sign-up.
- **Roles:** Co-Presidents (stored as `admin`; Philip Radeff and Alexander Jakov) and `exec` (everyone else; they just read and post in the channels), stored in Firestore at `users/{uid}` as `{ name, email, role, active }`. Enforced by `firestore.rules` on the server.
- **Chat:** channels only — no direct messages. Club: `#announcements` (Co-President-post-only), `#general`, `#resources`; Teams: `#events`, `#marketing`, `#finance`, `#student-reps`, `#communications`. Real-time via Firestore listeners; sender name, flag and timestamp on every message.
- **Files & photos** in every channel you can post in (paperclip, drag-and-drop or paste): photos are shrunk automatically, other files up to 2 MB. Stored in Firestore (not Cloud Storage, which would need the paid plan).
- **Country prompt:** on first login each person is asked where they're from (up to two flags) — shown on the public Team section and in chat.
- **Co-Presidents** can create/archive channels, view members, change roles, deactivate members, approve new sign-ins, post announcements and delete messages.
- **Config is never committed:** `docs/firebase-config.js` is gitignored; it exists only on your computer and is uploaded by `firebase deploy`. If it's absent, the public site is unaffected and `/exec/` just says it isn't switched on.

Full walkthrough: **[FIREBASE_SETUP.md](FIREBASE_SETUP.md)**. QA list: **[TEST_CHECKLIST.md](TEST_CHECKLIST.md)**.

## Deployment

The site is hosted on **Firebase Hosting** (free Spark plan) — see `firebase.json`. After the one-time setup in [FIREBASE_SETUP.md](FIREBASE_SETUP.md):

```bash
firebase deploy                  # website + Firestore rules
firebase deploy --only hosting   # website only
```

Commit changes to git as usual (`git add . && git commit && git push`); pushing does **not** deploy — `firebase deploy` does.
